"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import { getSql } from "@/lib/db/client";
import { getCompanyAccountById } from "./data";
import { getReservationGroupById } from "@/lib/groups/data";
import type { PaymentMethod } from "@/lib/folios/types";

const MAX_COMPANY_NAME_LENGTH = 180;
const MAX_CONTACT_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 200;
const MAX_PHONE_LENGTH = 40;
const MAX_ADDRESS_LENGTH = 500;
const MAX_TAX_ID_LENGTH = 80;
const MAX_NOTES_LENGTH = 2000;
const MAX_PAYMENT_REFERENCE_LENGTH = 200;
const MAX_PAYMENT_NOTE_LENGTH = 500;
const VALID_COMPANY_PAYMENT_METHODS: Exclude<PaymentMethod, "pesapal">[] = [
  "pesapal_manual",
  "cash",
  "mpesa",
  "card",
  "transfer"
];

export type CompanyActionResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string };

export type GroupCompanyActionResult =
  | { ok: true; groupId: string; companyId: string | null }
  | { ok: false; error: string };

export type RecordCompanyPaymentResult =
  | {
      ok: true;
      companyId: string;
      companyPaymentId: string;
      allocationCount: number;
      allocatedAmountUgx: number;
    }
  | { ok: false; error: string };

function normalizedText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function parseUgxAmount(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "").trim().replace(/[,\s]/g, "");
  if (normalized === "") return 0;
  if (!/^\d+$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized));
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateCompanyInput(input: {
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  taxId: string | null;
  notes: string | null;
  creditLimitUgx: number;
}): string | null {
  if (!input.companyName) return "Please enter a company name.";
  if (input.companyName.length > MAX_COMPANY_NAME_LENGTH) return "Please enter a shorter company name.";
  if ((input.contactName?.length ?? 0) > MAX_CONTACT_NAME_LENGTH) return "Please enter a shorter contact name.";
  if ((input.contactEmail?.length ?? 0) > MAX_EMAIL_LENGTH) return "Please enter a shorter email address.";
  if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
    return "Please enter a valid email address.";
  }
  if ((input.contactPhone?.length ?? 0) > MAX_PHONE_LENGTH) return "Please enter a shorter phone number.";
  if ((input.billingAddress?.length ?? 0) > MAX_ADDRESS_LENGTH) return "Please enter a shorter billing address.";
  if ((input.taxId?.length ?? 0) > MAX_TAX_ID_LENGTH) return "Please enter a shorter tax ID.";
  if ((input.notes?.length ?? 0) > MAX_NOTES_LENGTH) return "Please keep notes under 2000 characters.";
  if (!Number.isFinite(input.creditLimitUgx) || input.creditLimitUgx < 0) {
    return "Credit limit must be zero or a positive amount.";
  }
  return null;
}

function companyInputFromForm(formData: FormData) {
  const companyName = normalizedText(formData.get("companyName"));
  const contactName = normalizedText(formData.get("contactName")) || null;
  const contactEmail = normalizedText(formData.get("contactEmail")).toLowerCase() || null;
  const contactPhone = normalizedText(formData.get("contactPhone")) || null;
  const billingAddress = normalizedText(formData.get("billingAddress")) || null;
  const taxId = normalizedText(formData.get("taxId")) || null;
  const paymentTermsDays = parsePositiveInt(formData.get("paymentTermsDays"), 14);
  const creditLimitUgx = parseUgxAmount(formData.get("creditLimitUgx"));
  const notes = normalizedText(formData.get("notes")) || null;
  const isActive = formData.getAll("isActive").includes("true");

  return {
    companyName,
    contactName,
    contactEmail,
    contactPhone,
    billingAddress,
    taxId,
    paymentTermsDays,
    creditLimitUgx,
    notes,
    isActive
  };
}

