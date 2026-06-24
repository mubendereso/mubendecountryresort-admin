import "server-only";

import { getSql } from "@/lib/db/client";
import type { InvoiceDetail, InvoiceLine, InvoiceRow } from "./types";

export type { InvoiceDetail, InvoiceLine, InvoiceRow } from "./types";

function normalizeInvoice(row: InvoiceRow): InvoiceRow {
  const currentPaid = Number(row.current_paid_ugx);
  const currentBalance = Math.max(0, Number(row.total_charges_ugx) - currentPaid);
  const daysOverdue = Number(row.days_overdue);
  const paymentStatus =
    row.status === "draft"
      ? "draft"
      : row.status === "voided"
        ? "voided"
        : currentBalance <= 0
          ? "paid"
          : daysOverdue > 0
            ? "overdue"
            : currentPaid > 0
              ? "part_paid"
              : "unpaid";
  const agingBucket =
    row.status === "draft"
      ? "draft"
      : row.status === "voided"
        ? "voided"
        : currentBalance <= 0
          ? "paid"
          : daysOverdue <= 0
            ? "current"
            : daysOverdue <= 30
              ? "1_30"
              : daysOverdue <= 60
                ? "31_60"
                : daysOverdue <= 90
                  ? "61_90"
                  : "90_plus";

  return {
    ...row,
    payment_terms_days: Number(row.payment_terms_days),
    total_charges_ugx: Number(row.total_charges_ugx),
    total_paid_ugx: Number(row.total_paid_ugx),
    balance_due_ugx: Number(row.balance_due_ugx),
    current_paid_ugx: currentPaid,
    current_balance_due_ugx: currentBalance,
    payment_status: paymentStatus,
    days_overdue: daysOverdue,
    aging_bucket: agingBucket,
    source_snapshot:
      typeof row.source_snapshot === "string"
        ? JSON.parse(row.source_snapshot)
        : row.source_snapshot ?? {}
  };
}

function normalizeLine(row: InvoiceLine): InvoiceLine {
  return {
    ...row,
    line_order: Number(row.line_order),
    quantity: Number(row.quantity),
    unit_amount_ugx: Number(row.unit_amount_ugx),
    amount_ugx: Number(row.amount_ugx)
  };
}

export async function listInvoices(limit = 100): Promise<InvoiceRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      i.id::text,
      i.invoice_number,
      i.invoice_type,
      i.status,
      i.booking_id::text,
      i.group_id::text,
      i.company_account_id::text,
      i.source_reference,
      i.source_title,
      i.bill_to_name,
      i.bill_to_contact,
      i.bill_to_email,
      i.bill_to_phone,
      i.bill_to_address,
      i.tax_id,
      i.stay_start::text,
      i.stay_end::text,
      i.payment_terms_days,
      i.due_date::text,
      i.total_charges_ugx,
      i.total_paid_ugx,
      i.balance_due_ugx,
      COALESCE(live.current_paid_ugx, i.total_paid_ugx)::bigint AS current_paid_ugx,
      GREATEST(0, i.total_charges_ugx - COALESCE(live.current_paid_ugx, i.total_paid_ugx))::bigint AS current_balance_due_ugx,
      COALESCE(GREATEST(0, (CURRENT_DATE - i.due_date)), 0)::int AS days_overdue,
      i.note,
      i.source_snapshot,
      i.created_by::text,
      created.full_name AS created_by_name,
      i.issued_by::text,
      issued.full_name AS issued_by_name,
      i.voided_by::text,
      voided.full_name AS voided_by_name,
      to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(i.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      to_char(i.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS issued_at,
      to_char(i.voided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS voided_at,
      i.void_reason
    FROM invoices i
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN i.invoice_type = 'booking' THEN (
          SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
          FROM folio_payments fp
          WHERE fp.booking_id = i.booking_id
        )
        WHEN i.invoice_type = 'group' THEN (
          SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
          FROM folio_payments fp
          JOIN bookings b ON b.id = fp.booking_id
          WHERE b.group_id = i.group_id
        )
        ELSE i.total_paid_ugx
      END AS current_paid_ugx
    ) live ON true
    LEFT JOIN admin_users created ON created.id = i.created_by
    LEFT JOIN admin_users issued ON issued.id = i.issued_by
    LEFT JOIN admin_users voided ON voided.id = i.voided_by
    ORDER BY i.created_at DESC
    LIMIT ${limit}
  `) as InvoiceRow[];

  return rows.map(normalizeInvoice);
}

export async function listInvoicesForBooking(bookingId: string): Promise<InvoiceRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      i.id::text,
      i.invoice_number,
      i.invoice_type,
      i.status,
      i.booking_id::text,
      i.group_id::text,
      i.company_account_id::text,
      i.source_reference,
      i.source_title,
      i.bill_to_name,
      i.bill_to_contact,
      i.bill_to_email,
      i.bill_to_phone,
      i.bill_to_address,
      i.tax_id,
      i.stay_start::text,
      i.stay_end::text,
      i.payment_terms_days,
      i.due_date::text,
      i.total_charges_ugx,
      i.total_paid_ugx,
      i.balance_due_ugx,
      COALESCE(live.current_paid_ugx, i.total_paid_ugx)::bigint AS current_paid_ugx,
      GREATEST(0, i.total_charges_ugx - COALESCE(live.current_paid_ugx, i.total_paid_ugx))::bigint AS current_balance_due_ugx,
      COALESCE(GREATEST(0, (CURRENT_DATE - i.due_date)), 0)::int AS days_overdue,
      i.note,
      i.source_snapshot,
      i.created_by::text,
      created.full_name AS created_by_name,
      i.issued_by::text,
      issued.full_name AS issued_by_name,
      i.voided_by::text,
      voided.full_name AS voided_by_name,
      to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(i.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      to_char(i.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS issued_at,
      to_char(i.voided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS voided_at,
      i.void_reason
    FROM invoices i
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN i.invoice_type = 'booking' THEN (
          SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
          FROM folio_payments fp
          WHERE fp.booking_id = i.booking_id
        )
        WHEN i.invoice_type = 'group' THEN (
          SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
          FROM folio_payments fp
          JOIN bookings b ON b.id = fp.booking_id
          WHERE b.group_id = i.group_id
        )
        ELSE i.total_paid_ugx
      END AS current_paid_ugx
    ) live ON true
    LEFT JOIN admin_users created ON created.id = i.created_by
    LEFT JOIN admin_users issued ON issued.id = i.issued_by
    LEFT JOIN admin_users voided ON voided.id = i.voided_by
    WHERE i.booking_id = ${bookingId}::uuid
    ORDER BY i.created_at DESC
  `) as InvoiceRow[];

  return rows.map(normalizeInvoice);
}

