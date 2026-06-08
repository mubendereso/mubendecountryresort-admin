import "server-only";

import { getSql } from "@/lib/db/client";
import type { BookingRow } from "@/lib/bookings/types";
import type { GuestSummary } from "./types";

export type { GuestSummary } from "./types";

export async function listGuests(): Promise<GuestSummary[]> {
  const sql = getSql();
  const rows = (await sql`
    WITH context AS (
      SELECT (now() AT TIME ZONE 'Africa/Kampala')::date AS today
    ),
    latest AS (
      SELECT DISTINCT ON (COALESCE(guest_email, guest_phone))
        COALESCE(guest_email, guest_phone) AS guest_key,
        guest_email,
        guest_full_name,
        guest_phone
      FROM bookings
      WHERE COALESCE(guest_email, guest_phone) IS NOT NULL
      ORDER BY COALESCE(guest_email, guest_phone), created_at DESC
    ),
    guest_rollup AS (
      SELECT
        l.guest_key,
        l.guest_email,
        l.guest_full_name,
        l.guest_phone,
        COUNT(b.id)::int AS total_bookings,
        COUNT(b.id) FILTER (
          WHERE b.status IN ('checked_in','checked_out')
        )::int AS total_stays,
        COALESCE(SUM(
          COALESCE(
            payments.total_paid_ugx,
            CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
          )
        ), 0) AS total_spend_ugx,
        MIN(b.check_in) FILTER (
          WHERE b.status IN ('checked_in','checked_out')
        )::text AS first_visit,
        MAX(b.check_in) FILTER (
          WHERE b.status IN ('checked_in','checked_out')
        )::text AS last_visit,
        MAX(b.created_at) AS latest_booking_at
      FROM latest l
      JOIN bookings b ON COALESCE(b.guest_email, b.guest_phone) = l.guest_key
      LEFT JOIN LATERAL (
        SELECT SUM(fp.amount_ugx) AS total_paid_ugx
        FROM folio_payments fp
        WHERE fp.booking_id = b.id
      ) payments ON true
      GROUP BY l.guest_key, l.guest_email, l.guest_full_name, l.guest_phone
    )
    SELECT
      gr.guest_key,
      gr.guest_email,
      gr.guest_full_name,
      gr.guest_phone,
      gr.total_bookings,
      gr.total_stays,
      gr.total_spend_ugx,
      gr.first_visit,
      gr.last_visit,
      upcoming.check_in::text AS next_arrival,
      upcoming.room_type_title AS next_room_type_title
    FROM guest_rollup gr
    LEFT JOIN LATERAL (
      SELECT
        b.check_in,
        rt.title AS room_type_title
      FROM bookings b
      JOIN room_types rt ON rt.id = b.room_type_id
      JOIN context c ON true
      WHERE COALESCE(b.guest_email, b.guest_phone) = gr.guest_key
        AND b.check_in > c.today
        AND b.status IN ('awaiting_confirmation','confirmed')
      ORDER BY b.check_in ASC, b.created_at ASC
      LIMIT 1
    ) upcoming ON true
    ORDER BY gr.latest_booking_at DESC
  `) as GuestSummary[];

  return normalizeGuestSummaries(rows);
}

export async function getGuestProfile(key: string): Promise<GuestSummary | null> {
  const sql = getSql();
  const rows = (await sql`
    WITH context AS (
      SELECT (now() AT TIME ZONE 'Africa/Kampala')::date AS today
    ),
    latest AS (
      SELECT DISTINCT ON (COALESCE(guest_email, guest_phone))
        COALESCE(guest_email, guest_phone) AS guest_key,
        guest_email,
        guest_full_name,
        guest_phone
      FROM bookings
      WHERE COALESCE(guest_email, guest_phone) = ${key}
      ORDER BY COALESCE(guest_email, guest_phone), created_at DESC
    ),
    guest_rollup AS (
      SELECT
        l.guest_key,
        l.guest_email,
        l.guest_full_name,
        l.guest_phone,
        COUNT(b.id)::int AS total_bookings,
        COUNT(b.id) FILTER (
          WHERE b.status IN ('checked_in','checked_out')
        )::int AS total_stays,
        COALESCE(SUM(
          COALESCE(
            payments.total_paid_ugx,
            CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
          )
        ), 0) AS total_spend_ugx,
        MIN(b.check_in) FILTER (
          WHERE b.status IN ('checked_in','checked_out')
        )::text AS first_visit,
        MAX(b.check_in) FILTER (
          WHERE b.status IN ('checked_in','checked_out')
        )::text AS last_visit
      FROM latest l
      JOIN bookings b ON COALESCE(b.guest_email, b.guest_phone) = l.guest_key
      LEFT JOIN LATERAL (
        SELECT SUM(fp.amount_ugx) AS total_paid_ugx
        FROM folio_payments fp
        WHERE fp.booking_id = b.id
      ) payments ON true
      GROUP BY l.guest_key, l.guest_email, l.guest_full_name, l.guest_phone
    )
    SELECT
      gr.guest_key,
      gr.guest_email,
      gr.guest_full_name,
      gr.guest_phone,
      gr.total_bookings,
      gr.total_stays,
      gr.total_spend_ugx,
      gr.first_visit,
      gr.last_visit,
      upcoming.check_in::text AS next_arrival,
      upcoming.room_type_title AS next_room_type_title
    FROM guest_rollup gr
    LEFT JOIN LATERAL (
      SELECT
        b.check_in,
        rt.title AS room_type_title
      FROM bookings b
      JOIN room_types rt ON rt.id = b.room_type_id
      JOIN context c ON true
      WHERE COALESCE(b.guest_email, b.guest_phone) = gr.guest_key
        AND b.check_in > c.today
        AND b.status IN ('awaiting_confirmation','confirmed')
      ORDER BY b.check_in ASC, b.created_at ASC
      LIMIT 1
    ) upcoming ON true
  `) as GuestSummary[];
  return normalizeGuestSummaries(rows)[0] ?? null;
}

function normalizeGuestSummaries(guests: GuestSummary[]): GuestSummary[] {
  return guests.map((guest) => ({
    ...guest,
    total_bookings: Number(guest.total_bookings),
    total_stays: Number(guest.total_stays),
    total_spend_ugx: Number(guest.total_spend_ugx)
  }));
}

export async function listBookingsByGuestKey(key: string): Promise<BookingRow[]> {
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
    WHERE COALESCE(b.guest_email, b.guest_phone) = ${key}
    ORDER BY b.check_in DESC
  `) as BookingRow[];

  return rows.map((booking) => ({
    ...booking,
    quoted_total_ugx: Number(booking.quoted_total_ugx),
    total_charges_ugx: Number(booking.total_charges_ugx),
    total_paid_ugx: Number(booking.total_paid_ugx)
  }));
}
