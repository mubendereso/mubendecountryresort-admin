import "server-only";

import { getSql } from "@/lib/db/client";
import type {
  CompanyAccount,
  CompanyAccountDetail,
  CompanyBookingExposure,
  CompanyCreditAssessment,
  CompanyPayment,
  CompanyPaymentAllocation,
  CompanyRoomRate,
  CompanySelectOption
} from "./types";
import type { ReservationGroupRow } from "@/lib/groups/types";

export type {
  CompanyAccount,
  CompanyAccountDetail,
  CompanyBookingExposure,
  CompanyCreditAssessment,
  CompanyPayment,
  CompanyPaymentAllocation,
  CompanyRoomRate,
  CompanySelectOption
} from "./types";

function normalizeCompany(row: CompanyAccount): CompanyAccount {
  return {
    ...row,
    payment_terms_days: Number(row.payment_terms_days),
    credit_limit_ugx: Number(row.credit_limit_ugx),
    linked_group_count: Number(row.linked_group_count),
    active_group_count: Number(row.active_group_count),
    outstanding_balance_ugx: Number(row.outstanding_balance_ugx)
  };
}

function normalizeGroup(row: ReservationGroupRow): ReservationGroupRow {
  return {
    ...row,
    booking_count: Number(row.booking_count),
    historical_booking_count: Number(row.historical_booking_count),
    inactive_booking_count: Number(row.inactive_booking_count),
    guest_count: Number(row.guest_count),
    historical_guest_count: Number(row.historical_guest_count),
    inactive_guest_count: Number(row.inactive_guest_count),
    total_charges_ugx: Number(row.total_charges_ugx),
    total_paid_ugx: Number(row.total_paid_ugx),
    balance_due_ugx: Number(row.balance_due_ugx),
    historical_total_charges_ugx: Number(row.historical_total_charges_ugx),
    historical_total_paid_ugx: Number(row.historical_total_paid_ugx),
    historical_balance_due_ugx: Number(row.historical_balance_due_ugx),
    company_payment_terms_days:
      row.company_payment_terms_days === null ? null : Number(row.company_payment_terms_days),
    company_credit_limit_ugx:
      row.company_credit_limit_ugx === null ? null : Number(row.company_credit_limit_ugx)
  };
}

export async function listCompanyAccounts(): Promise<CompanyAccount[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      ca.id::text,
      ca.company_name,
      ca.contact_name,
      ca.contact_email,
      ca.contact_phone,
      ca.billing_address,
      ca.tax_id,
      ca.payment_terms_days,
      ca.credit_limit_ugx,
      ca.notes,
      ca.is_active,
      ca.is_suspended,
      to_char(ca.suspended_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS suspended_at,
      ca.suspended_by::text,
      suspended.full_name AS suspended_by_name,
      ca.suspension_reason,
      ca.created_by::text,
      au.full_name AS created_by_name,
      to_char(ca.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(ca.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      COUNT(rg.id)::int AS linked_group_count,
      COUNT(rg.id) FILTER (WHERE rg.status = 'active')::int AS active_group_count,
      COALESCE(SUM(group_balances.balance_due_ugx) FILTER (WHERE rg.status = 'active'), 0)::bigint AS outstanding_balance_ugx
    FROM company_accounts ca
    LEFT JOIN admin_users au ON au.id = ca.created_by
    LEFT JOIN admin_users suspended ON suspended.id = ca.suspended_by
    LEFT JOIN reservation_groups rg ON rg.company_account_id = ca.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        SUM(
          CASE
            WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)
              - COALESCE(
                payments.total_paid_ugx,
                CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
              )
            ELSE 0
          END
        ),
        0
      )::bigint AS balance_due_ugx
      FROM bookings b
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
      WHERE b.group_id = rg.id
    ) group_balances ON true
    GROUP BY ca.id, au.full_name, suspended.full_name
    ORDER BY ca.is_active DESC, ca.company_name ASC
  `) as CompanyAccount[];

  return rows.map(normalizeCompany);
}

export async function listCompanySelectOptions(): Promise<CompanySelectOption[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id::text, company_name, contact_name, is_active, is_suspended
    FROM company_accounts
    ORDER BY is_active DESC, company_name ASC
  `) as Pick<CompanySelectOption, "id" | "company_name" | "contact_name" | "is_active" | "is_suspended">[];

  return Promise.all(rows.map(async (company) => {
    const credit = await getCompanyCreditAssessment(company.id);
    return {
      ...company,
      credit_status: credit?.credit_status ?? "clear",
      available_credit_ugx: credit?.available_credit_ugx ?? 0,
      overdue_invoices_ugx: credit?.overdue_invoices_ugx ?? 0
    };
  }));
}

