"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import { getBookingById } from "@/lib/bookings/data";
import { getReservationGroupById } from "./data";

const MAX_GROUP_NAME_LENGTH = 160;
const MAX_ORGANIZER_NAME_LENGTH = 120;
const MAX_ORGANIZER_EMAIL_LENGTH = 200;
const MAX_ORGANIZER_PHONE_LENGTH = 40;
const MAX_GROUP_NOTES_LENGTH = 2000;
const MAX_PAYMENT_REFERENCE_LENGTH = 200;

export type CreateReservationGroupResult =
  | { ok: true; groupId: string; reference: string }
  | { ok: false; error: string };

export type UpdateBookingGroupResult =
  | { ok: true; bookingId: string; groupId: string | null }
  | { ok: false; error: string };

export type CreateReservationGroupBundleResult =
  | { ok: true; groupId: string; reference: string }
  | { ok: false; error: string };

export type UpdateReservationGroupResult =
  | { ok: true; groupId: string; reference: string }
  | { ok: false; error: string };

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function groupReference(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `GRP-${values.year}${values.month}${values.day}-${random}`;
}

function validateGroupTextFields(input: {
  groupName: string;
  organizerName: string | null;
  organizerEmail: string | null;
  organizerPhone: string | null;
  notes: string | null;
}): string | null {
  if (input.groupName.length > MAX_GROUP_NAME_LENGTH) return "Please enter a shorter group name.";
  if ((input.organizerName?.length ?? 0) > MAX_ORGANIZER_NAME_LENGTH) {
    return "Please enter a shorter organizer name.";
  }
  if ((input.organizerEmail?.length ?? 0) > MAX_ORGANIZER_EMAIL_LENGTH) {
    return "Please enter a shorter organizer email.";
  }
  if ((input.organizerPhone?.length ?? 0) > MAX_ORGANIZER_PHONE_LENGTH) {
    return "Please enter a shorter organizer phone number.";
  }
  if ((input.notes?.length ?? 0) > MAX_GROUP_NOTES_LENGTH) return "Please keep group notes under 2000 characters.";
  return null;
}

function normalizedText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

type GroupBookingCard = {
  roomTypeSlug: string;
  checkIn: string;
  checkOut: string;
  guestsAdults: number;
  guestsChildren: number;
  specialRequests: string | null;
  notes: string | null;
  agreedRoomPriceUgx: number | null;
  depositAmountUgx: number;
};

function parseGroupBookingCards(raw: string): GroupBookingCard[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const card = item as Record<string, unknown>;
      const roomTypeSlug = normalizedText(card.roomTypeSlug as FormDataEntryValue | null);
      const checkIn = normalizedText(card.checkIn as FormDataEntryValue | null);
      const checkOut = normalizedText(card.checkOut as FormDataEntryValue | null);
      const guestsAdults = Math.max(1, parseInt(String(card.guestsAdults ?? "1"), 10) || 1);
      const guestsChildren = Math.max(0, parseInt(String(card.guestsChildren ?? "0"), 10) || 0);
      const specialRequests = normalizedText(card.specialRequests as FormDataEntryValue | null) || null;
      const notes = normalizedText(card.notes as FormDataEntryValue | null) || null;
      const agreedRoomPriceUgx = Math.max(
        0,
        parseInt(String(card.agreedRoomPriceUgx ?? "0"), 10) || 0
      );
      const depositAmountUgx = Math.max(0, parseInt(String(card.depositAmountUgx ?? "0"), 10) || 0);

      if (!roomTypeSlug || !checkIn || !checkOut) return null;

      return {
        roomTypeSlug,
        checkIn,
        checkOut,
        guestsAdults,
        guestsChildren,
        specialRequests,
        notes,
        agreedRoomPriceUgx: agreedRoomPriceUgx > 0 ? agreedRoomPriceUgx : null,
        depositAmountUgx
      };
    })
    .filter((card): card is GroupBookingCard => card !== null);
}

