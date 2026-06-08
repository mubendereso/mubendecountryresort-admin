import "server-only";

import { getSql } from "@/lib/db/client";
import type { BookingStatus } from "@/lib/bookings/types";

export type CalendarCell = {
  date: string;
  occupied: number;
  available: number;
  pending: number;
  awaiting: number;
  confirmed: number;
  checkedIn: number;
  arrivals: number;
  departures: number;
};

export type CalendarRoomType = {
  id: string;
  title: string;
  inventoryCount: number;
  sellableInventory: number;
  outOfOrderCount: number;
  imageUrl: string | null;
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
  today: string;
  startDate: string;
  endDate: string;
  dates: string[];
  roomTypes: CalendarRoomType[];
  bookings: CalendarBooking[];
  summary: {
    totalRooms: number;
    occupied: number;
    available: number;
    occupancyPercent: number;
    arrivals: number;
    departures: number;
    outOfOrder: number;
  };
};

type CellRow = {
  room_type_id: string;
  room_type_title: string;
  inventory_count: number;
  sellable_inventory: number;
  out_of_order_count: number;
  image_url: string | null;
  stay_date: string;
  occupied: number;
  pending: number;
  awaiting: number;
  confirmed: number;
  checked_in: number;
  arrivals: number;
  departures: number;
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

export async function getOccupancyCalendarData(
  days = 14,
  requestedStartDate?: string
): Promise<OccupancyCalendarData> {
  const sql = getSql();
  const windowDays = Math.max(7, Math.min(days, 90));

  const [{ today, start_date, end_date }] = (await sql`
    WITH context AS (
      SELECT (now() AT TIME ZONE 'Africa/Kampala')::date AS today
    )
    SELECT
      context.today::text AS today,
      COALESCE(${requestedStartDate ?? null}::date, context.today)::text AS start_date,
      (COALESCE(${requestedStartDate ?? null}::date, context.today) + (${windowDays}::int - 1))::text AS end_date
    FROM context
  `) as { today: string; start_date: string; end_date: string }[];

  const [cellRows, bookingRows, summaryRows] = (await Promise.all([
    sql`
    WITH params AS (
      SELECT
        ${start_date}::date AS start_date,
        ${end_date}::date AS end_date
    ),
    dates AS (
      SELECT generate_series(params.start_date, params.end_date, interval '1 day')::date AS stay_date
      FROM params
    ),
    room_inventory AS (
      SELECT
        rt.id,
        rt.title,
        rt.inventory_count,
        rt.sort_order,
        COALESCE(NULLIF(rt.cover_image_url, ''), rt.gallery[1]) AS image_url,
        count(ru.id) FILTER (WHERE ru.housekeeping_status = 'out_of_order')::int AS out_of_order_count,
        greatest(
          rt.inventory_count
            - count(ru.id) FILTER (WHERE ru.housekeeping_status = 'out_of_order'),
          0
        )::int AS sellable_inventory
      FROM room_types rt
      LEFT JOIN room_units ru ON ru.room_type_id = rt.id
      WHERE rt.is_published = true OR rt.inventory_count > 0
      GROUP BY rt.id, rt.title, rt.inventory_count, rt.sort_order, rt.cover_image_url, rt.gallery
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
    ),
    movements AS (
      SELECT
        movement.room_type_id,
        movement.stay_date,
        sum(movement.arrivals)::int AS arrivals,
        sum(movement.departures)::int AS departures
      FROM (
        SELECT
          b.room_type_id,
          b.check_in AS stay_date,
          1 AS arrivals,
          0 AS departures
        FROM bookings b, params
        WHERE b.check_in BETWEEN params.start_date AND params.end_date
          AND b.status IN ('awaiting_confirmation', 'confirmed')

        UNION ALL

        SELECT
          b.room_type_id,
          b.check_out AS stay_date,
          0 AS arrivals,
          1 AS departures
        FROM bookings b, params
        WHERE b.check_out BETWEEN params.start_date AND params.end_date
          AND b.status = 'checked_in'
      ) movement
      GROUP BY movement.room_type_id, movement.stay_date
    )
    SELECT
      ri.id::text AS room_type_id,
      ri.title AS room_type_title,
      ri.inventory_count,
      ri.sellable_inventory,
      ri.out_of_order_count,
      ri.image_url,
      d.stay_date::text,
      count(lb.id)::int AS occupied,
      count(lb.id) FILTER (WHERE lb.status = 'pending_payment')::int AS pending,
      count(lb.id) FILTER (WHERE lb.status = 'awaiting_confirmation')::int AS awaiting,
      count(lb.id) FILTER (WHERE lb.status = 'confirmed')::int AS confirmed,
      count(lb.id) FILTER (WHERE lb.status = 'checked_in')::int AS checked_in,
      COALESCE(m.arrivals, 0)::int AS arrivals,
      COALESCE(m.departures, 0)::int AS departures
    FROM room_inventory ri
    CROSS JOIN dates d
    LEFT JOIN live_bookings lb
      ON lb.room_type_id = ri.id
     AND lb.check_in <= d.stay_date
     AND lb.check_out > d.stay_date
    LEFT JOIN movements m
      ON m.room_type_id = ri.id
     AND m.stay_date = d.stay_date
    GROUP BY
      ri.id,
      ri.title,
      ri.inventory_count,
      ri.sellable_inventory,
      ri.out_of_order_count,
      ri.image_url,
      ri.sort_order,
      m.arrivals,
      m.departures,
      d.stay_date
    ORDER BY ri.sort_order ASC, ri.title ASC, d.stay_date ASC
  `,
    sql`
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
  `,
    sql`
    WITH context AS (
      SELECT (now() AT TIME ZONE 'Africa/Kampala')::date AS today
    ),
    room_inventory AS (
      SELECT
        rt.id,
        rt.inventory_count,
        count(ru.id) FILTER (WHERE ru.housekeeping_status = 'out_of_order')::int AS out_of_order
      FROM room_types rt
      LEFT JOIN room_units ru ON ru.room_type_id = rt.id
      WHERE rt.is_published = true OR rt.inventory_count > 0
      GROUP BY rt.id, rt.inventory_count
    ),
    inventory AS (
      SELECT
        COALESCE(sum(inventory_count), 0)::int AS total_rooms,
        COALESCE(sum(out_of_order), 0)::int AS out_of_order
      FROM room_inventory
    ),
    movements AS (
      SELECT
        count(*) FILTER (
          WHERE b.check_in = c.today
            AND b.status IN ('awaiting_confirmation', 'confirmed')
        )::int AS arrivals,
        count(*) FILTER (
          WHERE b.check_out = c.today
            AND b.status = 'checked_in'
        )::int AS departures,
        count(*) FILTER (
          WHERE b.check_in <= c.today
            AND b.check_out > c.today
            AND (
              b.status IN ('awaiting_confirmation', 'confirmed', 'checked_in')
              OR (b.status = 'pending_payment' AND b.expires_at > now())
            )
        )::int AS occupied
      FROM bookings b
      CROSS JOIN context c
    )
    SELECT
      i.total_rooms,
      i.out_of_order,
      m.occupied,
      greatest(i.total_rooms - i.out_of_order - m.occupied, 0)::int AS available,
      CASE
        WHEN i.total_rooms - i.out_of_order <= 0 THEN 0
        ELSE least(
          round((m.occupied::numeric / (i.total_rooms - i.out_of_order)::numeric) * 100),
          100
        )::int
      END AS occupancy_percent,
      m.arrivals,
      m.departures
    FROM inventory i
    CROSS JOIN movements m
  `
  ])) as unknown as [
    CellRow[],
    BookingRow[],
    {
      total_rooms: number;
      out_of_order: number;
      occupied: number;
      available: number;
      occupancy_percent: number;
      arrivals: number;
      departures: number;
    }[]
  ];

  const dates = Array.from(new Set(cellRows.map((row) => row.stay_date)));
  const roomTypes = new Map<string, CalendarRoomType>();

  for (const row of cellRows) {
    const existing =
      roomTypes.get(row.room_type_id) ??
      ({
        id: row.room_type_id,
        title: row.room_type_title,
        inventoryCount: row.inventory_count,
        sellableInventory: row.sellable_inventory,
        outOfOrderCount: row.out_of_order_count,
        imageUrl: row.image_url,
        cells: []
      } satisfies CalendarRoomType);

    existing.cells.push({
      date: row.stay_date,
      occupied: row.occupied,
      available: Math.max(0, row.sellable_inventory - row.occupied),
      pending: row.pending,
      awaiting: row.awaiting,
      confirmed: row.confirmed,
      checkedIn: row.checked_in,
      arrivals: row.arrivals,
      departures: row.departures
    });

    roomTypes.set(row.room_type_id, existing);
  }

  return {
    today,
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
      quotedTotalUgx: Number(booking.quoted_total_ugx),
      status: booking.status
    })),
    summary: {
      totalRooms: Number(summaryRows[0]?.total_rooms ?? 0),
      occupied: Number(summaryRows[0]?.occupied ?? 0),
      available: Number(summaryRows[0]?.available ?? 0),
      occupancyPercent: Number(summaryRows[0]?.occupancy_percent ?? 0),
      arrivals: Number(summaryRows[0]?.arrivals ?? 0),
      departures: Number(summaryRows[0]?.departures ?? 0),
      outOfOrder: Number(summaryRows[0]?.out_of_order ?? 0)
    }
  };
}
