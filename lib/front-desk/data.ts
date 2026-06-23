import "server-only";

import { getSql } from "@/lib/db/client";
import type { BookingStatus } from "@/lib/bookings/types";

export type FrontDeskBooking = {
  id: string;
  reference: string;
  room_type_title: string;
  group_id: string | null;
  group_reference: string | null;
  group_name: string | null;
  check_in: string;
  check_out: string;
  guests_adults: number;
  guests_children: number;
  guest_full_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  special_requests: string | null;
  quoted_total_ugx: number;
  total_charges_ugx: number;
  total_paid_ugx: number;
  notes: string | null;
  status: BookingStatus;
  room_unit_id: string | null;
  room_unit_name: string | null;
};

export type FrontDeskData = {
  today: string;
  arrivals: FrontDeskBooking[];
  departures: FrontDeskBooking[];
  inHouseCount: number;
  totalUnits: number;
};

export async function getFrontDeskData(): Promise<FrontDeskData> {
  const sql = getSql();

  const [{ today }] = (await sql`
    SELECT (now() AT TIME ZONE 'Africa/Kampala')::date::text AS today
  `) as { today: string }[];

  // MCR-PERF-03: arrivals, departures, and the in-house count are independent
  // once `today` is known, so issue them concurrently instead of serially.
  const [arrivals, departures, [{ in_house_count, total_units }]] = (await Promise.all([
    sql`
    SELECT
      b.id::text,
      b.reference,
      rt.title AS room_type_title,
      b.group_id::text,
      rg.reference AS group_reference,
      rg.group_name AS group_name,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_email,
      b.guest_phone,
      b.special_requests,
      b.quoted_total_ugx,
      COALESCE(charges.total_charges_ugx, b.quoted_total_ugx) AS total_charges_ugx,
      COALESCE(
        payments.total_paid_ugx,
        CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
      ) AS total_paid_ugx,
      b.notes,
      b.status,
      b.room_unit_id::text,
      ru.unit_name AS room_unit_name
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN room_units ru ON ru.id = b.room_unit_id
    LEFT JOIN reservation_groups rg ON rg.id = b.group_id
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
    WHERE b.check_in = ${today}::date
      AND b.status = 'confirmed'
    ORDER BY b.created_at ASC
  `,
    sql`
    SELECT
      b.id::text,
      b.reference,
      rt.title AS room_type_title,
      b.group_id::text,
      rg.reference AS group_reference,
      rg.group_name AS group_name,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_email,
      b.guest_phone,
      b.special_requests,
      b.quoted_total_ugx,
      COALESCE(charges.total_charges_ugx, b.quoted_total_ugx) AS total_charges_ugx,
      COALESCE(
        payments.total_paid_ugx,
        CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
      ) AS total_paid_ugx,
      b.notes,
      b.status,
      b.room_unit_id::text,
      ru.unit_name AS room_unit_name
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN room_units ru ON ru.id = b.room_unit_id
    LEFT JOIN reservation_groups rg ON rg.id = b.group_id
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
    WHERE b.check_out = ${today}::date
      AND b.status = 'checked_in'
    ORDER BY b.created_at ASC
  `,
    sql`
    SELECT
      (SELECT count(*)::int FROM bookings WHERE status = 'checked_in') AS in_house_count,
      (SELECT COALESCE(sum(inventory_count), 0)::int FROM room_types) AS total_units
  `
  ])) as unknown as [
    FrontDeskBooking[],
    FrontDeskBooking[],
    { in_house_count: number; total_units: number }[]
  ];

  return {
    today,
    arrivals: arrivals.map(normalizeFrontDeskBooking),
    departures: departures.map(normalizeFrontDeskBooking),
    inHouseCount: in_house_count,
    totalUnits: total_units
  };
}

function normalizeFrontDeskBooking(booking: FrontDeskBooking): FrontDeskBooking {
  return {
    ...booking,
    quoted_total_ugx: Number(booking.quoted_total_ugx),
    total_charges_ugx: Number(booking.total_charges_ugx),
    total_paid_ugx: Number(booking.total_paid_ugx)
  };
}
