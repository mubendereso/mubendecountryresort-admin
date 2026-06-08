import "server-only";

import { getSql } from "@/lib/db/client";
import type { BookingRow } from "./types";

export type { BookingRow, BookingStatus } from "./types";

export async function getBookingById(id: string): Promise<BookingRow | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      b.id::text,
      b.reference,
      b.room_type_id::text,
      rt.title AS room_type_title,
      COALESCE(rt.cover_image_url, rt.gallery[1]) AS room_image_url,
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
      COALESCE(charges.total_charges_ugx, b.quoted_total_ugx) AS total_charges_ugx,
      COALESCE(
        payments.total_paid_ugx,
        CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
      ) AS total_paid_ugx,
      b.notes,
      b.room_unit_id::text,
      ru.unit_name AS room_unit_name,
      to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN room_units ru ON ru.id = b.room_unit_id
    LEFT JOIN LATERAL (
      SELECT sum(
        CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END
      ) FILTER (WHERE fc.voided_at IS NULL) AS total_charges_ugx
      FROM folio_charges fc
      WHERE fc.booking_id = b.id
    ) charges ON true
    LEFT JOIN LATERAL (
      SELECT sum(fp.amount_ugx) AS total_paid_ugx
      FROM folio_payments fp
      WHERE fp.booking_id = b.id
    ) payments ON true
    WHERE b.id = ${id}::uuid
    LIMIT 1
  `) as BookingRow[];
  const booking = rows[0];
  if (!booking) return null;
  return normalizeBookingAmounts(booking);
}

export async function listBookings(): Promise<BookingRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      b.id::text,
      b.reference,
      b.room_type_id::text,
      rt.title AS room_type_title,
      COALESCE(rt.cover_image_url, rt.gallery[1]) AS room_image_url,
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
      COALESCE(charges.total_charges_ugx, b.quoted_total_ugx) AS total_charges_ugx,
      COALESCE(
        payments.total_paid_ugx,
        CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
      ) AS total_paid_ugx,
      b.notes,
      b.room_unit_id::text,
      ru.unit_name AS room_unit_name,
      to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN room_units ru ON ru.id = b.room_unit_id
    LEFT JOIN LATERAL (
      SELECT sum(
        CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END
      ) FILTER (WHERE fc.voided_at IS NULL) AS total_charges_ugx
      FROM folio_charges fc
      WHERE fc.booking_id = b.id
    ) charges ON true
    LEFT JOIN LATERAL (
      SELECT sum(fp.amount_ugx) AS total_paid_ugx
      FROM folio_payments fp
      WHERE fp.booking_id = b.id
    ) payments ON true
    ORDER BY b.created_at DESC
    LIMIT 300
  `) as BookingRow[];

  return rows.map(normalizeBookingAmounts);
}

function normalizeBookingAmounts(booking: BookingRow): BookingRow {
  return {
    ...booking,
    quoted_total_ugx: Number(booking.quoted_total_ugx),
    total_charges_ugx: Number(booking.total_charges_ugx),
    total_paid_ugx: Number(booking.total_paid_ugx)
  };
}