export async function createCompanyAccountAction(formData: FormData): Promise<CompanyActionResult> {
  const session = await requireApprovedAdminRole();
  const input = companyInputFromForm(formData);
  const validationError = validateCompanyInput(input);
  if (validationError) return { ok: false, error: validationError };

  const sql = getSql();
  try {
    const rows = (await sql`
      INSERT INTO company_accounts (
        company_name,
        contact_name,
        contact_email,
        contact_phone,
        billing_address,
        tax_id,
        payment_terms_days,
        credit_limit_ugx,
        notes,
        is_active,
        created_by
      )
      VALUES (
        ${input.companyName},
        ${input.contactName},
        ${input.contactEmail},
        ${input.contactPhone},
        ${input.billingAddress},
        ${input.taxId},
        ${input.paymentTermsDays},
        ${input.creditLimitUgx},
        ${input.notes},
        ${input.isActive},
        ${session.userId}::uuid
      )
      RETURNING id::text
    `) as { id: string }[];

    const companyId = rows[0]?.id;
    if (!companyId) return { ok: false, error: "Company account could not be created." };

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "company_account.created",
      entityType: "company_account",
      entityId: companyId,
      summary: `Created company account ${input.companyName}.`,
      context: input
    });

    revalidatePath("/companies");
    return { ok: true, companyId };
  } catch (error) {
    console.error("create_company_account failed:", error);
    return { ok: false, error: "Company account could not be created. Please try again." };
  }
}

export async function updateCompanyAccountAction(formData: FormData): Promise<CompanyActionResult> {
  const session = await requireApprovedAdminRole();
  const companyId = normalizedText(formData.get("companyId"));
  if (!companyId || !isUuid(companyId)) return { ok: false, error: "Please select a valid company." };

  const input = companyInputFromForm(formData);
  const validationError = validateCompanyInput(input);
  if (validationError) return { ok: false, error: validationError };

  const before = await getCompanyAccountById(companyId);
  if (!before) return { ok: false, error: "Company account not found." };

  const sql = getSql();
  try {
    await sql`
      UPDATE company_accounts
      SET
        company_name = ${input.companyName},
        contact_name = ${input.contactName},
        contact_email = ${input.contactEmail},
        contact_phone = ${input.contactPhone},
        billing_address = ${input.billingAddress},
        tax_id = ${input.taxId},
        payment_terms_days = ${input.paymentTermsDays},
        credit_limit_ugx = ${input.creditLimitUgx},
        notes = ${input.notes},
        is_active = ${input.isActive}
      WHERE id = ${companyId}::uuid
    `;

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "company_account.updated",
      entityType: "company_account",
      entityId: companyId,
      summary: `Updated company account ${input.companyName}.`,
      context: {
        before,
        after: input
      }
    });

    revalidatePath("/companies");
    revalidatePath(`/companies/${companyId}`);
    revalidatePath("/groups");
    return { ok: true, companyId };
  } catch (error) {
    console.error("update_company_account failed:", error);
    return { ok: false, error: "Company account could not be updated. Please try again." };
  }
}

export async function setGroupCompanyAccountAction(formData: FormData): Promise<GroupCompanyActionResult> {
  const session = await requireApprovedAdminRole();
  const groupId = normalizedText(formData.get("groupId"));
  const companyId = normalizedText(formData.get("companyId")) || null;

  if (!groupId || !isUuid(groupId)) return { ok: false, error: "Please select a valid group." };
  if (companyId && !isUuid(companyId)) return { ok: false, error: "Please select a valid company." };

  const group = await getReservationGroupById(groupId);
  if (!group) return { ok: false, error: "Group not found." };

  const company = companyId ? await getCompanyAccountById(companyId) : null;
  if (companyId && !company) return { ok: false, error: "Company account not found." };
  if (company && !company.is_active) return { ok: false, error: "Inactive company accounts cannot be attached to groups." };

  const sql = getSql();
  try {
    await sql`
      UPDATE reservation_groups
      SET company_account_id = ${companyId}::uuid
      WHERE id = ${groupId}::uuid
    `;

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: companyId ? "reservation_group.company_attached" : "reservation_group.company_removed",
      entityType: "reservation_group",
      entityId: groupId,
      summary: company
        ? `Attached company payer ${company.company_name} to group ${group.group_name}.`
        : `Removed company payer from group ${group.group_name}.`,
      context: {
        groupId,
        groupReference: group.reference,
        previousCompanyId: group.company_account_id,
        nextCompanyId: companyId,
        nextCompanyName: company?.company_name ?? null
      }
    });

    revalidatePath("/groups");
    revalidatePath(`/groups/${groupId}`);
    revalidatePath(`/groups/${groupId}/folio`);
    revalidatePath(`/groups/${groupId}/statement`);
    if (companyId) revalidatePath(`/companies/${companyId}`);
    if (group.company_account_id) revalidatePath(`/companies/${group.company_account_id}`);

    return { ok: true, groupId, companyId };
  } catch (error) {
    console.error("set_group_company_account failed:", error);
    return { ok: false, error: "Company payer could not be updated. Please try again." };
  }
}