export async function listInvoicesForGroup(groupId: string): Promise<InvoiceRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      i.id::text,
      i.invoice_number,
      i.invoice_type,
      i.status,
      i.booking_id::text,
      i.group_id::text,
      i.company_account_id::text,
      i.source_reference,
      i.source_title,
      i.bill_to_name,
      i.bill_to_contact,
      i.bill_to_email,
      i.bill_to_phone,
      i.bill_to_address,
      i.tax_id,
      i.stay_start::text,
      i.stay_end::text,
      i.payment_terms_days,
      i.due_date::text,
      i.total_charges_ugx,
      i.total_paid_ugx,
      i.balance_due_ugx,
      COALESCE(live.current_paid_ugx, i.total_paid_ugx)::bigint AS current_paid_ugx,
      GREATEST(0, i.total_charges_ugx - COALESCE(live.current_paid_ugx, i.total_paid_ugx))::bigint AS current_balance_due_ugx,
      COALESCE(GREATEST(0, (CURRENT_DATE - i.due_date)), 0)::int AS days_overdue,
      i.note,
      i.source_snapshot,
      i.created_by::text,
      created.full_name AS created_by_name,
      i.issued_by::text,
      issued.full_name AS issued_by_name,
      i.voided_by::text,
      voided.full_name AS voided_by_name,
      to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(i.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      to_char(i.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS issued_at,
      to_char(i.voided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS voided_at,
      i.void_reason
    FROM invoices i
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN i.invoice_type = 'booking' THEN (
          SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
          FROM folio_payments fp
          WHERE fp.booking_id = i.booking_id
        )
        WHEN i.invoice_type = 'group' THEN (
          SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
          FROM folio_payments fp
          JOIN bookings b ON b.id = fp.booking_id
          WHERE b.group_id = i.group_id
        )
        ELSE i.total_paid_ugx
      END AS current_paid_ugx
    ) live ON true
    LEFT JOIN admin_users created ON created.id = i.created_by
    LEFT JOIN admin_users issued ON issued.id = i.issued_by
    LEFT JOIN admin_users voided ON voided.id = i.voided_by
    WHERE i.group_id = ${groupId}::uuid
    ORDER BY i.created_at DESC
  `) as InvoiceRow[];

  return rows.map(normalizeInvoice);
}

export async function listInvoicesForCompany(companyId: string): Promise<InvoiceRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      i.id::text,
      i.invoice_number,
      i.invoice_type,
      i.status,
      i.booking_id::text,
      i.group_id::text,
      i.company_account_id::text,
      i.source_reference,
      i.source_title,
      i.bill_to_name,
      i.bill_to_contact,
      i.bill_to_email,
      i.bill_to_phone,
      i.bill_to_address,
      i.tax_id,
      i.stay_start::text,
      i.stay_end::text,
      i.payment_terms_days,
      i.due_date::text,
      i.total_charges_ugx,
      i.total_paid_ugx,
      i.balance_due_ugx,
      COALESCE(live.current_paid_ugx, i.total_paid_ugx)::bigint AS current_paid_ugx,
      GREATEST(0, i.total_charges_ugx - COALESCE(live.current_paid_ugx, i.total_paid_ugx))::bigint AS current_balance_due_ugx,
      COALESCE(GREATEST(0, (CURRENT_DATE - i.due_date)), 0)::int AS days_overdue,
      i.note,
      i.source_snapshot,
      i.created_by::text,
      created.full_name AS created_by_name,
      i.issued_by::text,
      issued.full_name AS issued_by_name,
      i.voided_by::text,
      voided.full_name AS voided_by_name,
      to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(i.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
      to_char(i.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS issued_at,
      to_char(i.voided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS voided_at,
      i.void_reason
    FROM invoices i
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN i.invoice_type = 'booking' THEN (
          SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
          FROM folio_payments fp
          WHERE fp.booking_id = i.booking_id
        )
        WHEN i.invoice_type = 'group' THEN (
          SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
          FROM folio_payments fp
          JOIN bookings b ON b.id = fp.booking_id
          WHERE b.group_id = i.group_id
        )
        ELSE i.total_paid_ugx
      END AS current_paid_ugx
    ) live ON true
    LEFT JOIN admin_users created ON created.id = i.created_by
    LEFT JOIN admin_users issued ON issued.id = i.issued_by
    LEFT JOIN admin_users voided ON voided.id = i.voided_by
    WHERE i.company_account_id = ${companyId}::uuid
    ORDER BY i.created_at DESC
  `) as InvoiceRow[];

  return rows.map(normalizeInvoice);
}

