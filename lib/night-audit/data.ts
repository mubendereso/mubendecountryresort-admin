import "server-only";

import { getSql } from "@/lib/db/client";
import type { NightAuditBookingIssue, NightAuditCloseRecord, NightAuditData, NightAuditPaymentMethodTotal, NightAuditSummary } from "./types";

const PAYMENT_METHOD_ORDER: NightAuditPaymentMethodTotal["method"][] = [
  "cash",
  "mpesa",
  "card",
  "transfer",
  "pesapal",
  "pesapal_manual"
];

const ACTIVE_BOOKING_STATUSES = ["awaiting_confirmation", "confirmed", "checked_in", "checked_out"] as const;

function parseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function toIsoUtc(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function kampalaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
}

export function shiftIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getNightAuditData(businessDate: string): Promise<NightAuditData> {
  const sql = getSql();

  const [summaryRows, unsettledRows, closeRows] = await Promise.all([
    sql`
      WITH context AS (
        SELECT ${businessDate}::date AS business_date
      ),
      inventory AS (
        SELECT COALESCE(sum(inventory_count), 0)::int AS total_units
        FROM room_types
      ),
      occupancy AS (
        SELECT COALESCE(sum(
          GREATEST(
            0,
            LEAST(b.check_out, c.business_date + 1) - GREATEST(b.check_in, c.business_date)
          )
        ), 0)::int AS occupied_room_nights
        FROM bookings b
        JOIN context c ON true
        WHERE b.status = ANY(${ACTIVE_BOOKING_STATUSES})
          AND b.check_in <= c.business_date
          AND b.check_out > c.business_date
      ),
      arrivals AS (
        SELECT count(*)::int AS arrivals
        FROM bookings b
        JOIN context c ON true
        WHERE b.check_in = c.business_date
          AND b.status IN ('confirmed', 'checked_in', 'checked_out')
      ),
      departures AS (
        SELECT count(*)::int AS departures
        FROM bookings b
        JOIN context c ON true
        WHERE b.check_out = c.business_date
          AND b.status IN ('checked_in', 'checked_out')
      ),
      payments AS (
        SELECT
          count(*) FILTER (WHERE fp.method = 'cash')::int AS cash_count,
          COALESCE(sum(fp.amount_ugx), 0)::bigint AS total_collected_ugx,
          count(*) FILTER (WHERE fp.method = 'mpesa')::int AS mpesa_count,
          COALESCE(sum(fp.amount_ugx) FILTER (WHERE fp.method = 'cash'), 0)::bigint AS cash_total_ugx,
          COALESCE(sum(fp.amount_ugx) FILTER (WHERE fp.method = 'mpesa'), 0)::bigint AS mpesa_total_ugx,
          count(*) FILTER (WHERE fp.method = 'card')::int AS card_count,
          COALESCE(sum(fp.amount_ugx) FILTER (WHERE fp.method = 'card'), 0)::bigint AS card_total_ugx,
          count(*) FILTER (WHERE fp.method = 'transfer')::int AS transfer_count,
          COALESCE(sum(fp.amount_ugx) FILTER (WHERE fp.method = 'transfer'), 0)::bigint AS transfer_total_ugx,
          count(*) FILTER (WHERE fp.method = 'pesapal')::int AS pesapal_count,
          COALESCE(sum(fp.amount_ugx) FILTER (WHERE fp.method = 'pesapal'), 0)::bigint AS pesapal_total_ugx,
          count(*) FILTER (WHERE fp.method = 'pesapal_manual')::int AS pesapal_manual_count,
          COALESCE(sum(fp.amount_ugx) FILTER (WHERE fp.method = 'pesapal_manual'), 0)::bigint AS pesapal_manual_total_ugx
        FROM folio_payments fp
        JOIN context c ON true
        WHERE (fp.recorded_at AT TIME ZONE 'Africa/Kampala')::date = c.business_date
      ),
      charges AS (
        SELECT
          COALESCE(sum(CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END), 0)::bigint AS total_charged_ugx,
          COALESCE(sum(fc.amount_ugx) FILTER (WHERE fc.voided_at IS NOT NULL), 0)::bigint AS voided_charges_amount_ugx,
          count(*) FILTER (WHERE fc.voided_at IS NOT NULL)::int AS voided_charges_count
        FROM folio_charges fc
        JOIN context c ON true
        WHERE (fc.posted_at AT TIME ZONE 'Africa/Kampala')::date = c.business_date
      ),
      receipts AS (
        SELECT count(*)::int AS receipt_count
        FROM payment_receipts pr
        JOIN context c ON true
        WHERE (pr.issued_at AT TIME ZONE 'Africa/Kampala')::date = c.business_date
      ),
      missing_receipts AS (
        SELECT count(*)::int AS missing_receipt_count
        FROM folio_payments fp
        LEFT JOIN payment_receipts pr ON pr.payment_id = fp.id
        WHERE pr.id IS NULL
      ),
      booking_balances AS (
        SELECT
          b.id,
          b.reference,
          b.guest_full_name,
          b.status,
          b.check_in,
          b.check_out,
          rt.title AS room_type_title,
          ru.unit_name AS room_unit_name,
          COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)::bigint AS total_charges_ugx,
          COALESCE(
            payments.total_paid_ugx,
            CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
          )::bigint AS total_paid_ugx,
          GREATEST(
            0,
            COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)::bigint -
            COALESCE(
              payments.total_paid_ugx,
              CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
            )::bigint
          ) AS balance_due_ugx
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
      ),
      open_balance AS (
        SELECT
          count(*) FILTER (
            WHERE status IN ('confirmed', 'checked_in', 'checked_out') AND balance_due_ugx > 0
          )::int AS open_balance_count,
          COALESCE(
            sum(balance_due_ugx) FILTER (
              WHERE status IN ('confirmed', 'checked_in', 'checked_out') AND balance_due_ugx > 0
            ),
            0
          )::bigint AS open_balance_amount_ugx,
          count(*) FILTER (
            WHERE status IN ('pending_payment', 'awaiting_confirmation')
          )::int AS pending_payment_count,
          COALESCE(
            sum(balance_due_ugx) FILTER (
              WHERE status IN ('pending_payment', 'awaiting_confirmation')
            ),
            0
          )::bigint AS pending_payment_amount_ugx
        FROM booking_balances
      )
      SELECT
        c.business_date::text AS business_date,
        i.total_units,
        o.occupied_room_nights,
        CASE
          WHEN i.total_units = 0 THEN 0
          ELSE round((o.occupied_room_nights::numeric / i.total_units::numeric) * 100)::int
        END AS occupancy_percent,
        a.arrivals,
        d.departures,
        p.total_collected_ugx,
        p.cash_count,
        p.cash_total_ugx,
        p.mpesa_count,
        p.mpesa_total_ugx,
        p.card_count,
        p.card_total_ugx,
        p.transfer_count,
        p.transfer_total_ugx,
        p.pesapal_count,
        p.pesapal_total_ugx,
        p.pesapal_manual_count,
        p.pesapal_manual_total_ugx,
        ch.total_charged_ugx,
        r.receipt_count,
        mr.missing_receipt_count,
        ch.voided_charges_count,
        ch.voided_charges_amount_ugx,
        ob.open_balance_count,
        ob.open_balance_amount_ugx,
        ob.pending_payment_count,
        ob.pending_payment_amount_ugx
      FROM context c, inventory i, occupancy o, arrivals a, departures d, payments p, charges ch, receipts r, missing_receipts mr, open_balance ob
    `,
    sql`
      WITH booking_balances AS (
        SELECT
          b.id,
          b.reference,
          b.guest_full_name,
          b.status,
          b.check_in,
          b.check_out,
          rt.title AS room_type_title,
          ru.unit_name AS room_unit_name,
          COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)::bigint AS total_charges_ugx,
          COALESCE(
            payments.total_paid_ugx,
            CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
          )::bigint AS total_paid_ugx,
          GREATEST(
            0,
            COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)::bigint -
            COALESCE(
              payments.total_paid_ugx,
              CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
            )::bigint
          ) AS balance_due_ugx
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
      )
      SELECT
        id::text,
        reference,
        guest_full_name,
        room_type_title,
        room_unit_name,
        status,
        check_in::text,
        check_out::text,
        total_charges_ugx,
        total_paid_ugx,
        balance_due_ugx,
        CASE
          WHEN status IN ('pending_payment', 'awaiting_confirmation') THEN 'pending_payment'
          ELSE 'open_balance'
        END AS issue_type
      FROM booking_balances
      WHERE status IN ('pending_payment', 'awaiting_confirmation', 'confirmed', 'checked_in', 'checked_out')
        AND (
          status IN ('pending_payment', 'awaiting_confirmation')
          OR balance_due_ugx > 0
        )
      ORDER BY
        CASE
          WHEN status IN ('pending_payment', 'awaiting_confirmation') THEN 0
          ELSE 1
        END,
        balance_due_ugx DESC,
        check_out ASC
      LIMIT 20
    `,
    sql`
      SELECT
        na.id::text,
        na.business_date::text,
        to_char(na.closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS closed_at,
        na.opening_float_ugx,
        na.cash_counted_ugx,
        na.cash_difference_ugx,
        na.total_units,
        na.occupied_room_nights,
        na.occupancy_percent,
        na.arrivals,
        na.departures,
        na.total_charged_ugx,
        na.total_collected_ugx,
        na.cash_total_ugx,
        na.mpesa_total_ugx,
        na.card_total_ugx,
        na.transfer_total_ugx,
        na.pesapal_total_ugx,
        na.pesapal_manual_total_ugx,
        na.receipt_count,
        na.missing_receipt_count,
        na.voided_charges_count,
        na.voided_charges_amount_ugx,
        na.open_balance_count,
        na.open_balance_amount_ugx,
        na.pending_payment_count,
        na.pending_payment_amount_ugx,
        na.notes,
        to_char(na.voided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS voided_at,
        na.void_reason,
        closed_by.full_name AS closed_by_name,
        voided_by.full_name AS voided_by_name
      FROM night_audit_closures na
      LEFT JOIN admin_users closed_by ON closed_by.id = na.closed_by
      LEFT JOIN admin_users voided_by ON voided_by.id = na.voided_by
      WHERE na.business_date = ${businessDate}::date
        AND na.voided_at IS NULL
      ORDER BY na.closed_at DESC
      LIMIT 1
    `
  ]) as [
    {
      business_date: string;
      total_units: string | number;
      occupied_room_nights: string | number;
      occupancy_percent: string | number;
      arrivals: string | number;
      departures: string | number;
      total_charged_ugx: string | number;
      total_collected_ugx: string | number;
      cash_count: string | number;
      cash_total_ugx: string | number;
      mpesa_count: string | number;
      mpesa_total_ugx: string | number;
      card_count: string | number;
      card_total_ugx: string | number;
      transfer_count: string | number;
      transfer_total_ugx: string | number;
      pesapal_count: string | number;
      pesapal_total_ugx: string | number;
      pesapal_manual_count: string | number;
      pesapal_manual_total_ugx: string | number;
      receipt_count: string | number;
      missing_receipt_count: string | number;
      voided_charges_count: string | number;
      voided_charges_amount_ugx: string | number;
      open_balance_count: string | number;
      open_balance_amount_ugx: string | number;
      pending_payment_count: string | number;
      pending_payment_amount_ugx: string | number;
    }[],
    {
      id: string;
      reference: string;
      guest_full_name: string;
      room_type_title: string;
      room_unit_name: string | null;
      status: NightAuditBookingIssue["status"];
      check_in: string;
      check_out: string;
      total_charges_ugx: string | number;
      total_paid_ugx: string | number;
      balance_due_ugx: string | number;
      issue_type: NightAuditBookingIssue["issue_type"];
    }[],
    {
      id: string;
      business_date: string;
      closed_at: string;
      opening_float_ugx: string | number;
      cash_counted_ugx: string | number;
      cash_difference_ugx: string | number;
      total_units: string | number;
      occupied_room_nights: string | number;
      occupancy_percent: string | number;
      arrivals: string | number;
      departures: string | number;
      total_charged_ugx: string | number;
      total_collected_ugx: string | number;
      cash_total_ugx: string | number;
      mpesa_total_ugx: string | number;
      card_total_ugx: string | number;
      transfer_total_ugx: string | number;
      pesapal_total_ugx: string | number;
      pesapal_manual_total_ugx: string | number;
      receipt_count: string | number;
      missing_receipt_count: string | number;
      voided_charges_count: string | number;
      voided_charges_amount_ugx: string | number;
      open_balance_count: string | number;
      open_balance_amount_ugx: string | number;
      pending_payment_count: string | number;
      pending_payment_amount_ugx: string | number;
      notes: string | null;
      voided_at: string | null;
      void_reason: string | null;
      closed_by_name: string | null;
      voided_by_name: string | null;
    }[]
  ];

  const summary = summaryRows[0];

  const dataSummary: NightAuditSummary = {
    business_date: summary?.business_date ?? businessDate,
    total_units: parseNumber(summary?.total_units),
    occupied_room_nights: parseNumber(summary?.occupied_room_nights),
    occupancy_percent: parseNumber(summary?.occupancy_percent),
    arrivals: parseNumber(summary?.arrivals),
    departures: parseNumber(summary?.departures),
    total_charged_ugx: parseNumber(summary?.total_charged_ugx),
    total_collected_ugx: parseNumber(summary?.total_collected_ugx),
    cash_total_ugx: parseNumber(summary?.cash_total_ugx),
    mpesa_total_ugx: parseNumber(summary?.mpesa_total_ugx),
    card_total_ugx: parseNumber(summary?.card_total_ugx),
    transfer_total_ugx: parseNumber(summary?.transfer_total_ugx),
    pesapal_total_ugx: parseNumber(summary?.pesapal_total_ugx),
    pesapal_manual_total_ugx: parseNumber(summary?.pesapal_manual_total_ugx),
    receipt_count: parseNumber(summary?.receipt_count),
    missing_receipt_count: parseNumber(summary?.missing_receipt_count),
    voided_charges_count: parseNumber(summary?.voided_charges_count),
    voided_charges_amount_ugx: parseNumber(summary?.voided_charges_amount_ugx),
    open_balance_count: parseNumber(summary?.open_balance_count),
    open_balance_amount_ugx: parseNumber(summary?.open_balance_amount_ugx),
    pending_payment_count: parseNumber(summary?.pending_payment_count),
    pending_payment_amount_ugx: parseNumber(summary?.pending_payment_amount_ugx)
  };

  const paymentMethods: NightAuditPaymentMethodTotal[] = PAYMENT_METHOD_ORDER.map((method) => ({
    method,
    count:
      method === "cash"
        ? parseNumber(summary?.cash_count)
        : method === "mpesa"
          ? parseNumber(summary?.mpesa_count)
          : method === "card"
            ? parseNumber(summary?.card_count)
            : method === "transfer"
              ? parseNumber(summary?.transfer_count)
              : method === "pesapal"
                ? parseNumber(summary?.pesapal_count)
                : parseNumber(summary?.pesapal_manual_count),
    total_ugx:
      method === "cash"
        ? parseNumber(summary?.cash_total_ugx)
        : method === "mpesa"
          ? parseNumber(summary?.mpesa_total_ugx)
          : method === "card"
            ? parseNumber(summary?.card_total_ugx)
            : method === "transfer"
              ? parseNumber(summary?.transfer_total_ugx)
              : method === "pesapal"
                ? parseNumber(summary?.pesapal_total_ugx)
                : parseNumber(summary?.pesapal_manual_total_ugx)
  }));

  const unsettledBookings = unsettledRows.map((row) => ({
    id: row.id,
    reference: row.reference,
    guest_full_name: row.guest_full_name,
    room_type_title: row.room_type_title,
    room_unit_name: row.room_unit_name,
    status: row.status,
    check_in: row.check_in,
    check_out: row.check_out,
    total_charges_ugx: parseNumber(row.total_charges_ugx),
    total_paid_ugx: parseNumber(row.total_paid_ugx),
    balance_due_ugx: parseNumber(row.balance_due_ugx),
    issue_type: row.issue_type
  })) as NightAuditBookingIssue[];

  const closeRecordRow = closeRows[0];
  const closeRecord: NightAuditCloseRecord | null = closeRecordRow
    ? {
        id: closeRecordRow.id,
        business_date: closeRecordRow.business_date,
        closed_at: closeRecordRow.closed_at,
        closed_by_name: closeRecordRow.closed_by_name,
        opening_float_ugx: parseNumber(closeRecordRow.opening_float_ugx),
        cash_counted_ugx: parseNumber(closeRecordRow.cash_counted_ugx),
        cash_difference_ugx: parseNumber(closeRecordRow.cash_difference_ugx),
        total_units: parseNumber(closeRecordRow.total_units),
        occupied_room_nights: parseNumber(closeRecordRow.occupied_room_nights),
        occupancy_percent: parseNumber(closeRecordRow.occupancy_percent),
        arrivals: parseNumber(closeRecordRow.arrivals),
        departures: parseNumber(closeRecordRow.departures),
        total_charged_ugx: parseNumber(closeRecordRow.total_charged_ugx),
        total_collected_ugx: parseNumber(closeRecordRow.total_collected_ugx),
        cash_total_ugx: parseNumber(closeRecordRow.cash_total_ugx),
        mpesa_total_ugx: parseNumber(closeRecordRow.mpesa_total_ugx),
        card_total_ugx: parseNumber(closeRecordRow.card_total_ugx),
        transfer_total_ugx: parseNumber(closeRecordRow.transfer_total_ugx),
        pesapal_total_ugx: parseNumber(closeRecordRow.pesapal_total_ugx),
        pesapal_manual_total_ugx: parseNumber(closeRecordRow.pesapal_manual_total_ugx),
        receipt_count: parseNumber(closeRecordRow.receipt_count),
        missing_receipt_count: parseNumber(closeRecordRow.missing_receipt_count),
        voided_charges_count: parseNumber(closeRecordRow.voided_charges_count),
        voided_charges_amount_ugx: parseNumber(closeRecordRow.voided_charges_amount_ugx),
        open_balance_count: parseNumber(closeRecordRow.open_balance_count),
        open_balance_amount_ugx: parseNumber(closeRecordRow.open_balance_amount_ugx),
        pending_payment_count: parseNumber(closeRecordRow.pending_payment_count),
        pending_payment_amount_ugx: parseNumber(closeRecordRow.pending_payment_amount_ugx),
        notes: closeRecordRow.notes,
        voided_at: toIsoUtc(closeRecordRow.voided_at),
        voided_by_name: closeRecordRow.voided_by_name,
        void_reason: closeRecordRow.void_reason
      }
    : null;

  return {
    summary: dataSummary,
    paymentMethods,
    unsettledBookings,
    closeRecord
  };
}
