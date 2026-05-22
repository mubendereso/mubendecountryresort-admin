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