export async function createReservationGroupAction(
  formData: FormData
): Promise<CreateReservationGroupResult> {
  const session = await requireApprovedAdminRole();

  const groupName = normalizedText(formData.get("groupName"));
  const organizerName = normalizedText(formData.get("organizerName")) || null;
  const organizerEmail = normalizedText(formData.get("organizerEmail")).toLowerCase() || null;
  const organizerPhone = normalizedText(formData.get("organizerPhone")) || null;
  const notes = normalizedText(formData.get("notes")) || null;

  if (!groupName) return { ok: false, error: "Please enter a group name." };
  if (groupName.length < 2) return { ok: false, error: "Please enter a longer group name." };
  if (organizerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizerEmail)) {
    return { ok: false, error: "Please enter a valid organizer email address." };
  }

  const textError = validateGroupTextFields({
    groupName,
    organizerName,
    organizerEmail,
    organizerPhone,
    notes
  });
  if (textError) return { ok: false, error: textError };

  const sql = getSql();
  const reference = groupReference();

  try {
    const rows = (await sql`
      INSERT INTO reservation_groups (
        reference,
        group_name,
        organizer_name,
        organizer_email,
        organizer_phone,
        notes,
        created_by
      )
      VALUES (
        ${reference},
        ${groupName},
        ${organizerName},
        ${organizerEmail},
        ${organizerPhone},
        ${notes},
        ${session.userId}::uuid
      )
      RETURNING id::text, reference
    `) as { id: string; reference: string }[];

    const group = rows[0];
    if (!group) return { ok: false, error: "Group could not be created. Please try again." };

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "reservation_group.created",
      entityType: "reservation_group",
      entityId: group.id,
      summary: `Created group ${groupName}.`,
      context: {
        groupId: group.id,
        reference: group.reference,
        groupName,
        organizerName,
        organizerEmail,
        organizerPhone,
        notes
      }
    });

    revalidatePath("/groups");

    return { ok: true, groupId: group.id, reference: group.reference };
  } catch (error) {
    console.error("create_reservation_group failed:", error);
    return { ok: false, error: "Group could not be created. Please try again." };
  }
}

export async function updateReservationGroupAction(
  formData: FormData
): Promise<UpdateReservationGroupResult> {
  const session = await requireApprovedAdminRole();

  const groupId = normalizedText(formData.get("groupId"));
  const groupName = normalizedText(formData.get("groupName"));
  const organizerName = normalizedText(formData.get("organizerName")) || null;
  const organizerEmail = normalizedText(formData.get("organizerEmail")).toLowerCase() || null;
  const organizerPhone = normalizedText(formData.get("organizerPhone")) || null;
  const notes = normalizedText(formData.get("notes")) || null;

  if (!groupId) return { ok: false, error: "Missing group reference." };
  if (!isUuid(groupId)) return { ok: false, error: "Please select a valid group." };
  if (!groupName) return { ok: false, error: "Please enter a group name." };
  if (groupName.length < 2) return { ok: false, error: "Please enter a longer group name." };
  if (organizerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizerEmail)) {
    return { ok: false, error: "Please enter a valid organizer email address." };
  }
  const textError = validateGroupTextFields({
    groupName,
    organizerName,
    organizerEmail,
    organizerPhone,
    notes
  });
  if (textError) return { ok: false, error: textError };

  const sql = getSql();
  const beforeGroup = await getReservationGroupById(groupId);
  if (!beforeGroup) return { ok: false, error: "Group not found." };

  try {
    const rows = (await sql`
      UPDATE reservation_groups
      SET
        group_name = ${groupName},
        organizer_name = ${organizerName},
        organizer_email = ${organizerEmail},
        organizer_phone = ${organizerPhone},
        notes = ${notes}
      WHERE id = ${groupId}::uuid
      RETURNING id::text, reference
    `) as { id: string; reference: string }[];

    const group = rows[0];
    if (!group) return { ok: false, error: "Group could not be updated. Please try again." };

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "reservation_group.updated",
      entityType: "reservation_group",
      entityId: groupId,
      summary: `Updated group ${groupName}.`,
      context: {
        groupId,
        reference: group.reference,
        before: {
          groupName: beforeGroup.group_name,
          organizerName: beforeGroup.organizer_name,
          organizerEmail: beforeGroup.organizer_email,
          organizerPhone: beforeGroup.organizer_phone,
          notes: beforeGroup.notes
        },
        after: {
          groupName,
          organizerName,
          organizerEmail,
          organizerPhone,
          notes
        }
      }
    });

    revalidatePath("/groups");
    revalidatePath(`/groups/${groupId}`);
    revalidatePath("/front-desk");

    return { ok: true, groupId, reference: group.reference };
  } catch (error) {
    console.error("update_reservation_group failed:", error);
    return { ok: false, error: "Group could not be updated. Please try again." };
  }
}

