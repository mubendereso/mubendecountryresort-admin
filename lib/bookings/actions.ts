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
  revalidatePath("/bookings");
}