export async function getInvoiceDetail(invoiceId: string): Promise<InvoiceDetail | null> {
  const sql = getSql();
  const [invoiceRows, lineRows] = await Promise.all([
    sql`
      SELECT
        i.id::text,
        i.invoice_number,
        i.invoice_type,
        i.status,
        i.booking_id::text,
        i.group_id::text,
        i.company_account_id::text,
        i.source_reference,
        i.source_title,
        i.bill_to_name,
        i.bill_to_contact,
        i.bill_to_email,
        i.bill_to_phone,
        i.bill_to_address,
        i.tax_id,
        i.stay_start::text,
        i.stay_end::text,
        i.payment_terms_days,
        i.due_date::text,
        i.total_charges_ugx,
        i.total_paid_ugx,
        i.balance_due_ugx,
        COALESCE(live.current_paid_ugx, i.total_paid_ugx)::bigint AS current_paid_ugx,
        GREATEST(0, i.total_charges_ugx - COALESCE(live.current_paid_ugx, i.total_paid_ugx))::bigint AS current_balance_due_ugx,
        COALESCE(GREATEST(0, (CURRENT_DATE - i.due_date)), 0)::int AS days_overdue,
        i.note,
        i.source_snapshot,
        i.created_by::text,
        created.full_name AS created_by_name,
        i.issued_by::text,
        issued.full_name AS issued_by_name,
        i.voided_by::text,
        voided.full_name AS voided_by_name,
        to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
        to_char(i.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
        to_char(i.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS issued_at,
        to_char(i.voided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS voided_at,
        i.void_reason
      FROM invoices i
      LEFT JOIN LATERAL (
        SELECT CASE
          WHEN i.invoice_type = 'booking' THEN (
            SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
            FROM folio_payments fp
            WHERE fp.booking_id = i.booking_id
          )
          WHEN i.invoice_type = 'group' THEN (
            SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint
            FROM folio_payments fp
            JOIN bookings b ON b.id = fp.booking_id
            WHERE b.group_id = i.group_id
          )
          ELSE i.total_paid_ugx
        END AS current_paid_ugx
      ) live ON true
      LEFT JOIN admin_users created ON created.id = i.created_by
      LEFT JOIN admin_users issued ON issued.id = i.issued_by
      LEFT JOIN admin_users voided ON voided.id = i.voided_by
      WHERE i.id = ${invoiceId}::uuid
      LIMIT 1
    `,
    sql`
      SELECT
        il.id::text,
        il.invoice_id::text,
        il.line_order,
        il.description,
        il.category,
        il.quantity,
        il.unit_amount_ugx,
        il.amount_ugx,
        il.source_charge_id::text,
        to_char(il.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM invoice_lines il
      WHERE il.invoice_id = ${invoiceId}::uuid
      ORDER BY il.line_order ASC
    `
  ]);

  const invoice = (invoiceRows as InvoiceRow[])[0];
  if (!invoice) return null;

  return {
    invoice: normalizeInvoice(invoice),
    lines: (lineRows as InvoiceLine[]).map(normalizeLine)
  };
}
