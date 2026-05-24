import "server-only";

import { getSql } from "@/lib/db/client";
import type {
  DailyMovement,
  ReportData,
  RevenueByCategory,
  RevenueByMonth,
  RevenueByRoomType
} from "./types";

// Statuses that count as occupying a room (a committed/realised stay).
const OCCUPYING_STATUSES = ["awaiting_confirmation", "confirmed", "checked_in", "checked_out"];

// All aggregation runs in Postgres and returns small result sets, so the
// Worker only formats a handful of rows (negligible CPU on the CF free tier).
export async function getReportData(from: string, to: string): Promise<ReportData> {
  const sql = getSql();

  const summaryQuery = sql`
    WITH inv AS (
      SELECT COALESCE(sum(inventory_count), 0)::int AS total_units
      FROM room_types
    ),
    occ AS (
      SELECT COALESCE(SUM(
        GREATEST(0, LEAST(b.check_out, ${to}::date + 1) - GREATEST(b.check_in, ${from}::date))
      ), 0)::int AS occupied_nights
      FROM bookings b
      WHERE b.status = ANY(${OCCUPYING_STATUSES})
        AND b.check_in <= ${to}::date
        AND b.check_out > ${from}::date
    ),
    charged AS (
      SELECT COALESCE(SUM(fc.amount_ugx), 0)::bigint AS total
      FROM folio_charges fc
      WHERE fc.voided_at IS NULL
        AND (fc.posted_at AT TIME ZONE 'Africa/Kampala')::date BETWEEN ${from}::date AND ${to}::date
    ),
    collected AS (
      SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint AS total
      FROM folio_payments fp
      WHERE (fp.recorded_at AT TIME ZONE 'Africa/Kampala')::date BETWEEN ${from}::date AND ${to}::date
    ),
    stays AS (
      SELECT count(*)::int AS cnt
      FROM bookings b
      WHERE b.status = ANY(${OCCUPYING_STATUSES})
        AND b.check_in <= ${to}::date
        AND b.check_out > ${from}::date
    ),
    arrivals AS (
      SELECT count(*)::int AS cnt
      FROM bookings b
      WHERE b.check_in BETWEEN ${from}::date AND ${to}::date
        AND b.status IN ('confirmed', 'checked_in', 'checked_out')
    ),
    departures AS (
      SELECT count(*)::int AS cnt
      FROM bookings b
      WHERE b.check_out BETWEEN ${from}::date AND ${to}::date
        AND b.status IN ('checked_in', 'checked_out')
    ),
    in_house AS (
      SELECT count(*)::int AS cnt FROM bookings WHERE status = 'checked_in'
    )
    SELECT
      inv.total_units,
      (${to}::date - ${from}::date + 1) AS nights_in_range,
      occ.occupied_nights,
      charged.total AS total_charged,
      collected.total AS total_collected,
      stays.cnt AS stays,
      arrivals.cnt AS arrivals,
      departures.cnt AS departures,
      in_house.cnt AS in_house_now
    FROM inv, occ, charged, collected, stays, arrivals, departures, in_house
  `;

  const byRoomTypeQuery = sql`
    SELECT
      rt.title AS room_type,
      COALESCE(SUM(fc.amount_ugx), 0)::bigint AS revenue,
      count(fc.id)::int AS charge_count
    FROM folio_charges fc
    JOIN bookings b ON b.id = fc.booking_id
    JOIN room_types rt ON rt.id = b.room_type_id
    WHERE fc.voided_at IS NULL
      AND fc.category = 'accommodation'
      AND (fc.posted_at AT TIME ZONE 'Africa/Kampala')::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY rt.title
    ORDER BY revenue DESC
  `;

  const byCategoryQuery = sql`
    SELECT
      fc.category,
      COALESCE(SUM(fc.amount_ugx), 0)::bigint AS revenue,
      count(fc.id)::int AS charge_count
    FROM folio_charges fc
    WHERE fc.voided_at IS NULL
      AND (fc.posted_at AT TIME ZONE 'Africa/Kampala')::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY fc.category
    ORDER BY revenue DESC
  `;

  const byMonthQuery = sql`
    SELECT
      to_char((fc.posted_at AT TIME ZONE 'Africa/Kampala'), 'YYYY-MM') AS month,
      COALESCE(SUM(fc.amount_ugx), 0)::bigint AS revenue
    FROM folio_charges fc
    WHERE fc.voided_at IS NULL
      AND (fc.posted_at AT TIME ZONE 'Africa/Kampala')::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY month
    ORDER BY month
  `;

  const dailyQuery = sql`
    WITH days AS (
      SELECT generate_series(${from}::date, ${to}::date, '1 day')::date AS d
    )
    SELECT
      days.d::text AS date,
      (SELECT count(*) FROM bookings b
        WHERE b.check_in = days.d
          AND b.status IN ('confirmed', 'checked_in', 'checked_out'))::int AS arrivals,
      (SELECT count(*) FROM bookings b
        WHERE b.check_out = days.d
          AND b.status IN ('checked_in', 'checked_out'))::int AS departures,
      (SELECT count(*) FROM bookings b
        WHERE b.check_in <= days.d AND b.check_out > days.d
          AND b.status = ANY(${OCCUPYING_STATUSES}))::int AS occupied
    FROM days
    ORDER BY days.d
  `;

  const [summaryRows, byRoomType, byCategory, byMonth, daily] = await Promise.all([
    summaryQuery,
    byRoomTypeQuery,
    byCategoryQuery,
    byMonthQuery,
    dailyQuery
  ]);

  const s = (summaryRows as Record<string, string | number>[])[0];
  const totalUnits = Number(s?.total_units ?? 0);
  const nightsInRange = Number(s?.nights_in_range ?? 0);
  const occupiedNights = Number(s?.occupied_nights ?? 0);
  const availableNights = totalUnits * nightsInRange;
  const occupancyPercent =
    availableNights === 0 ? 0 : Math.round((occupiedNights / availableNights) * 100);

  return {
    range: { from, to },
    summary: {
      totalUnits,
      nightsInRange,
      occupiedNights,
      occupancyPercent,
      totalCharged: Number(s?.total_charged ?? 0),
      totalCollected: Number(s?.total_collected ?? 0),
      stays: Number(s?.stays ?? 0),
      arrivals: Number(s?.arrivals ?? 0),
      departures: Number(s?.departures ?? 0),
      inHouseNow: Number(s?.in_house_now ?? 0)
    },
    byRoomType: (byRoomType as Record<string, string | number>[]).map((r) => ({
      room_type: String(r.room_type),
      revenue: Number(r.revenue),
      charge_count: Number(r.charge_count)
    })) as RevenueByRoomType[],
    byCategory: (byCategory as Record<string, string | number>[]).map((r) => ({
      category: String(r.category),
      revenue: Number(r.revenue),
      charge_count: Number(r.charge_count)
    })) as RevenueByCategory[],
    byMonth: (byMonth as Record<string, string | number>[]).map((r) => ({
      month: String(r.month),
      revenue: Number(r.revenue)
    })) as RevenueByMonth[],
    daily: (daily as Record<string, string | number>[]).map((r) => ({
      date: String(r.date),
      arrivals: Number(r.arrivals),
      departures: Number(r.departures),
      occupied: Number(r.occupied)
    })) as DailyMovement[]
  };
}