export async function getCompanyAccountById(companyId: string): Promise<CompanyAccount | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      ca.id::text,
      ca.company_name,
      ca.contact_name,
      ca.contact_email,
      ca.contact_phone,
      ca.billing_address,
      ca.tax_id,
      ca.payment_terms_days,
      ca.credit_limit_ugx,
      ca.notes,
      ca.is_active,
      ca.is_suspended,
      to_char(ca.suspended_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS suspended_at,
      ca.suspended_by::text,
      suspended.full_name AS suspended_by_name,
      ca.suspension_reason,
      ca.created_by::text,
      au.full_name AS created_by_name,
      to_char(ca.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(ca.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      COUNT(rg.id)::int AS linked_group_count,
      COUNT(rg.id) FILTER (WHERE rg.status = 'active')::int AS active_group_count,
      COALESCE(SUM(group_balances.balance_due_ugx) FILTER (WHERE rg.status = 'active'), 0)::bigint AS outstanding_balance_ugx
    FROM company_accounts ca
    LEFT JOIN admin_users au ON au.id = ca.created_by
    LEFT JOIN admin_users suspended ON suspended.id = ca.suspended_by
    LEFT JOIN reservation_groups rg ON rg.company_account_id = ca.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        SUM(
          CASE
            WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)
              - COALESCE(
                payments.total_paid_ugx,
                CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
              )
            ELSE 0
          END
        ),
        0
      )::bigint AS balance_due_ugx
      FROM bookings b
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
      WHERE b.group_id = rg.id
    ) group_balances ON true
    WHERE ca.id = ${companyId}::uuid
    GROUP BY ca.id, au.full_name, suspended.full_name
    LIMIT 1
  `) as CompanyAccount[];

  const company = rows[0];
  return company ? normalizeCompany(company) : null;
}

export async function listCompanyGroups(companyId: string): Promise<ReservationGroupRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      rg.id::text,
      rg.reference,
      rg.status,
      rg.group_name,
      rg.organizer_name,
      rg.organizer_email,
      rg.organizer_phone,
      rg.notes,
      rg.company_account_id::text,
      ca.company_name,
      ca.contact_name AS company_contact_name,
      ca.contact_email AS company_contact_email,
      ca.contact_phone AS company_contact_phone,
      ca.payment_terms_days AS company_payment_terms_days,
      ca.credit_limit_ugx AS company_credit_limit_ugx,
      COUNT(b.id) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded'))::int AS booking_count,
      COUNT(b.id)::int AS historical_booking_count,
      COUNT(b.id) FILTER (WHERE b.status IN ('cancelled', 'no_show', 'refunded'))::int AS inactive_booking_count,
      COALESCE(SUM(b.guests_adults + b.guests_children) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')), 0)::int AS guest_count,
      COALESCE(SUM(b.guests_adults + b.guests_children), 0)::int AS historical_guest_count,
      COALESCE(SUM(b.guests_adults + b.guests_children) FILTER (WHERE b.status IN ('cancelled', 'no_show', 'refunded')), 0)::int AS inactive_guest_count,
      COALESCE(SUM(CASE WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(charges.total_charges_ugx, b.quoted_total_ugx) ELSE 0 END), 0)::bigint AS total_charges_ugx,
      COALESCE(SUM(CASE WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(payments.total_paid_ugx, CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END) ELSE 0 END), 0)::bigint AS total_paid_ugx,
      COALESCE(SUM(CASE WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(charges.total_charges_ugx, b.quoted_total_ugx) - COALESCE(payments.total_paid_ugx, CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END) ELSE 0 END), 0)::bigint AS balance_due_ugx,
      COALESCE(SUM(COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)), 0)::bigint AS historical_total_charges_ugx,
      COALESCE(SUM(COALESCE(payments.total_paid_ugx, CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END)), 0)::bigint AS historical_total_paid_ugx,
      COALESCE(SUM(COALESCE(charges.total_charges_ugx, b.quoted_total_ugx) - COALESCE(payments.total_paid_ugx, CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END)), 0)::bigint AS historical_balance_due_ugx,
      COALESCE(MIN(b.check_in) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')), MIN(b.check_in))::text AS first_check_in,
      COALESCE(MAX(b.check_out) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')), MAX(b.check_out))::text AS last_check_out,
      to_char(rg.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(rg.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
    FROM reservation_groups rg
    JOIN company_accounts ca ON ca.id = rg.company_account_id
    LEFT JOIN bookings b ON b.group_id = rg.id
    LEFT JOIN LATERAL (
      SELECT sum(CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END) FILTER (WHERE fc.voided_at IS NULL) AS total_charges_ugx
      FROM folio_charges fc
      WHERE fc.booking_id = b.id
    ) charges ON true
    LEFT JOIN LATERAL (
      SELECT sum(fp.amount_ugx) AS total_paid_ugx
      FROM folio_payments fp
      WHERE fp.booking_id = b.id
    ) payments ON true
    WHERE rg.company_account_id = ${companyId}::uuid
    GROUP BY rg.id, ca.id
    ORDER BY rg.status ASC, rg.created_at DESC
  `) as ReservationGroupRow[];

  return rows.map(normalizeGroup);
}

