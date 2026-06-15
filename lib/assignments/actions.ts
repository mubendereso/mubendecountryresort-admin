"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import { getBookingById } from "@/lib/bookings/data";
import { listAssignableUnits, type AssignableUnit } from "./data";

export type AssignResult = { ok: true } | { ok: false; error: string };

export async function loadAssignableUnitsAction(bookingId: string): Promise<AssignableUnit[]> {
  await requireApprovedAdminRole();
  if (!bookingId) return [];
  return listAssignableUnits(bookingId);
}

function revalidateAssignmentSurfaces(bookingId: string): void {
  revalidatePath("/front-desk");
  revalidatePath("/bookings");
  revalidatePath("/housekeeping");
  revalidatePath("/calendar");
  revalidatePath(`/bookings/${bookingId}/folio`);
}

export async function assignRoomUnitAction(formData: FormData): Promise<AssignResult> {
  const session = await requireApprovedAdminRole();

  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const roomUnitId = String(formData.get("roomUnitId") ?? "").trim();
  if (!bookingId) return { ok: false, error: "Missing booking reference." };
  if (!roomUnitId) return { ok: false, error: "Please choose a room." };

  const sql = getSql();
  const beforeBooking = await getBookingById(bookingId);
  if (!beforeBooking) return { ok: false, error: "Booking not found." };

  const bookingRows = (await sql`
    SELECT id::text, room_type_id::text, check_in::text, check_out::text, status
    FROM bookings
    WHERE id = ${bookingId}::uuid
  `) as { id: string; room_type_id: string; status: string }[];
  if (!bookingRows[0]) return { ok: false, error: "Booking not found." };
  const booking = bookingRows[0];

  const unitRows = (await sql`
    SELECT room_type_id::text, unit_name, housekeeping_status
    FROM room_units
    WHERE id = ${roomUnitId}::uuid
  `) as { room_type_id: string; unit_name: string; housekeeping_status: string }[];
  if (!unitRows[0]) return { ok: false, error: "Room not found." };

  if (unitRows[0].room_type_id !== booking.room_type_id) {
    return { ok: false, error: "That room is not part of this booking's room type." };
  }
  if (unitRows[0].housekeeping_status === "out_of_order") {
    return { ok: false, error: "That room is out of order and cannot be assigned." };
  }

  const conflicts = (await sql`
    SELECT 1
    FROM bookings other
    JOIN bookings target ON target.id = ${bookingId}::uuid
    WHERE other.room_unit_id = ${roomUnitId}::uuid
      AND other.id <> target.id
      AND other.status IN ('awaiting_confirmation', 'confirmed', 'checked_in')
      AND other.check_in < target.check_out
      AND other.check_out > target.check_in
    LIMIT 1
  `) as unknown[];
  if (conflicts.length > 0) {
    return { ok: false, error: "That room is already assigned to another guest for these dates." };
  }

  await sql`
    UPDATE bookings SET room_unit_id = ${roomUnitId}::uuid WHERE id = ${bookingId}::uuid
  `;

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "booking.room_assigned",
    entityType: "booking",
    entityId: bookingId,
    summary: `Assigned ${unitRows[0].unit_name} to ${beforeBooking.reference}.`,
    context: {
      bookingId,
      reference: beforeBooking.reference,
      fromRoomUnitName: beforeBooking.room_unit_name,
      toRoomUnitId: roomUnitId,
      toRoomUnitName: unitRows[0].unit_name
    }
  });

  revalidateAssignmentSurfaces(bookingId);
  return { ok: true };
}

export async function unassignRoomUnitAction(formData: FormData): Promise<AssignResult> {
  const session = await requireApprovedAdminRole();

  const bookingId = String(formData.get("bookingId") ?? "").trim();
  if (!bookingId) return { ok: false, error: "Missing booking reference." };

  const sql = getSql();
  const beforeBooking = await getBookingById(bookingId);
  if (!beforeBooking) return { ok: false, error: "Booking not found." };
  const rows = (await sql`
    UPDATE bookings SET room_unit_id = NULL WHERE id = ${bookingId}::uuid RETURNING id
  `) as { id: string }[];
  if (rows.length === 0) return { ok: false, error: "Booking not found." };

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "booking.room_unassigned",
    entityType: "booking",
    entityId: bookingId,
    summary: `Unassigned the room from ${beforeBooking.reference}.`,
    context: {
      bookingId,
      reference: beforeBooking.reference,
      previousRoomUnitName: beforeBooking.room_unit_name
    }
  });

  revalidateAssignmentSurfaces(bookingId);
  return { ok: true };
}