export async function createReservationGroupBundleAction(
  formData: FormData
): Promise<CreateReservationGroupBundleResult> {
  const session = await requireApprovedAdminRole();

  const groupName = normalizedText(formData.get("groupName"));
  const organizerName = normalizedText(formData.get("organizerName")) || null;
  const organizerEmail = normalizedText(formData.get("organizerEmail")).toLowerCase() || null;
  const organizerPhone = normalizedText(formData.get("organizerPhone")) || null;
  const notes = normalizedText(formData.get("notes")) || null;
  const groupCheckIn = normalizedText(formData.get("checkIn"));
  const groupCheckOut = normalizedText(formData.get("checkOut"));
  const cardsJson = normalizedText(formData.get("cardsJson"));
  const depositMethod = normalizedText(formData.get("depositMethod")).toLowerCase();
  const depositReference = normalizedText(formData.get("depositReference")) || null;

  if (!groupName) return { ok: false, error: "Please enter a group name." };
  if (groupName.length < 2) return { ok: false, error: "Please enter a longer group name." };
  if (!organizerEmail) return { ok: false, error: "Please enter an organizer email address." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizerEmail)) {
    return { ok: false, error: "Please enter a valid organizer email address." };
  }
  if (!groupCheckIn || !groupCheckOut) {
    return { ok: false, error: "Please enter the group check-in and check-out dates." };
  }
  if (groupCheckIn >= groupCheckOut) {
    return { ok: false, error: "Group check-out must be after check-in." };
  }

  const cards = parseGroupBookingCards(cardsJson);
  if (!cards || cards.length === 0) {
    return { ok: false, error: "Add at least one room card." };
  }

  const depositAmount = cards.reduce((sum, card) => sum + card.depositAmountUgx, 0);
  const finalGroupTotal = cards.reduce(
    (sum, card) => sum + (card.agreedRoomPriceUgx ?? 0),
    0
  );
  if (depositAmount > 0 && !["cash", "mpesa", "card", "transfer"].includes(depositMethod)) {
    return { ok: false, error: "Please select a valid deposit payment method." };
  }
  if (depositAmount > 0 && (depositReference?.length ?? 0) > MAX_PAYMENT_REFERENCE_LENGTH) {
    return { ok: false, error: "Deposit reference is too long." };
  }
  if (depositAmount > finalGroupTotal) {
    return { ok: false, error: "Deposit cannot be greater than the final group total." };
  }

  const sql = getSql();
  const reference = groupReference();

  try {
    const rows = (await sql`
      SELECT
        group_id::text,
        group_reference,
        booking_id::text,
        booking_reference,
        room_type_title,
        card_index
      FROM create_reservation_group_bundle(
        ${reference},
        ${groupName},
        ${organizerName},
        ${organizerEmail},
        ${organizerPhone},
        ${notes},
        ${groupCheckIn}::date,
        ${groupCheckOut}::date,
        ${JSON.stringify(cards)}::jsonb,
        ${depositAmount}::bigint,
        ${depositMethod || null},
        ${depositReference},
        ${session.userId}::uuid
      )
    `) as {
      group_id: string;
      group_reference: string;
      booking_id: string;
      booking_reference: string;
      room_type_title: string;
      card_index: number;
    }[];

    if (!rows[0]) {
      return { ok: false, error: "Group booking could not be created. Please try again." };
    }

    const groupId = rows[0].group_id;
    const groupReferenceValue = rows[0].group_reference;

    try {
      await recordAuditLog({
        actorId: session.userId,
        actorEmail: session.email,
        action: "reservation_group.created",
        entityType: "reservation_group",
        entityId: groupId,
        summary: `Created group ${groupName} with ${rows.length} booking${rows.length === 1 ? "" : "s"}.`,
        context: {
          groupId,
          reference: groupReferenceValue,
        groupName,
        organizerName,
        organizerEmail,
        organizerPhone,
        notes,
        depositAmount,
        depositMethod: depositAmount > 0 ? depositMethod : null,
        depositReference: depositAmount > 0 ? depositReference : null,
        bookings: rows.map((row) => ({
          bookingId: row.booking_id,
          bookingReference: row.booking_reference,
          roomTypeTitle: row.room_type_title,
          cardIndex: row.card_index
          }))
        }
      });

      await Promise.all(
        rows.map((row) =>
          recordAuditLog({
            actorId: session.userId,
            actorEmail: session.email,
            action: "reservation_group.booking_attached",
            entityType: "reservation_group",
            entityId: groupId,
            summary: `Attached booking ${row.booking_reference} to group ${groupName}.`,
            context: {
              groupId,
              groupReference: groupReferenceValue,
              groupName,
              bookingId: row.booking_id,
              bookingReference: row.booking_reference,
              roomTypeTitle: row.room_type_title,
              cardIndex: row.card_index
            }
          })
        )
      );
    } catch (auditError) {
      console.error("create_reservation_group_bundle audit failed:", auditError);
    }

    revalidatePath("/groups");
    revalidatePath("/front-desk");
    revalidatePath("/bookings");
    revalidatePath(`/groups/${groupId}`);

    return { ok: true, groupId, reference: groupReferenceValue };
  } catch (error) {
    console.error("create_reservation_group_bundle failed:", error);
    return { ok: false, error: "Group booking could not be created. Please try again." };
  }
}

