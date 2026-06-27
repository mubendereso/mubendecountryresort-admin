import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import { getCompanyAccountById } from "@/lib/companies/data";
import { getSql } from "@/lib/db/client";

const DATASETS = new Set(["summary", "invoices", "lines", "payments", "allocations"]);
const DATASET_COLUMNS: Record<string, string[]> = {
  summary: ["company_name", "company_account_id", "contact_name", "contact_email", "contact_phone", "billing_address", "tax_id", "payment_terms_days", "credit_limit_ugx", "is_active", "is_suspended", "created_at"],
  invoices: ["company_name", "company_account_id", "invoice_number", "invoice_type", "invoice_status", "invoice_issue_date", "due_date", "payment_terms_days", "aging_bucket", "invoice_total_ugx", "paid_total_ugx", "balance_due_ugx", "booking_reference", "group_reference", "guest_or_organizer_name", "room_type"],
  lines: ["company_name", "company_account_id", "invoice_number", "invoice_status", "source_reference", "line_order", "description", "category", "quantity", "unit_amount_ugx", "amount_ugx", "booking_reference", "group_reference", "guest_name", "room_type"],
  payments: ["company_name", "company_account_id", "company_payment_id", "payment_date", "payment_method", "payment_reference", "payment_amount_ugx", "allocated_amount_ugx", "note"],
  allocations: ["company_name", "company_account_id", "company_payment_id", "payment_date", "payment_method", "payment_reference", "invoice_number", "invoice_status", "invoice_issue_date", "due_date", "payment_terms_days", "aging_bucket", "invoice_total_ugx", "invoice_allocation_ugx", "allocation_amount_ugx", "receipt_number", "booking_reference", "group_reference", "guest_name", "room_type"]
};

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApprovedAdminRole();
  const { id } = await params;
  const dataset = new URL(request.url).searchParams.get("dataset") ?? "invoices";
  if (!DATASETS.has(dataset)) return new Response("Unknown export dataset.", { status: 400 });
  const company = await getCompanyAccountById(id);
  if (!company) return new Response("Company account not found.", { status: 404 });

  const sql = getSql();
  let rows: Record<string, unknown>[];
  if (dataset === "summary") {
    rows = (await sql`
      SELECT ca.company_name, ca.id::text AS company_account_id, ca.contact_name, ca.contact_email,
        ca.contact_phone, ca.billing_address, ca.tax_id, ca.payment_terms_days,
        ca.credit_limit_ugx::bigint, ca.is_active, ca.is_suspended,
        to_char(ca.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM company_accounts ca WHERE ca.id=${id}::uuid
    `) as Record<string, unknown>[];
  } else if (dataset === "invoices") {
    rows = (await sql`
      SELECT ca.company_name, ca.id::text AS company_account_id, i.invoice_number, i.invoice_type,
        i.status AS invoice_status, i.issued_at::date::text AS invoice_issue_date, i.due_date::text,
        i.payment_terms_days, CASE
          WHEN i.status <> 'issued' OR GREATEST(0, i.total_charges_ugx-COALESCE(live.paid_ugx,i.total_paid_ugx))=0 THEN 'closed'
          WHEN i.due_date IS NULL OR i.due_date >= CURRENT_DATE THEN 'current'
          WHEN CURRENT_DATE-i.due_date <= 30 THEN '1_30'
          WHEN CURRENT_DATE-i.due_date <= 60 THEN '31_60'
          WHEN CURRENT_DATE-i.due_date <= 90 THEN '61_90' ELSE '90_plus' END AS aging_bucket,
        i.total_charges_ugx::bigint AS invoice_total_ugx,
        COALESCE(live.paid_ugx,i.total_paid_ugx)::bigint AS paid_total_ugx,
        GREATEST(0,i.total_charges_ugx-COALESCE(live.paid_ugx,i.total_paid_ugx))::bigint AS balance_due_ugx,
        b.reference AS booking_reference, rg.reference AS group_reference,
        COALESCE(b.guest_full_name, rg.organizer_name) AS guest_or_organizer_name,
        rt.title AS room_type
      FROM invoices i JOIN company_accounts ca ON ca.id=i.company_account_id
      LEFT JOIN bookings b ON b.id=i.booking_id LEFT JOIN room_types rt ON rt.id=b.room_type_id
      LEFT JOIN reservation_groups rg ON rg.id=i.group_id
      LEFT JOIN LATERAL (SELECT CASE WHEN i.invoice_type='booking' THEN
        (SELECT COALESCE(SUM(fp.amount_ugx),0)::bigint FROM folio_payments fp WHERE fp.booking_id=i.booking_id)
        ELSE (SELECT COALESCE(SUM(fp.amount_ugx),0)::bigint FROM folio_payments fp JOIN bookings gb ON gb.id=fp.booking_id WHERE gb.group_id=i.group_id)
        END AS paid_ugx) live ON true
      WHERE i.company_account_id=${id}::uuid ORDER BY i.created_at, i.id
    `) as Record<string, unknown>[];
  } else if (dataset === "lines") {
    rows = (await sql`
      SELECT ca.company_name, ca.id::text AS company_account_id, i.invoice_number, i.status AS invoice_status,
        i.source_reference, il.line_order, il.description, il.category, il.quantity::text,
        il.unit_amount_ugx::bigint, il.amount_ugx::bigint,
        b.reference AS booking_reference, rg.reference AS group_reference,
        b.guest_full_name AS guest_name, rt.title AS room_type
      FROM invoice_lines il JOIN invoices i ON i.id=il.invoice_id
      JOIN company_accounts ca ON ca.id=i.company_account_id
      LEFT JOIN bookings b ON b.id=i.booking_id LEFT JOIN room_types rt ON rt.id=b.room_type_id
      LEFT JOIN reservation_groups rg ON rg.id=i.group_id
      WHERE i.company_account_id=${id}::uuid ORDER BY i.created_at, il.line_order
    `) as Record<string, unknown>[];
  } else if (dataset === "payments") {
    rows = (await sql`
      SELECT ca.company_name, ca.id::text AS company_account_id, cap.id::text AS company_payment_id,
        cap.recorded_at::date::text AS payment_date, cap.method AS payment_method,
        cap.reference AS payment_reference, cap.amount_ugx::bigint AS payment_amount_ugx,
        COALESCE(SUM(capa.amount_ugx),0)::bigint AS allocated_amount_ugx, cap.note
      FROM company_account_payments cap JOIN company_accounts ca ON ca.id=cap.company_account_id
      LEFT JOIN company_account_payment_allocations capa ON capa.company_payment_id=cap.id
      WHERE cap.company_account_id=${id}::uuid
      GROUP BY ca.id, cap.id ORDER BY cap.recorded_at, cap.id
    `) as Record<string, unknown>[];
  } else {
    rows = (await sql`
      SELECT ca.company_name, ca.id::text AS company_account_id, cap.id::text AS company_payment_id,
        cap.recorded_at::date::text AS payment_date, cap.method AS payment_method,
        cap.reference AS payment_reference, i.invoice_number, i.status AS invoice_status,
        i.issued_at::date::text AS invoice_issue_date, i.due_date::text, i.payment_terms_days,
        CASE WHEN i.due_date IS NULL OR i.due_date>=CURRENT_DATE THEN 'current'
          WHEN CURRENT_DATE-i.due_date<=30 THEN '1_30' WHEN CURRENT_DATE-i.due_date<=60 THEN '31_60'
          WHEN CURRENT_DATE-i.due_date<=90 THEN '61_90' ELSE '90_plus' END AS aging_bucket,
        i.total_charges_ugx::bigint AS invoice_total_ugx,
        capa.amount_ugx::bigint AS invoice_allocation_ugx,
        COALESCE(member.amount_ugx,capa.amount_ugx)::bigint AS allocation_amount_ugx,
        receipt.receipt_number, COALESCE(direct.reference,member_booking.reference) AS booking_reference,
        rg.reference AS group_reference, COALESCE(direct.guest_full_name,member_booking.guest_full_name) AS guest_name,
        COALESCE(direct_rt.title,member_rt.title) AS room_type
      FROM company_account_payment_allocations capa
      JOIN company_account_payments cap ON cap.id=capa.company_payment_id
      JOIN company_accounts ca ON ca.id=cap.company_account_id JOIN invoices i ON i.id=capa.invoice_id
      LEFT JOIN reservation_groups rg ON rg.id=capa.group_id
      LEFT JOIN bookings direct ON direct.id=capa.booking_id LEFT JOIN room_types direct_rt ON direct_rt.id=direct.room_type_id
      LEFT JOIN group_folio_payment_allocations member ON member.group_payment_id=capa.group_payment_id
      LEFT JOIN bookings member_booking ON member_booking.id=member.booking_id LEFT JOIN room_types member_rt ON member_rt.id=member_booking.room_type_id
      LEFT JOIN payment_receipts receipt ON receipt.payment_id=COALESCE(capa.folio_payment_id,member.folio_payment_id)
      WHERE cap.company_account_id=${id}::uuid ORDER BY cap.recorded_at, i.invoice_number, booking_reference
    `) as Record<string, unknown>[];
  }

  await recordAuditLog({ actorId: session.userId, actorEmail: session.email, action: "company_account.ar_exported", entityType: "company_account", entityId: id, summary: `Exported ${dataset} AR data for ${company.company_name}.`, context: { dataset, rowCount: rows.length } });
  const filename = `${company.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company"}-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`\uFEFF${toCsv(rows, DATASET_COLUMNS[dataset])}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" } });
}
