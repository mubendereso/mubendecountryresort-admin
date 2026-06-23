"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import { getSql } from "@/lib/db/client";
import { getCompanyAccountById } from "./data";
import { getReservationGroupById } from "@/lib/groups/data";

const MAX_COMPANY_NAME_LENGTH = 180;
const MAX_CONTACT_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 200;
const MAX_PHONE_LENGTH = 40;
const MAX_ADDRESS_LENGTH = 500;
const MAX_TAX_ID_LENGTH = 80;
const MAX_NOTES_LENGTH = 2000;

export type CompanyActionResult =
  | { ok: true; companyId: string }
  | { ok: false; error: string };

export type GroupCompanyActionResult =
  | { ok: true; groupId: string; companyId: string | null }
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
