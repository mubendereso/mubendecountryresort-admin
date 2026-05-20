import "server-only";

import { getSql } from "@/lib/db/client";
import type { BookingStatus } from "@/lib/bookings/types";

export type FrontDeskBooking = {
  id: string;
  reference: string;
  room_type_title: string;
  check_in: string;
  check_out: string;
  guests_adults: number;
  guests_children: number;
  guest_full_name: string;
  guest_email: string;
  guest_phone: string | null;
  special_requests: string | null;
  quoted_total_ugx: number;
  notes: string | null;
  status: BookingStatus;
};

export type FrontDeskData = {
  today: string;
  arrivals: FrontDeskBooking[];
  departures: FrontDeskBooking[];
  inHouseCount: number;
};

export async function getFrontDeskData(): Promise<FrontDeskData> {
  const sql = getSql();

  const [{ today }] = (await sql`
    SELECT (now() AT TIME ZONE 'Africa/Kampala')::date::text AS today
  `) as { today: string }[];

  const arrivals = (await sql`
    SELECT
      b.id::text,
      b.reference,
      rt.title AS room_type_title,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_email,
      b.guest_phone,
      b.special_requests,
      b.quoted_total_ugx,
      b.notes,
      b.status
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.check_in = ${today}::date
      AND b.status = 'confirmed'
    ORDER BY b.created_at ASC
  `) as FrontDeskBooking[];

  const departures = (await sql`
    SELECT
      b.id::text,
      b.reference,
      rt.title AS room_type_title,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_email,
      b.guest_phone,
      b.special_requests,
      b.quoted_total_ugx,
      b.notes,
      b.status
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.check_out = ${today}::date
      AND b.status = 'checked_in'
    ORDER BY b.created_at ASC
  `) as FrontDeskBooking[];

  const [{ in_house_count }] = (await sql`
    SELECT count(*)::int AS in_house_count
    FROM bookings
    WHERE status = 'checked_in'
  `) as { in_house_count: number }[];

  return {
    today,
    arrivals,
    departures,
    inHouseCount: in_house_count
  };
}
