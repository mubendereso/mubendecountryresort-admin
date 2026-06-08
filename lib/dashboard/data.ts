import "server-only";

import { getSql } from "@/lib/db/client";
import type { BookingStatus } from "@/lib/bookings/types";

export type DashboardBooking = {
  id: string;
  reference: string;
  room_type_title: string;
  check_in: string;
  check_out: string;
  guests_adults: number;
  guests_children: number;
  guest_full_name: string;
  guest_phone: string | null;
  special_requests: string | null;
  quoted_total_ugx: number;
  status: BookingStatus;
};

export type DashboardContact = {
  id: string;
  full_name: string;
  email: string;
  subject: string | null;
  created_at: string;
};

export type DashboardOccupancyDay = {
  date: string;
  occupiedRooms: number;
  occupancyPercent: number;
};

export type DashboardData = {
  today: string;
  totalUnits: number;
  arrivalsToday: number;
  departuresToday: number;
  inHouseGuests: number;
  pendingPayments: number;
  unreadContacts: number;
  occupiedTonight: number;
  occupancyPercent: number;
  arrivalBookings: DashboardBooking[];
  departureBookings: DashboardBooking[];
  upcomingBookings: DashboardBooking[];
  occupancyWeek: DashboardOccupancyDay[];
  recentUnreadContacts: DashboardContact[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const sql = getSql();

  const [summary] = (await sql`
    WITH context AS (
      SELECT (now() AT TIME ZONE 'Africa/Kampala')::date AS today
    ),
    inventory AS (
      SELECT COALESCE(sum(inventory_count), 0)::int AS total_units
      FROM room_types
    ),
    arrivals AS (
      SELECT count(*)::int AS count
      FROM bookings b, context c
      WHERE b.check_in = c.today
        AND b.status = 'confirmed'
    ),
    departures AS (
      SELECT count(*)::int AS count
      FROM bookings b, context c
      WHERE b.check_out = c.today
        AND b.status = 'checked_in'
    ),
    in_house AS (
      SELECT
        count(*)::int AS occupied_rooms,
        COALESCE(sum(guests_adults + guests_children), 0)::int AS guest_count
      FROM bookings
      WHERE status = 'checked_in'
    ),
    pending_payments AS (
      SELECT count(*)::int AS count
      FROM bookings
      WHERE status = 'pending_payment'
        AND expires_at > now()
    ),
    unread_contacts AS (
      SELECT count(*)::int AS count
      FROM contact_submissions
      WHERE status = 'new'
    ),
    occupied AS (
      SELECT count(*)::int AS count
      FROM bookings b, context c
      WHERE b.check_in <= c.today
        AND b.check_out > c.today
        AND b.status IN ('awaiting_confirmation', 'confirmed', 'checked_in')
    )
    SELECT
      context.today::text,
      inventory.total_units,
      arrivals.count AS arrivals_today,
      departures.count AS departures_today,
      in_house.guest_count AS in_house_guests,
      pending_payments.count AS pending_payments,
      unread_contacts.count AS unread_contacts,
      occupied.count AS occupied_tonight,
      CASE
        WHEN inventory.total_units = 0 THEN 0
        ELSE round((occupied.count::numeric / inventory.total_units::numeric) * 100)::int
      END AS occupancy_percent
    FROM context, inventory, arrivals, departures, in_house, pending_payments, unread_contacts, occupied
  `) as {
    today: string;
    total_units: number;
    arrivals_today: number;
    departures_today: number;
    in_house_guests: number;
    pending_payments: number;
    unread_contacts: number;
    occupied_tonight: number;
    occupancy_percent: number;
  }[];

  const [arrivalBookings, departureBookings, upcomingBookings, occupancyWeek, recentUnreadContacts] =
    (await Promise.all([
      sql`
    WITH context AS (
      SELECT (now() AT TIME ZONE 'Africa/Kampala')::date AS today
    )
    SELECT
      b.id::text,
      b.reference,
      rt.title AS room_type_title,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_phone,
      b.special_requests,
      b.quoted_total_ugx,
      b.status
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    JOIN context c ON true
    WHERE b.check_in = c.today
      AND b.status = 'confirmed'
    ORDER BY b.created_at ASC
    LIMIT 8
  `,
      sql`
    WITH context AS (
      SELECT (now() AT TIME ZONE 'Africa/Kampala')::date AS today
    )
    SELECT
      b.id::text,
      b.reference,
      rt.title AS room_type_title,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_phone,
      b.special_requests,
      b.quoted_total_ugx,
      b.status
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    JOIN context c ON true
    WHERE b.check_out = c.today
      AND b.status = 'checked_in'
    ORDER BY b.created_at ASC
    LIMIT 8
  `,
      sql`
    WITH context AS (
      SELECT (now() AT TIME ZONE 'Africa/Kampala')::date AS today
    )
    SELECT
      b.id::text,
      b.reference,
      rt.title AS room_type_title,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_phone,
      b.special_requests,
      b.quoted_total_ugx,
      b.status
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    JOIN context c ON true
    WHERE b.check_in > c.today
      AND b.status IN ('awaiting_confirmation', 'confirmed')
    ORDER BY b.check_in ASC, b.created_at ASC
    LIMIT 6
  `,
      sql`
    WITH context AS (
      SELECT
        (now() AT TIME ZONE 'Africa/Kampala')::date AS today,
        COALESCE((SELECT sum(inventory_count) FROM room_types), 0)::int AS total_units
    ),
    dates AS (
      SELECT generate_series(c.today, c.today + 6, interval '1 day')::date AS stay_date
      FROM context c
    )
    SELECT
      d.stay_date::text AS date,
      count(b.id)::int AS occupied_rooms,
      CASE
        WHEN c.total_units = 0 THEN 0
        ELSE round((count(b.id)::numeric / c.total_units::numeric) * 100)::int
      END AS occupancy_percent
    FROM dates d
    CROSS JOIN context c
    LEFT JOIN bookings b
      ON b.check_in <= d.stay_date
     AND b.check_out > d.stay_date
     AND b.status IN ('awaiting_confirmation', 'confirmed', 'checked_in')
    GROUP BY d.stay_date, c.total_units
    ORDER BY d.stay_date ASC
  `,
      sql`
    SELECT
      id::text,
      full_name,
      email,
      subject,
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM contact_submissions
    WHERE status = 'new'
    ORDER BY created_at DESC
    LIMIT 5
  `
    ])) as unknown as [
      DashboardBooking[],
      DashboardBooking[],
      DashboardBooking[],
      { date: string; occupied_rooms: number; occupancy_percent: number }[],
      DashboardContact[]
    ];

  return {
    today: summary.today,
    totalUnits: summary.total_units,
    arrivalsToday: summary.arrivals_today,
    departuresToday: summary.departures_today,
    inHouseGuests: summary.in_house_guests,
    pendingPayments: summary.pending_payments,
    unreadContacts: summary.unread_contacts,
    occupiedTonight: summary.occupied_tonight,
    occupancyPercent: summary.occupancy_percent,
    arrivalBookings,
    departureBookings,
    upcomingBookings,
    occupancyWeek: occupancyWeek.map((day) => ({
      date: day.date,
      occupiedRooms: day.occupied_rooms,
      occupancyPercent: day.occupancy_percent
    })),
    recentUnreadContacts
  };
}
