"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import { getBookingById } from "./data";
import type { BookingStatus } from "./types";

// Only these forward-only transitions are allowed via the admin UI.
// Payment lifecycle transitions (confirmed, refunded) happen via Pesapal IPN.
const VALID_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  confirmed: ["checked_in", "no_show", "cancelled"],
  checked_in: ["checked_out", "cancelled"]
};

const MAX_ROOM_TYPE_SLUG_LENGTH = 120;
const MAX_GUEST_NAME_LENGTH = 120;
const MAX_GUEST_EMAIL_LENGTH = 200;
const MAX_GUEST_PHONE_LENGTH = 40;
const MAX_SPECIAL_REQUESTS_LENGTH = 1000;
const MAX_NOTES_LENGTH = 2000;
const MAX_PAYMENT_REFERENCE_LENGTH = 200;

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function validateBookingTextFields(input: {
  roomTypeSlug: string;
  guestFullName: string;
  guestPhone: string;
  guestEmail: string | null;
  specialRequests: string | null;
  notes: string | null;
}): string | null {
  if (input.roomTypeSlug.length > MAX_ROOM_TYPE_SLUG_LENGTH) return "Please select a valid room type.";
  if (input.guestFullName.length > MAX_GUEST_NAME_LENGTH) return "Please enter a shorter guest name.";
  if (input.guestPhone.length > MAX_GUEST_PHONE_LENGTH) return "Please enter a shorter phone number.";
  if ((input.guestEmail?.length ?? 0) > MAX_GUEST_EMAIL_LENGTH) return "Please enter a shorter email address.";
  if ((input.specialRequests?.length ?? 0) > MAX_SPECIAL_REQUESTS_LENGTH) {
    return "Please keep special requests under 1000 characters.";
  }
  if ((input.notes?.length ?? 0) > MAX_NOTES_LENGTH) return "Please keep notes under 2000 characters.";
  return null;
}

