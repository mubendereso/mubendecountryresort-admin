import "server-only";

import { getSql } from "@/lib/db/client";
import type { BookingRow } from "./types";

export type { BookingRow, BookingStatus } from "./types";

export async function listBookings(): Promise<BookingRow[]> {
  const sql = getSql();
  return (await sql`
    SELECT
      b.id::text,
      b.reference,
      b.room_type_id::text,
      rt.title AS room_type_title,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_email,
      b.guest_phone,
      b.special_requests,
      b.status,
      to_char(b.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at,
      b.quoted_total_ugx,
      b.notes,
      to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    ORDER BY b.created_at DESC
    LIMIT 300
  `) as BookingRow[];
}