async function updateBookingGroup(
  formData: FormData,
  nextGroupId: string | null | undefined
): Promise<UpdateBookingGroupResult> {
  const session = await requireApprovedAdminRole();
  const bookingId = normalizedText(formData.get("bookingId"));
  const formGroupId = normalizedText(formData.get("groupId")) || null;
  const explicitGroupId = nextGroupId === null ? null : nextGroupId ?? formGroupId;

  if (!bookingId) return { ok: false, error: "Missing booking reference." };
  if (!isUuid(bookingId)) return { ok: false, error: "Please select a valid booking." };
  if (explicitGroupId && !isUuid(explicitGroupId)) {
    return { ok: false, error: "Please select a valid group." };
  }

  const sql = getSql();
  const beforeBooking = await getBookingById(bookingId);
  if (!beforeBooking) return { ok: false, error: "Booking not found." };

  const targetGroup =
    explicitGroupId && beforeBooking.group_id !== explicitGroupId
      ? await getReservationGroupById(explicitGroupId)
      : null;

  if (explicitGroupId && !targetGroup) {
    return { ok: false, error: "Group not found." };
  }

  if (beforeBooking.group_id === explicitGroupId) {
    return { ok: true, bookingId, groupId: explicitGroupId };
  }

  try {
    const previousGroup = beforeBooking.group_id
      ? {
          id: beforeBooking.group_id,
          reference: beforeBooking.group_reference,
          group_name: beforeBooking.group_name
        }
      : null;

    await sql`
      UPDATE bookings
      SET group_id = ${explicitGroupId}::uuid
      WHERE id = ${bookingId}::uuid
    `;

    const bookingAction =
      explicitGroupId === null
        ? "booking.group_detached"
        : beforeBooking.group_id === null
          ? "booking.group_attached"
          : "booking.group_changed";
    const bookingSummary =
      explicitGroupId === null
        ? `Detached booking ${beforeBooking.reference}${previousGroup?.group_name ? ` from group ${previousGroup.group_name}` : ""}.`
        : beforeBooking.group_id === null
          ? `Attached booking ${beforeBooking.reference} to group ${targetGroup?.group_name ?? "group"}.`
          : `Moved booking ${beforeBooking.reference} from group ${previousGroup?.group_name ?? "group"} to group ${targetGroup?.group_name ?? "group"}.`;

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: bookingAction,
      entityType: "booking",
      entityId: bookingId,
      summary: bookingSummary,
      context: {
        bookingId,
        bookingReference: beforeBooking.reference,
        previousGroup,
        nextGroup: targetGroup
          ? {
              id: targetGroup.id,
              reference: targetGroup.reference,
              group_name: targetGroup.group_name
            }
          : null
      }
    });

    if (previousGroup) {
      await recordAuditLog({
        actorId: session.userId,
        actorEmail: session.email,
        action: "reservation_group.booking_detached",
        entityType: "reservation_group",
        entityId: previousGroup.id,
        summary: `Detached booking ${beforeBooking.reference} from group ${previousGroup.group_name}.`,
        context: {
          bookingId,
          bookingReference: beforeBooking.reference,
          groupId: previousGroup.id,
          groupReference: previousGroup.reference,
          groupName: previousGroup.group_name
        }
      });
    }

    if (targetGroup) {
      await recordAuditLog({
        actorId: session.userId,
        actorEmail: session.email,
        action: "reservation_group.booking_attached",
        entityType: "reservation_group",
        entityId: targetGroup.id,
        summary:
          beforeBooking.group_id === null
            ? `Attached booking ${beforeBooking.reference} to group ${targetGroup.group_name}.`
            : `Moved booking ${beforeBooking.reference} to group ${targetGroup.group_name}.`,
        context: {
          bookingId,
          bookingReference: beforeBooking.reference,
          groupId: targetGroup.id,
          groupReference: targetGroup.reference,
          groupName: targetGroup.group_name
        }
      });
    }

    revalidatePath("/groups");
    revalidatePath("/bookings");
    revalidatePath("/front-desk");
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath(`/bookings/${bookingId}/folio`);
    if (beforeBooking.group_id) {
      revalidatePath(`/groups/${beforeBooking.group_id}`);
    }
    if (explicitGroupId) {
      revalidatePath(`/groups/${explicitGroupId}`);
    }

    return { ok: true, bookingId, groupId: explicitGroupId };
  } catch (error) {
    console.error("update_booking_group failed:", error);
    return { ok: false, error: "Booking could not be updated. Please try again." };
  }
}

export async function attachBookingToGroupAction(formData: FormData): Promise<UpdateBookingGroupResult> {
  return updateBookingGroup(formData, undefined);
}

export async function detachBookingFromGroupAction(formData: FormData): Promise<UpdateBookingGroupResult> {
  return updateBookingGroup(formData, null);
}