export async function getCompanyAccountDetail(companyId: string): Promise<CompanyAccountDetail | null> {
  const [company, groups, bookings, rates, credit] = await Promise.all([
    getCompanyAccountById(companyId),
    listCompanyGroups(companyId),
    listCompanyBookings(companyId),
    listCompanyRoomRates(companyId),
    getCompanyCreditAssessment(companyId)
  ]);

  if (!company || !credit) return null;
  return { company, groups, bookings, rates, credit };
}

export async function getCompanyCreditAssessment(companyId: string): Promise<CompanyCreditAssessment | null> {
  const sql = getSql();
  const rows = (await sql`
    WITH invoice_balances AS (
      SELECT
        i.id,
        i.invoice_type,
        i.booking_id,
        i.group_id,
        i.due_date,
        GREATEST(0, i.total_charges_ugx - COALESCE(live.paid_ugx, i.total_paid_ugx))::bigint AS balance_ugx
      FROM invoices i
      LEFT JOIN LATERAL (
        SELECT CASE
          WHEN i.invoice_type = 'booking' THEN (
            SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint FROM folio_payments fp WHERE fp.booking_id = i.booking_id
          )
          ELSE (
            SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
            FROM folio_payments fp JOIN bookings b ON b.id = fp.booking_id WHERE b.group_id = i.group_id
          )
        END AS paid_ugx
      ) live ON true
      WHERE i.company_account_id = ${companyId}::uuid AND i.status = 'issued'
    ),
    booking_balances AS (
      SELECT
        b.id,
        b.group_id,
        GREATEST(
          COALESCE(charges.total_ugx, b.quoted_total_ugx) -
          COALESCE(payments.total_ugx, CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END),
          0
        )::bigint AS balance_ugx
      FROM bookings b
      LEFT JOIN LATERAL (
        SELECT (SUM(CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END)
          FILTER (WHERE fc.voided_at IS NULL))::bigint AS total_ugx
        FROM folio_charges fc WHERE fc.booking_id = b.id
      ) charges ON true
      LEFT JOIN LATERAL (
        SELECT SUM(fp.amount_ugx)::bigint AS total_ugx FROM folio_payments fp WHERE fp.booking_id = b.id
      ) payments ON true
      LEFT JOIN reservation_groups rg ON rg.id = b.group_id
      WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')
        AND (b.company_account_id = ${companyId}::uuid OR rg.company_account_id = ${companyId}::uuid)
    ),
    group_balances AS (
      SELECT bb.group_id, SUM(bb.balance_ugx)::bigint AS balance_ugx
      FROM booking_balances bb
      JOIN reservation_groups rg ON rg.id = bb.group_id
      WHERE rg.company_account_id = ${companyId}::uuid AND rg.status = 'active'
      GROUP BY bb.group_id
    ),
    direct_balances AS (
      SELECT bb.id AS booking_id, bb.balance_ugx
      FROM booking_balances bb
      JOIN bookings b ON b.id = bb.id
      WHERE b.company_account_id = ${companyId}::uuid AND b.group_id IS NULL
    ),
    totals AS (
      SELECT
        COALESCE((SELECT SUM(balance_ugx) FROM invoice_balances), 0)::bigint AS open_invoices,
        COALESCE((SELECT SUM(balance_ugx) FROM invoice_balances WHERE due_date < CURRENT_DATE AND balance_ugx > 0), 0)::bigint AS overdue,
        COALESCE((SELECT COUNT(*) FROM invoice_balances WHERE due_date < CURRENT_DATE AND balance_ugx > 0), 0)::int AS overdue_count,
        COALESCE((SELECT SUM(balance_ugx) FROM group_balances), 0)::bigint AS group_exposure,
        COALESCE((SELECT SUM(balance_ugx) FROM direct_balances), 0)::bigint AS booking_exposure,
        COALESCE((SELECT SUM(gb.balance_ugx) FROM group_balances gb WHERE NOT EXISTS (
          SELECT 1 FROM invoice_balances ib WHERE ib.group_id = gb.group_id AND ib.balance_ugx > 0
        )), 0)::bigint AS unbilled_group,
        COALESCE((SELECT SUM(db.balance_ugx) FROM direct_balances db WHERE NOT EXISTS (
          SELECT 1 FROM invoice_balances ib WHERE ib.booking_id = db.booking_id AND ib.balance_ugx > 0
        )), 0)::bigint AS unbilled_booking,
        COALESCE((SELECT SUM(balance_ugx) FROM invoice_balances WHERE due_date >= CURRENT_DATE OR due_date IS NULL), 0)::bigint AS aging_current,
        COALESCE((SELECT SUM(balance_ugx) FROM invoice_balances WHERE CURRENT_DATE - due_date BETWEEN 1 AND 30), 0)::bigint AS aging_1_30,
        COALESCE((SELECT SUM(balance_ugx) FROM invoice_balances WHERE CURRENT_DATE - due_date BETWEEN 31 AND 60), 0)::bigint AS aging_31_60,
        COALESCE((SELECT SUM(balance_ugx) FROM invoice_balances WHERE CURRENT_DATE - due_date BETWEEN 61 AND 90), 0)::bigint AS aging_61_90,
        COALESCE((SELECT SUM(balance_ugx) FROM invoice_balances WHERE CURRENT_DATE - due_date > 90), 0)::bigint AS aging_90_plus
    )
    SELECT
      ca.id::text AS company_account_id,
      ca.is_active,
      ca.is_suspended,
      ca.credit_limit_ugx,
      t.open_invoices AS total_open_invoices_ugx,
      t.overdue AS overdue_invoices_ugx,
      t.overdue_count AS overdue_invoice_count,
      t.group_exposure AS current_group_exposure_ugx,
      t.booking_exposure AS current_booking_exposure_ugx,
      t.unbilled_group AS unbilled_group_exposure_ugx,
      t.unbilled_booking AS unbilled_booking_exposure_ugx,
      (t.open_invoices + t.unbilled_group + t.unbilled_booking)::bigint AS total_credit_exposure_ugx,
      GREATEST(ca.credit_limit_ugx - (t.open_invoices + t.unbilled_group + t.unbilled_booking), 0)::bigint AS available_credit_ugx,
      t.aging_current AS aging_current_ugx,
      t.aging_1_30 AS aging_1_30_ugx,
      t.aging_31_60 AS aging_31_60_ugx,
      t.aging_61_90 AS aging_61_90_ugx,
      t.aging_90_plus AS aging_90_plus_ugx,
      CASE
        WHEN ca.is_suspended THEN 'suspended'
        WHEN t.overdue > 0 THEN 'overdue'
        WHEN (t.open_invoices + t.unbilled_group + t.unbilled_booking) > ca.credit_limit_ugx THEN 'over_limit'
        WHEN ca.credit_limit_ugx > 0 AND (t.open_invoices + t.unbilled_group + t.unbilled_booking) * 100 >= ca.credit_limit_ugx * 80 THEN 'warning'
        ELSE 'clear'
      END AS credit_status
    FROM company_accounts ca CROSS JOIN totals t
    WHERE ca.id = ${companyId}::uuid
  `) as CompanyCreditAssessment[];

  const row = rows[0];
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    key.endsWith("_ugx") || key === "overdue_invoice_count" ? Number(value) : value
  ])) as CompanyCreditAssessment;
}

