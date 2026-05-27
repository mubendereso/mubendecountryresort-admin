"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import type { BookingStatus } from "./types";

// Only these forward-only transitions are allowed via the admin UI.
// Payment lifecycle transitions (confirmed, refunded) happen via Pesapal IPN.
const VALID_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  confirmed: ["checked_in", "no_show", "cancelled"],
  checked_in: ["checked_out", "cancelled"]
};

export async function updateBookingStatusAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  const id = formData.get("id") as string;
  const newStatus = formData.get("status") as BookingStatus;

  if (newStatus === "cancelled" && session.role === "staff") {
    throw new Error("Only admin or superadmin can cancel bookings.");
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT status FROM bookings WHERE id = ${id}::uuid
  `) as { status: BookingStatus }[];

  if (rows.length === 0) throw new Error("Booking not found.");

  const allowed = VALID_TRANSITIONS[rows[0].status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot transition from ${rows[0].status} to ${newStatus}.`);
  }

  await sql`UPDATE bookings SET status = ${newStatus} WHERE id = ${id}::uuid`;

  // Auto-post accommodation charge on first check-in (idempotent: skips if one already exists)
  if (newStatus === "checked_in") {
    await sql`
      INSERT INTO folio_charges (booking_id, description, amount_ugx, category, posted_by)
      SELECT
        b.id,
        rt.title || ' – ' ||
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
        AND NOT EXISTS (
          SELECT 1 FROM folio_payments
          WHERE booking_id = ${id}::uuid AND method = 'pesapal'
        )
    `;
  }

  revalidatePath("/dashboard");
  revalidatePath("/front-desk");
  revalidatePath("/bookings");
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
  const depositAmount = Math.round(Number(formData.get("depositAmountUgx") ?? "0"));
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
  if (!Number.isFinite(depositAmount) || depositAmount < 0) {
    return { ok: false, error: "Deposit must be zero or a positive amount." };
  }
  if (depositAmount > 0 && !["cash", "mpesa", "card", "transfer"].includes(depositMethod)) {
    return { ok: false, error: "Please select a valid deposit payment method." };
  }

  const sql = getSql();
  try {
    const rows = (await sql`
      WITH created AS (
        SELECT booking_id, reference, quoted_total_ugx
        FROM create_staff_booking(
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
      ),
      deposit_guard AS (
        SELECT CASE
          WHEN ${depositAmount}::bigint > quoted_total_ugx THEN 1 / 0
          ELSE 1
        END AS ok
        FROM created
      ),
      accommodation_charge AS (
        INSERT INTO folio_charges (booking_id, description, amount_ugx, category, posted_by)
        SELECT
          b.id,
          rt.title || ' – ' ||
            (b.check_out::date - b.check_in::date)::text ||
            ' night' ||
            CASE WHEN (b.check_out::date - b.check_in::date) = 1 THEN '' ELSE 's' END,
          b.quoted_total_ugx,
          'accommodation',
          ${session.userId}::uuid
        FROM created c
        JOIN bookings b ON b.id = c.booking_id
        JOIN room_types rt ON rt.id = b.room_type_id
        CROSS JOIN deposit_guard
        WHERE ${depositAmount}::bigint > 0
        RETURNING booking_id
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
        CROSS JOIN deposit_guard
        WHERE ${depositAmount}::bigint > 0
        RETURNING booking_id
      )
      SELECT booking_id::text, reference, quoted_total_ugx
      FROM created
    `) as { booking_id: string; reference: string; quoted_total_ugx: string }[];

    if (!rows[0]) return { ok: false, error: "Booking could not be created. Please try again." };

    revalidatePath("/dashboard");
    revalidatePath("/front-desk");
    revalidatePath("/bookings");

    return { ok: true, bookingId: rows[0].booking_id, reference: rows[0].reference };
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("availability") || msg.includes("available")) {
      return { ok: false, error: "Sorry, this room is not available for the selected dates." };
    }
    if (msg.includes("past")) {
      return { ok: false, error: "Check-in date cannot be in the past." };
    }
    if (msg.includes("division by zero")) {
      return { ok: false, error: "Deposit cannot be greater than the booking total." };
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
// and reconciles the folio accommodation charge for in-house guests.
export async function modifyBookingAction(
  formData: FormData
): Promise<CreateStaffBookingResult> {
  await requireApprovedAdminRole();

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

  const sql = getSql();
  try {
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
