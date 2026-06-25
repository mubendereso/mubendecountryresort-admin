import "server-only";

import { getSql } from "@/lib/db/client";
import type {
  CompanyAccount,
  CompanyAccountDetail,
  CompanyPayment,
  CompanyPaymentAllocation,
  CompanySelectOption
} from "./types";
import type { ReservationGroupRow } from "@/lib/groups/types";

export type {
  CompanyAccount,
  CompanyAccountDetail,
  CompanyPayment,
  CompanyPaymentAllocation,
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
      ca.created_by::text,
      au.full_name AS created_by_name,
      to_char(ca.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(ca.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      COUNT(rg.id)::int AS linked_group_count,
      COUNT(rg.id) FILTER (WHERE rg.status = 'active')::int AS active_group_count,
      COALESCE(SUM(group_balances.balance_due_ugx) FILTER (WHERE rg.status = 'active'), 0)::bigint AS outstanding_balance_ugx
    FROM company_accounts ca
    LEFT JOIN admin_users au ON au.id = ca.created_by
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
    GROUP BY ca.id, au.full_name
    ORDER BY ca.is_active DESC, ca.company_name ASC
  `) as CompanyAccount[];

  return rows.map(normalizeCompany);
}

export async function listCompanySelectOptions(): Promise<CompanySelectOption[]> {
  const sql = getSql();
  return (await sql`
    SELECT id::text, company_name, contact_name, is_active
    FROM company_accounts
    ORDER BY is_active DESC, company_name ASC
  `) as CompanySelectOption[];
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
      ca.created_by::text,
      au.full_name AS created_by_name,
      to_char(ca.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(ca.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      COUNT(rg.id)::int AS linked_group_count,
      COUNT(rg.id) FILTER (WHERE rg.status = 'active')::int AS active_group_count,
      COALESCE(SUM(group_balances.balance_due_ugx) FILTER (WHERE rg.status = 'active'), 0)::bigint AS outstanding_balance_ugx
    FROM company_accounts ca
    LEFT JOIN admin_users au ON au.id = ca.created_by
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
    GROUP BY ca.id, au.full_name
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
  const [company, groups] = await Promise.all([
    getCompanyAccountById(companyId),
    listCompanyGroups(companyId)
  ]);

  if (!company) return null;
  return { company, groups };
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
        capa.amount_ugx,
        to_char(capa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM company_account_payment_allocations capa
      JOIN company_account_payments cap ON cap.id = capa.company_payment_id
      JOIN invoices i ON i.id = capa.invoice_id
      JOIN reservation_groups rg ON rg.id = capa.group_id
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
