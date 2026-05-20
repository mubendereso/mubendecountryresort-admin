import "server-only";

import { getSql } from "@/lib/db/client";
import type { BookingStatus } from "@/lib/bookings/types";

export type CalendarCell = {
  date: string;
  occupied: number;
  pending: number;
  awaiting: number;
  confirmed: number;
  checkedIn: number;
};

export type CalendarRoomType = {
  id: string;
  title: string;
  inventoryCount: number;
  cells: CalendarCell[];
};

export type CalendarBooking = {
  id: string;
  reference: string;
  roomTypeId: string;
  roomTypeTitle: string;
  checkIn: string;
  checkOut: string;
  guestFullName: string;
  guestPhone: string | null;
  guestsAdults: number;
  guestsChildren: number;
  quotedTotalUgx: number;
  status: BookingStatus;
};

export type OccupancyCalendarData = {
  startDate: string;
  endDate: string;
  dates: string[];
  roomTypes: CalendarRoomType[];
  bookings: CalendarBooking[];
};

type CellRow = {
  room_type_id: string;
  room_type_title: string;
  inventory_count: number;
  stay_date: string;
  occupied: number;
  pending: number;
  awaiting: number;
  confirmed: number;
  checked_in: number;
};

type BookingRow = {
  id: string;
  reference: string;
  room_type_id: string;
  room_type_title: string;
  check_in: string;
  check_out: string;
  guest_full_name: string;
  guest_phone: string | null;
  guests_adults: number;
  guests_children: number;
  quoted_total_ugx: number;
  status: BookingStatus;
};

export async function getOccupancyCalendarData(days = 30): Promise<OccupancyCalendarData> {
  const sql = getSql();
  const windowDays = Math.max(7, Math.min(days, 90));

  const [{ start_date, end_date }] = (await sql`
    SELECT
      (now() AT TIME ZONE 'Africa/Kampala')::date::text AS start_date,
      ((now() AT TIME ZONE 'Africa/Kampala')::date + (${windowDays}::int - 1))::text AS end_date
  `) as { start_date: string; end_date: string }[];

  const cellRows = (await sql`
    WITH params AS (
      SELECT
        ${start_date}::date AS start_date,
        ${end_date}::date AS end_date
    ),
    dates AS (
      SELECT generate_series(params.start_date, params.end_date, interval '1 day')::date AS stay_date
      FROM params
    ),
    live_bookings AS (
      SELECT b.*
      FROM bookings b, params
      WHERE b.check_in <= params.end_date
        AND b.check_out > params.start_date
        AND (
          b.status IN ('awaiting_confirmation', 'confirmed', 'checked_in')
          OR (b.status = 'pending_payment' AND b.expires_at > now())
        )
    )
    SELECT
      rt.id::text AS room_type_id,
      rt.title AS room_type_title,
      rt.inventory_count,
      d.stay_date::text,
      count(lb.id)::int AS occupied,
      count(lb.id) FILTER (WHERE lb.status = 'pending_payment')::int AS pending,
      count(lb.id) FILTER (WHERE lb.status = 'awaiting_confirmation')::int AS awaiting,
      count(lb.id) FILTER (WHERE lb.status = 'confirmed')::int AS confirmed,
      count(lb.id) FILTER (WHERE lb.status = 'checked_in')::int AS checked_in
    FROM room_types rt
    CROSS JOIN dates d
    LEFT JOIN live_bookings lb
      ON lb.room_type_id = rt.id
     AND lb.check_in <= d.stay_date
     AND lb.check_out > d.stay_date
    WHERE rt.is_published = true OR rt.inventory_count > 0
    GROUP BY rt.id, rt.title, rt.inventory_count, rt.sort_order, d.stay_date
    ORDER BY rt.sort_order ASC, rt.title ASC, d.stay_date ASC
  `) as CellRow[];

  const bookingRows = (await sql`
    SELECT
      b.id::text,
      b.reference,
      b.room_type_id::text,
      rt.title AS room_type_title,
      b.check_in::text,
      b.check_out::text,
      b.guest_full_name,
      b.guest_phone,
      b.guests_adults,
      b.guests_children,
      b.quoted_total_ugx,
      b.status
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.check_in <= ${end_date}::date
      AND b.check_out > ${start_date}::date
      AND (
        b.status IN ('awaiting_confirmation', 'confirmed', 'checked_in')
        OR (b.status = 'pending_payment' AND b.expires_at > now())
      )
    ORDER BY b.check_in ASC, rt.sort_order ASC, b.created_at ASC
  `) as BookingRow[];

  const dates = Array.from(new Set(cellRows.map((row) => row.stay_date)));
  const roomTypes = new Map<string, CalendarRoomType>();

  for (const row of cellRows) {
    const existing =
      roomTypes.get(row.room_type_id) ??
      ({
        id: row.room_type_id,
        title: row.room_type_title,
        inventoryCount: row.inventory_count,
        cells: []
      } satisfies CalendarRoomType);

    existing.cells.push({
      date: row.stay_date,
      occupied: row.occupied,
      pending: row.pending,
      awaiting: row.awaiting,
      confirmed: row.confirmed,
      checkedIn: row.checked_in
    });

    roomTypes.set(row.room_type_id, existing);
  }

  return {
    startDate: start_date,
    endDate: end_date,
    dates,
    roomTypes: Array.from(roomTypes.values()),
    bookings: bookingRows.map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      roomTypeId: booking.room_type_id,
      roomTypeTitle: booking.room_type_title,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      guestFullName: booking.guest_full_name,
      guestPhone: booking.guest_phone,
      guestsAdults: booking.guests_adults,
      guestsChildren: booking.guests_children,
      quotedTotalUgx: booking.quoted_total_ugx,
      status: booking.status
    }))
  };
}