export async function listCompanyBookings(companyId: string): Promise<CompanyBookingExposure[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      b.id::text, b.reference, b.guest_full_name, rt.title AS room_type_title,
      b.check_in::text, b.check_out::text, b.status,
      COALESCE(charges.total_ugx, b.quoted_total_ugx)::bigint AS total_charges_ugx,
      COALESCE(payments.total_ugx, CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END)::bigint AS total_paid_ugx,
      GREATEST(COALESCE(charges.total_ugx, b.quoted_total_ugx) - COALESCE(payments.total_ugx, CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END), 0)::bigint AS balance_due_ugx
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN LATERAL (
      SELECT (SUM(CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END)
        FILTER (WHERE fc.voided_at IS NULL))::bigint AS total_ugx
      FROM folio_charges fc WHERE fc.booking_id = b.id
    ) charges ON true
    LEFT JOIN LATERAL (SELECT SUM(fp.amount_ugx)::bigint AS total_ugx FROM folio_payments fp WHERE fp.booking_id = b.id) payments ON true
    WHERE b.company_account_id = ${companyId}::uuid AND b.group_id IS NULL
    ORDER BY b.check_in DESC, b.created_at DESC
  `) as CompanyBookingExposure[];
  return rows.map((row) => ({ ...row, total_charges_ugx: Number(row.total_charges_ugx), total_paid_ugx: Number(row.total_paid_ugx), balance_due_ugx: Number(row.balance_due_ugx) }));
}

export async function listCompanyRoomRates(companyId: string): Promise<CompanyRoomRate[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT crr.id::text, crr.company_account_id::text, crr.room_type_id::text,
      rt.slug AS room_type_slug, rt.title AS room_type_title, rt.price_ugx AS public_rate_ugx,
      crr.rate_ugx, crr.valid_from::text, crr.valid_to::text, crr.status, crr.notes,
      crr.created_by::text, au.full_name AS created_by_name,
      to_char(crr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(crr.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
    FROM company_room_rates crr
    JOIN room_types rt ON rt.id = crr.room_type_id
    LEFT JOIN admin_users au ON au.id = crr.created_by
    WHERE crr.company_account_id = ${companyId}::uuid
    ORDER BY crr.status, rt.title, crr.valid_from DESC
  `) as CompanyRoomRate[];
  return rows.map((row) => ({ ...row, public_rate_ugx: Number(row.public_rate_ugx), rate_ugx: Number(row.rate_ugx) }));
}