export async function updateBookingStatusAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  const id = formData.get("id") as string;
  const newStatus = formData.get("status") as BookingStatus;

  if (newStatus === "cancelled" && session.role === "staff") {
    throw new Error("Only admin or superadmin can cancel bookings.");
  }

  const sql = getSql();
  const beforeBooking = await getBookingById(id);
  if (!beforeBooking) throw new Error("Booking not found.");

  const allowed = VALID_TRANSITIONS[beforeBooking.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot transition from ${beforeBooking.status} to ${newStatus}.`);
  }

  await sql`UPDATE bookings SET status = ${newStatus} WHERE id = ${id}::uuid`;

  // Auto-post accommodation charge on first check-in (idempotent: skips if one already exists)
  if (newStatus === "checked_in") {
    await sql`
      INSERT INTO folio_charges (booking_id, description, amount_ugx, category, posted_by)
      SELECT
        b.id,
        rt.title || ' - ' ||
          (b.check_out::date - b.check_in::date)::text ||
          ' night' ||
          CASE WHEN (b.check_out::date - b.check_in::date) = 1 THEN '' ELSE 's' END,
        b.quoted_total_ugx,
        'accommodation',
        ${session.userId}::uuid
      FROM bookings b
      JOIN room_types rt ON rt.id = b.room_type_id
      WHERE b.id = ${id}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM folio_charges
          WHERE booking_id = ${id}::uuid AND category = 'accommodation'
        )
    `;

    // Record the online prepayment as a folio payment so the prepaid room
    // lands in Total Paid (not Balance Due). The room is always paid in full
    // before the booking is confirmed, so quoted_total_ugx is the amount paid.
    // Idempotent: skips if the prepayment (the sole 'pesapal' payment) exists.
    await sql`
      INSERT INTO folio_payments (booking_id, amount_ugx, method, reference, recorded_by, recorded_at)
      SELECT
        b.id,
        b.quoted_total_ugx,
        'pesapal',
        b.payment_reference,
        ${session.userId}::uuid,
        COALESCE(b.paid_at, now())
      FROM bookings b
      WHERE b.id = ${id}::uuid
        AND b.paid_at IS NOT NULL
      ON CONFLICT (booking_id) WHERE method = 'pesapal' DO NOTHING
    `;
  }

  // A checked-out room immediately enters the housekeeping attention queue.
  // The physical assignment is retained as stay history, but no longer blocks
  // future assignments because checked_out is not an occupying status.
  if (newStatus === "checked_out") {
    await sql`
      UPDATE room_units ru
      SET housekeeping_status = 'dirty'
      FROM bookings b
      WHERE b.id = ${id}::uuid
        AND b.room_unit_id = ru.id
    `;
  }

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: `booking.${newStatus}`,
    entityType: "booking",
    entityId: id,
    summary:
      newStatus === "checked_in"
        ? `Checked in ${beforeBooking.reference}${beforeBooking.room_unit_name ? ` into ${beforeBooking.room_unit_name}` : ""}.`
        : newStatus === "checked_out"
          ? `Checked out ${beforeBooking.reference}.`
          : `${beforeBooking.reference} changed status to ${newStatus.replaceAll("_", " ")}.`,
    context: {
      bookingId: id,
      reference: beforeBooking.reference,
      fromStatus: beforeBooking.status,
      toStatus: newStatus,
      roomTypeTitle: beforeBooking.room_type_title,
      roomUnitName: beforeBooking.room_unit_name,
      accommodationChargePosted: newStatus === "checked_in",
      prepaymentRecorded: newStatus === "checked_in" && beforeBooking.total_paid_ugx > 0
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/front-desk");
  revalidatePath("/bookings");
  revalidatePath("/housekeeping");
}

export type CreateStaffBookingResult =
  | { ok: true; bookingId: string; reference: string }
  | { ok: false; error: string };

// Staff-created (walk-in / phone) booking. Created as `confirmed` directly —
// no Pesapal, no inventory hold. Settled at the desk via the folio.
// Online-only: the RPC takes a FOR UPDATE lock on room_types.
export async function createStaffBookingAction(
  formData: FormData
): Promise<CreateStaffBookingResult> {
  const session = await requireApprovedAdminRole();

  const roomTypeSlug = String(formData.get("roomTypeSlug") ?? "").trim();
  const checkIn = String(formData.get("checkIn") ?? "").trim();
  const checkOut = String(formData.get("checkOut") ?? "").trim();
  const guestsAdults = Math.max(1, parseInt(String(formData.get("guestsAdults") ?? "1"), 10) || 1);
  const guestsChildren = Math.max(0, parseInt(String(formData.get("guestsChildren") ?? "0"), 10) || 0);
  const guestFullName = String(formData.get("guestFullName") ?? "").trim();
  const guestPhone = String(formData.get("guestPhone") ?? "").trim();
  const guestEmail = String(formData.get("guestEmail") ?? "").trim().toLowerCase() || null;
  const specialRequests = String(formData.get("specialRequests") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const groupId = String(formData.get("groupId") ?? "").trim() || null;
  const agreedRoomPrice = Math.round(
    Number(String(formData.get("agreedRoomPriceUgx") ?? "0").replace(/[,\s]/g, ""))
  );
  const depositAmount = Math.round(Number(String(formData.get("depositAmountUgx") ?? "0").replace(/[,\s]/g, "")));
  const depositMethod = String(formData.get("depositMethod") ?? "cash").trim();
  const depositReference = String(formData.get("depositReference") ?? "").trim() || null;

  if (!roomTypeSlug) return { ok: false, error: "Please select a room type." };
  if (!checkIn || !checkOut) return { ok: false, error: "Please select check-in and check-out dates." };
  if (checkIn >= checkOut) return { ok: false, error: "Check-out must be after check-in." };
  if (!guestFullName || guestFullName.length < 2) return { ok: false, error: "Please enter the guest's full name." };
  if (!guestPhone) return { ok: false, error: "Please enter a contact phone number." };
  if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return { ok: false, error: "Please enter a valid email address (or leave it blank)." };
  }
  if (groupId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId)) {
    return { ok: false, error: "Please select a valid group." };
  }
  const textError = validateBookingTextFields({
    roomTypeSlug,
    guestFullName,
    guestPhone,
    guestEmail,
    specialRequests,
    notes
  });
  if (textError) return { ok: false, error: textError };
  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    return { ok: false, error: "Deposit must be zero or a positive amount." };
  }
  if (!Number.isFinite(agreedRoomPrice) || agreedRoomPrice < 0) {
    return { ok: false, error: "Agreed room price must be zero or a positive amount." };
  }
  if ((depositReference?.length ?? 0) > MAX_PAYMENT_REFERENCE_LENGTH) {
    return { ok: false, error: "Deposit reference is too long." };
  }
  if (depositAmount > 0 && !["cash", "mpesa", "card", "transfer"].includes(depositMethod)) {
    return { ok: false, error: "Please select a valid deposit payment method." };
  }

  const sql = getSql();
  try {
    const quoteRows = (await sql`
      SELECT id::text, title, price_ugx
      FROM room_types
      WHERE slug = ${roomTypeSlug}
        AND is_published = true
      LIMIT 1
    `) as { id: string; title: string; price_ugx: string }[];

    if (!quoteRows[0]) {
      return { ok: false, error: "That room type is no longer available." };
    }

    const roomType = quoteRows[0];
    const quotedTotal = Number(roomType.price_ugx) * nightsBetween(checkIn, checkOut);
    if (agreedRoomPrice > quotedTotal) {
      return { ok: false, error: "Agreed room price cannot be greater than the standard room total." };
    }
    const finalRoomPrice = agreedRoomPrice > 0 ? agreedRoomPrice : quotedTotal;
    if (depositAmount > finalRoomPrice) {
      return { ok: false, error: "Deposit cannot be greater than the final room price." };
    }

    const groupRows =
      groupId
        ? ((await sql`
            SELECT id::text, reference, group_name
            FROM reservation_groups
            WHERE id = ${groupId}::uuid
            LIMIT 1
          `) as { id: string; reference: string; group_name: string }[])
        : [];
    const bookingGroup = groupRows[0] ?? null;
    if (groupId && !bookingGroup) {
      return { ok: false, error: "That group could not be found." };
    }

    const rows = (await sql`
      WITH created AS (
        SELECT booking_id, reference, quoted_total_ugx
        FROM create_staff_booking_with_folio(
          ${roomTypeSlug}::text,
          ${checkIn}::date,
          ${checkOut}::date,
          ${guestsAdults}::int,
          ${guestsChildren}::int,
          ${guestFullName}::text,
          ${guestPhone}::text,
          ${guestEmail}::text,
          ${specialRequests}::text,
          ${notes}::text,
          ${agreedRoomPrice > 0 ? agreedRoomPrice : null}::bigint,
          ${session.userId}::uuid
        )
      ),
      grouped AS (
        UPDATE bookings b
        SET group_id = ${groupId}::uuid
        FROM created c
        WHERE b.id = c.booking_id
          AND ${groupId}::uuid IS NOT NULL
        RETURNING b.id
      ),
      deposit_payment AS (
        INSERT INTO folio_payments (booking_id, amount_ugx, method, reference, recorded_by)
        SELECT
          c.booking_id,
          ${depositAmount}::bigint,
          ${depositMethod},
          ${depositReference},
          ${session.userId}::uuid
        FROM created c
        WHERE ${depositAmount}::bigint > 0
        RETURNING booking_id
      )
      SELECT
        c.booking_id::text,
        c.reference,
        c.quoted_total_ugx,
        (SELECT count(*) FROM deposit_payment) AS deposit_payment_count,
        (SELECT count(*) FROM grouped) AS grouped_count
      FROM created c
    `) as { booking_id: string; reference: string; quoted_total_ugx: string }[];

    if (!rows[0]) return { ok: false, error: "Booking could not be created. Please try again." };

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "booking.created",
      entityType: "booking",
      entityId: rows[0].booking_id,
      summary: bookingGroup
        ? `Created booking ${rows[0].reference} for ${guestFullName} under group ${bookingGroup.group_name}.`
        : `Created booking ${rows[0].reference} for ${guestFullName}.`,
      context: {
        bookingId: rows[0].booking_id,
        reference: rows[0].reference,
        roomTypeId: roomType.id,
        roomTypeTitle: roomType.title,
        roomTypeSlug,
        groupId,
        groupReference: bookingGroup?.reference ?? null,
        groupName: bookingGroup?.group_name ?? null,
        checkIn,
        checkOut,
        guestsAdults,
        guestsChildren,
        guestFullName,
        guestPhone,
        guestEmail,
        specialRequests,
        notes,
        quotedTotalUgx: quotedTotal,
        agreedRoomPriceUgx: agreedRoomPrice > 0 ? agreedRoomPrice : null,
        depositAmountUgx: depositAmount > 0 ? depositAmount : null,
        depositMethod: depositAmount > 0 ? depositMethod : null,
        depositReference
      }
    });

    if (bookingGroup) {
      await recordAuditLog({
        actorId: session.userId,
        actorEmail: session.email,
        action: "reservation_group.booking_attached",
        entityType: "reservation_group",
        entityId: bookingGroup.id,
        summary: `Attached booking ${rows[0].reference} to group ${bookingGroup.group_name}.`,
        context: {
          bookingId: rows[0].booking_id,
          bookingReference: rows[0].reference,
          groupId: bookingGroup.id,
          groupReference: bookingGroup.reference,
          groupName: bookingGroup.group_name
        }
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/front-desk");
    revalidatePath("/bookings");
    if (bookingGroup) revalidatePath(`/groups/${bookingGroup.id}`);

    return { ok: true, bookingId: rows[0].booking_id, reference: rows[0].reference };
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("availability") || msg.includes("available")) {
      return { ok: false, error: "Sorry, this room is not available for the selected dates." };
    }
    if (msg.includes("past")) {
      return { ok: false, error: "Check-in date cannot be in the past." };
    }
    if (msg.includes("not found")) {
      return { ok: false, error: "That room type is no longer available." };
    }
    console.error("create_staff_booking failed:", err);
    return { ok: false, error: "Booking could not be created. Please try again." };
  }
}

// Edit a confirmed or checked-in booking (room, dates, guests, contact).
// Online-only: the RPC locks room_types and re-checks availability,
// and reconciles the folio accommodation charge.
export async function modifyBookingAction(
  formData: FormData
): Promise<CreateStaffBookingResult> {
  const session = await requireApprovedAdminRole();

  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const roomTypeSlug = String(formData.get("roomTypeSlug") ?? "").trim();
  const checkIn = String(formData.get("checkIn") ?? "").trim();
  const checkOut = String(formData.get("checkOut") ?? "").trim();
  const guestsAdults = Math.max(1, parseInt(String(formData.get("guestsAdults") ?? "1"), 10) || 1);
  const guestsChildren = Math.max(0, parseInt(String(formData.get("guestsChildren") ?? "0"), 10) || 0);
  const guestFullName = String(formData.get("guestFullName") ?? "").trim();
  const guestPhone = String(formData.get("guestPhone") ?? "").trim();
  const guestEmail = String(formData.get("guestEmail") ?? "").trim().toLowerCase() || null;
  const specialRequests = String(formData.get("specialRequests") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!bookingId) return { ok: false, error: "Missing booking reference." };
  if (!roomTypeSlug) return { ok: false, error: "Please select a room type." };
  if (!checkIn || !checkOut) return { ok: false, error: "Please select check-in and check-out dates." };
  if (checkIn >= checkOut) return { ok: false, error: "Check-out must be after check-in." };
  if (!guestFullName || guestFullName.length < 2) return { ok: false, error: "Please enter the guest's full name." };
  if (!guestPhone) return { ok: false, error: "Please enter a contact phone number." };
  if (guestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return { ok: false, error: "Please enter a valid email address (or leave it blank)." };
  }
  const textError = validateBookingTextFields({
    roomTypeSlug,
    guestFullName,
    guestPhone,
    guestEmail,
    specialRequests,
    notes
  });
  if (textError) return { ok: false, error: textError };

  const sql = getSql();
  try {
    const beforeBooking = await getBookingById(bookingId);
    if (!beforeBooking) return { ok: false, error: "Booking not found." };

    const rows = (await sql`
      SELECT booking_id::text, reference, quoted_total_ugx
      FROM modify_booking(
        ${bookingId}::uuid,
        ${roomTypeSlug}::text,
        ${checkIn}::date,
        ${checkOut}::date,
        ${guestsAdults}::int,
        ${guestsChildren}::int,
        ${guestFullName}::text,
        ${guestPhone}::text,
        ${guestEmail}::text,
        ${specialRequests}::text,
        ${notes}::text
      )
    `) as { booking_id: string; reference: string; quoted_total_ugx: string }[];

    if (!rows[0]) return { ok: false, error: "Booking could not be updated. Please try again." };

    await sql`
      WITH booking_room AS (
        SELECT
          b.id,
          b.quoted_total_ugx,
          b.check_in,
          b.check_out,
          rt.title
        FROM bookings b
        JOIN room_types rt ON rt.id = b.room_type_id
        WHERE b.id = ${bookingId}::uuid
        FOR UPDATE OF b
      ),
      updated AS (
        UPDATE folio_charges fc
        SET
          amount_ugx = br.quoted_total_ugx,
          description = br.title || ' - ' ||
            (br.check_out::date - br.check_in::date)::text ||
            ' night' ||
            CASE WHEN (br.check_out::date - br.check_in::date) = 1 THEN '' ELSE 's' END
        FROM booking_room br
        WHERE fc.booking_id = br.id
          AND fc.category = 'accommodation'
          AND fc.voided_at IS NULL
        RETURNING fc.id
      )
      INSERT INTO folio_charges (booking_id, description, amount_ugx, category, posted_by)
      SELECT
        br.id,
        br.title || ' - ' ||
          (br.check_out::date - br.check_in::date)::text ||
          ' night' ||
          CASE WHEN (br.check_out::date - br.check_in::date) = 1 THEN '' ELSE 's' END,
        br.quoted_total_ugx,
        'accommodation',
        ${session.userId}::uuid
      FROM booking_room br
      WHERE NOT EXISTS (SELECT 1 FROM updated)
    `;

    // Clear a room assignment that no longer matches the (possibly changed) room type.
    await sql`
      UPDATE bookings b
      SET room_unit_id = NULL
      WHERE b.id = ${bookingId}::uuid
        AND b.room_unit_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM room_units ru
          WHERE ru.id = b.room_unit_id AND ru.room_type_id = b.room_type_id
      )
    `;

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "booking.modified",
      entityType: "booking",
      entityId: bookingId,
      summary: `Updated booking ${rows[0].reference}.`,
      context: {
        bookingId,
        reference: rows[0].reference,
        before: {
          roomTypeTitle: beforeBooking.room_type_title,
          checkIn: beforeBooking.check_in,
          checkOut: beforeBooking.check_out,
          guestsAdults: beforeBooking.guests_adults,
          guestsChildren: beforeBooking.guests_children,
          guestFullName: beforeBooking.guest_full_name,
          guestEmail: beforeBooking.guest_email,
          guestPhone: beforeBooking.guest_phone,
          specialRequests: beforeBooking.special_requests,
          notes: beforeBooking.notes,
          roomUnitName: beforeBooking.room_unit_name,
          quotedTotalUgx: beforeBooking.quoted_total_ugx
        },
        after: {
          roomTypeSlug,
          checkIn,
          checkOut,
          guestsAdults,
          guestsChildren,
          guestFullName,
          guestEmail,
          guestPhone,
          specialRequests,
          notes
        }
      }
    });

    revalidatePath("/dashboard");
    revalidatePath("/front-desk");
    revalidatePath("/bookings");
    revalidatePath(`/bookings/${bookingId}/folio`);

    return { ok: true, bookingId: rows[0].booking_id, reference: rows[0].reference };
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("availability") || msg.includes("available")) {
      return { ok: false, error: "Sorry, that room is not available for the selected dates." };
    }
    if (msg.includes("past")) {
      return { ok: false, error: "Check-in date cannot be in the past." };
    }
    if (msg.includes("can be modified")) {
      return { ok: false, error: "This booking can no longer be edited." };
    }
    if (msg.includes("not found")) {
      return { ok: false, error: "Booking or room type not found." };
    }
    console.error("modify_booking failed:", err);
    return { ok: false, error: "Booking could not be updated. Please try again." };
  }
}