export async function recordCompanyPaymentAction(
  formData: FormData
): Promise<RecordCompanyPaymentResult> {
  const session = await requireApprovedAdminRole();
  if (session.role === "staff") {
    return { ok: false, error: "Only admin or superadmin users can record company payments." };
  }

  const companyId = normalizedText(formData.get("companyId"));
  const amount = parseUgxAmount(formData.get("amountUgx"));
  const submittedMethod = normalizedText(formData.get("method")) as PaymentMethod;
  const method: Exclude<PaymentMethod, "pesapal"> =
    submittedMethod === "pesapal" ? "pesapal_manual" : submittedMethod;
  const reference = normalizedText(formData.get("reference")) || null;
  const note = normalizedText(formData.get("note")) || null;

  if (!companyId || !isUuid(companyId)) return { ok: false, error: "Please select a valid company." };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount must be a positive number." };
  }
  if (!VALID_COMPANY_PAYMENT_METHODS.includes(method)) {
    return { ok: false, error: "Please select a valid payment method." };
  }
  if (method === "pesapal_manual" && !reference) {
    return { ok: false, error: "Enter the Pesapal transaction reference." };
  }
  if ((reference?.length ?? 0) > MAX_PAYMENT_REFERENCE_LENGTH) {
    return { ok: false, error: "Payment reference is too long." };
  }
  if ((note?.length ?? 0) > MAX_PAYMENT_NOTE_LENGTH) {
    return { ok: false, error: "Payment note is too long." };
  }

  const sql = getSql();

  try {
    const rows = (await sql`
      WITH company_row AS (
        SELECT id, company_name, is_active
        FROM company_accounts
        WHERE id = ${companyId}::uuid
        FOR UPDATE
      ),
      invoice_balances AS (
        SELECT
          i.id AS invoice_id,
          i.invoice_number,
          i.source_reference,
          i.group_id,
          i.due_date,
          i.created_at,
          i.total_charges_ugx,
          COALESCE(live.current_paid_ugx, i.total_paid_ugx)::bigint AS current_paid_ugx,
          GREATEST(0, i.total_charges_ugx - COALESCE(live.current_paid_ugx, i.total_paid_ugx))::bigint AS balance_ugx
        FROM invoices i
        CROSS JOIN company_row cr
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(fp.amount_ugx), 0)::bigint AS current_paid_ugx
          FROM folio_payments fp
          JOIN bookings b ON b.id = fp.booking_id
          WHERE b.group_id = i.group_id
        ) live ON true
        WHERE i.company_account_id = cr.id
          AND i.invoice_type = 'group'
          AND i.status = 'issued'
          AND i.group_id IS NOT NULL
        FOR UPDATE OF i
      ),
      running_invoices AS (
        SELECT
          ib.*,
          COALESCE(
            SUM(ib.balance_ugx) OVER (
              ORDER BY ib.due_date NULLS LAST, ib.created_at, ib.invoice_id
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          )::bigint AS prior_balance_ugx
        FROM invoice_balances ib
        WHERE ib.balance_ugx > 0
      ),
      totals AS (
        SELECT COALESCE(SUM(balance_ugx), 0)::bigint AS total_open_ugx
        FROM invoice_balances
      ),
      company_payment AS (
        INSERT INTO company_account_payments (
          company_account_id,
          amount_ugx,
          method,
          reference,
          note,
          recorded_by
        )
        SELECT
          cr.id,
          ${amount}::bigint,
          ${method},
          ${reference},
          ${note},
          ${session.userId}::uuid
        FROM company_row cr, totals t
        WHERE cr.is_active = true
          AND t.total_open_ugx >= ${amount}::bigint
        RETURNING id, company_account_id
      ),
      invoice_allocations AS (
        SELECT
          ri.invoice_id,
          ri.invoice_number,
          ri.source_reference,
          ri.group_id,
          LEAST(
            ri.balance_ugx,
            GREATEST(${amount}::bigint - ri.prior_balance_ugx, 0)
          )::bigint AS allocation_amount_ugx
        FROM running_invoices ri
        WHERE LEAST(
          ri.balance_ugx,
          GREATEST(${amount}::bigint - ri.prior_balance_ugx, 0)
        ) > 0
      ),
      group_payments AS (
        INSERT INTO group_folio_payments (
          group_id,
          amount_ugx,
          method,
          reference,
          note,
          recorded_by,
          company_payment_id,
          company_invoice_id
        )
        SELECT
          ia.group_id,
          ia.allocation_amount_ugx,
          ${method},
          ${reference},
          ${note},
          ${session.userId}::uuid,
          cp.id,
          ia.invoice_id
        FROM invoice_allocations ia
        CROSS JOIN company_payment cp
        RETURNING id, group_id, amount_ugx, company_payment_id, company_invoice_id
      ),
      company_allocation_ledger AS (
        INSERT INTO company_account_payment_allocations (
          company_payment_id,
          invoice_id,
          group_id,
          group_payment_id,
          amount_ugx
        )
        SELECT
          gp.company_payment_id,
          gp.company_invoice_id,
          gp.group_id,
          gp.id,
          gp.amount_ugx
        FROM group_payments gp
        RETURNING company_payment_id, invoice_id, amount_ugx
      ),
      booking_balances AS (
        SELECT
          gp.id AS group_payment_id,
          gp.company_invoice_id,
          gp.amount_ugx AS group_payment_amount_ugx,
          b.id AS booking_id,
          b.reference AS booking_reference,
          b.check_in,
          b.created_at,
          b.quoted_total_ugx,
          rt.title AS room_type_title,
          GREATEST(
            COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)
              - COALESCE(payments.total_paid_ugx, 0),
            0
          )::bigint AS balance_ugx
        FROM group_payments gp
        JOIN bookings b ON b.group_id = gp.group_id
        JOIN room_types rt ON rt.id = b.room_type_id
        LEFT JOIN LATERAL (
          SELECT SUM(
            CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END
          ) FILTER (WHERE fc.voided_at IS NULL) AS total_charges_ugx
          FROM folio_charges fc
          WHERE fc.booking_id = b.id
        ) charges ON true
        LEFT JOIN LATERAL (
          SELECT SUM(fp.amount_ugx) AS total_paid_ugx
          FROM folio_payments fp
          WHERE fp.booking_id = b.id
        ) payments ON true
        WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')
        FOR UPDATE OF b
      ),
      running_bookings AS (
        SELECT
          bb.*,
          COALESCE(
            SUM(bb.balance_ugx) OVER (
              PARTITION BY bb.group_payment_id
              ORDER BY bb.check_in, bb.created_at, bb.booking_id
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          )::bigint AS prior_balance_ugx
        FROM booking_balances bb
        WHERE bb.balance_ugx > 0
      ),
      allocation_rows AS (
        SELECT
          rb.group_payment_id,
          rb.booking_id,
          rb.quoted_total_ugx,
          rb.room_type_title,
          LEAST(
            rb.balance_ugx,
            GREATEST(rb.group_payment_amount_ugx - rb.prior_balance_ugx, 0)
          )::bigint AS allocation_amount_ugx
        FROM running_bookings rb
        WHERE LEAST(
          rb.balance_ugx,
          GREATEST(rb.group_payment_amount_ugx - rb.prior_balance_ugx, 0)
        ) > 0
      ),
      accommodation_charges AS (
        INSERT INTO folio_charges (
          booking_id,
          description,
          amount_ugx,
          category,
          posted_by
        )
        SELECT
          ar.booking_id,
          ar.room_type_title || ' - company AR settlement',
          ar.quoted_total_ugx,
          'accommodation',
          ${session.userId}::uuid
        FROM allocation_rows ar
        WHERE NOT EXISTS (
          SELECT 1
          FROM folio_charges fc
          WHERE fc.booking_id = ar.booking_id
            AND fc.category = 'accommodation'
            AND fc.voided_at IS NULL
        )
        RETURNING booking_id
      ),
      member_payments AS (
        INSERT INTO folio_payments (
          booking_id,
          amount_ugx,
          method,
          reference,
          recorded_by,
          group_payment_id
        )
        SELECT
          ar.booking_id,
          ar.allocation_amount_ugx,
          ${method},
          ${reference},
          ${session.userId}::uuid,
          ar.group_payment_id
        FROM allocation_rows ar
        RETURNING id, booking_id, amount_ugx, group_payment_id
      ),
      group_allocation_ledger AS (
        INSERT INTO group_folio_payment_allocations (
          group_payment_id,
          booking_id,
          folio_payment_id,
          amount_ugx
        )
        SELECT
          mp.group_payment_id,
          mp.booking_id,
          mp.id,
          mp.amount_ugx
        FROM member_payments mp
        RETURNING group_payment_id, amount_ugx
      )
      SELECT
        cr.id::text AS company_id,
        cr.company_name,
        cr.is_active,
        t.total_open_ugx,
        cp.id::text AS company_payment_id,
        COALESCE(COUNT(cal.invoice_id), 0)::int AS allocation_count,
        COALESCE(SUM(cal.amount_ugx), 0)::bigint AS allocated_amount_ugx
      FROM company_row cr
      CROSS JOIN totals t
      LEFT JOIN company_payment cp ON cp.company_account_id = cr.id
      LEFT JOIN company_allocation_ledger cal ON cal.company_payment_id = cp.id
      GROUP BY cr.id, cr.company_name, cr.is_active, t.total_open_ugx, cp.id
    `) as {
      company_id: string;
      company_name: string;
      is_active: boolean;
      total_open_ugx: string | number;
      company_payment_id: string | null;
      allocation_count: number;
      allocated_amount_ugx: string | number;
    }[];

    const result = rows[0];
    if (!result) return { ok: false, error: "Company account not found." };
    if (!result.is_active) return { ok: false, error: "Inactive company accounts cannot receive payments." };
    if (!result.company_payment_id) {
      const totalOpen = Number(result.total_open_ugx);
      return {
        ok: false,
        error:
          totalOpen <= 0
            ? "This company has no issued group invoice balance to pay."
            : `Company payment cannot exceed issued invoice AR of UGX ${new Intl.NumberFormat("en-UG").format(totalOpen)}.`
      };
    }

    const allocatedAmount = Number(result.allocated_amount_ugx);
    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "company_account.payment_recorded",
      entityType: "company_account",
      entityId: companyId,
      summary: `Recorded a company ${method} payment of ${allocatedAmount} UGX for ${result.company_name}.`,
      context: {
        companyId,
        companyName: result.company_name,
        companyPaymentId: result.company_payment_id,
        amountUgx: amount,
        allocatedAmountUgx: allocatedAmount,
        allocationCount: Number(result.allocation_count),
        method,
        reference,
        note
      }
    });

    revalidatePath("/companies");
    revalidatePath(`/companies/${companyId}`);
    revalidatePath("/invoices");
    revalidatePath("/groups");
    revalidatePath("/bookings");
    revalidatePath("/front-desk");

    return {
      ok: true,
      companyId,
      companyPaymentId: result.company_payment_id,
      allocationCount: Number(result.allocation_count),
      allocatedAmountUgx: allocatedAmount
    };
  } catch (error) {
    console.error("record_company_payment failed:", error);
    return { ok: false, error: "Company payment could not be recorded. Please try again." };
  }
}