export async function getApplicableCompanyRate(companyId: string, roomTypeId: string, checkIn: string, checkOut: string): Promise<CompanyRoomRate | null> {
  const rates = await listCompanyRoomRates(companyId);
  const lastNight = new Date(`${checkOut}T00:00:00Z`);
  lastNight.setUTCDate(lastNight.getUTCDate() - 1);
  const lastNightIso = lastNight.toISOString().slice(0, 10);
  return rates.find((rate) => rate.room_type_id === roomTypeId && rate.status === "active" && rate.valid_from <= checkIn && (!rate.valid_to || rate.valid_to >= lastNightIso)) ?? null;
}

export async function listCompanyPayments(companyId: string): Promise<CompanyPayment[]> {
  const sql = getSql();
  const [paymentRows, allocationRows] = await Promise.all([
    sql`
      SELECT
        cap.id::text,
        cap.company_account_id::text,
        cap.amount_ugx,
        cap.method,
        cap.reference,
        cap.note,
        cap.recorded_by::text,
        au.full_name AS recorded_by_name,
        to_char(cap.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recorded_at,
        COALESCE(SUM(capa.amount_ugx), 0)::bigint AS allocated_amount_ugx,
        COUNT(capa.id)::int AS allocation_count
      FROM company_account_payments cap
      LEFT JOIN admin_users au ON au.id = cap.recorded_by
      LEFT JOIN company_account_payment_allocations capa ON capa.company_payment_id = cap.id
      WHERE cap.company_account_id = ${companyId}::uuid
      GROUP BY cap.id, au.full_name
      ORDER BY cap.recorded_at DESC, cap.id DESC
      LIMIT 50
    `,
    sql`
      SELECT
        capa.id::text,
        capa.company_payment_id::text,
        capa.invoice_id::text,
        i.invoice_number,
        i.source_reference AS invoice_source_reference,
        capa.group_id::text,
        rg.reference AS group_reference,
        rg.group_name,
        capa.group_payment_id::text,
        capa.booking_id::text,
        b.reference AS booking_reference,
        b.guest_full_name AS guest_name,
        capa.folio_payment_id::text,
        capa.amount_ugx,
        to_char(capa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM company_account_payment_allocations capa
      JOIN company_account_payments cap ON cap.id = capa.company_payment_id
      JOIN invoices i ON i.id = capa.invoice_id
      LEFT JOIN reservation_groups rg ON rg.id = capa.group_id
      LEFT JOIN bookings b ON b.id = capa.booking_id
      WHERE cap.company_account_id = ${companyId}::uuid
      ORDER BY capa.created_at DESC, capa.id DESC
    `
  ]);

  const allocationsByPayment = new Map<string, CompanyPaymentAllocation[]>();
  for (const allocation of allocationRows as CompanyPaymentAllocation[]) {
    const normalized = {
      ...allocation,
      amount_ugx: Number(allocation.amount_ugx)
    };
    allocationsByPayment.set(normalized.company_payment_id, [
      ...(allocationsByPayment.get(normalized.company_payment_id) ?? []),
      normalized
    ]);
  }

  return (paymentRows as CompanyPayment[]).map((payment) => ({
    ...payment,
    amount_ugx: Number(payment.amount_ugx),
    allocated_amount_ugx: Number(payment.allocated_amount_ugx),
    allocation_count: Number(payment.allocation_count),
    allocations: allocationsByPayment.get(payment.id) ?? []
  }));
}
