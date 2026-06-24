"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import { getBookingById } from "@/lib/bookings/data";
import { getCompanyAccountById } from "@/lib/companies/data";
import { getSql } from "@/lib/db/client";
import { getFolioData } from "@/lib/folios/data";
import type { FolioCharge, FolioPayment } from "@/lib/folios/types";
import { getGroupFolioData } from "@/lib/groups/folio-data";
import type { GroupFolioBooking } from "@/lib/groups/folio-types";
import { getInvoiceDetail } from "./data";
import type { InvoiceActionResult } from "./types";

type DraftLine = {
  line_order: number;
  description: string;
  category: string;
  unit_amount_ugx: number;
  amount_ugx: number;
  source_charge_id: string | null;
};

type RefreshedDraft = {
  companyAccountId: string | null;
  sourceReference: string;
  sourceTitle: string;
  billToName: string;
  billToContact: string | null;
  billToEmail: string | null;
  billToPhone: string | null;
  billToAddress: string | null;
  taxId: string | null;
  stayStart: string | null;
  stayEnd: string | null;
  paymentTermsDays: number;
  totalChargesUgx: number;
  totalPaidUgx: number;
  balanceDueUgx: number;
  note: string | null;
  sourceSnapshot: Record<string, unknown>;
  lines: DraftLine[];
};

function signedChargeAmount(charge: FolioCharge): number {
  return charge.category === "discount" ? -charge.amount_ugx : charge.amount_ugx;
}

function activeCharges(charges: FolioCharge[]): FolioCharge[] {
  return charges.filter((charge) => !charge.voided_at);
}

function totalPayments(payments: FolioPayment[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount_ugx, 0);
}

function linesFromCharges(charges: FolioCharge[], prefix = ""): DraftLine[] {
  return activeCharges(charges).map((charge, index) => {
    const amount = signedChargeAmount(charge);
    return {
      line_order: index + 1,
      description: `${prefix}${charge.description}`,
      category: charge.category,
      unit_amount_ugx: amount,
      amount_ugx: amount,
      source_charge_id: charge.id
    };
  });
}

function groupLines(bookings: GroupFolioBooking[]): DraftLine[] {
  const lines: DraftLine[] = [];
  for (const booking of bookings) {
    for (const charge of activeCharges(booking.charges)) {
      const amount = signedChargeAmount(charge);
      lines.push({
        line_order: lines.length + 1,
        description: `${booking.reference} - ${booking.guest_full_name} - ${charge.description}`,
        category: charge.category,
        unit_amount_ugx: amount,
        amount_ugx: amount,
        source_charge_id: charge.id
      });
    }
  }
  return lines;
}

async function buildBookingDraft(bookingId: string): Promise<RefreshedDraft | null> {
  const [booking, folio] = await Promise.all([
    getBookingById(bookingId),
    getFolioData(bookingId)
  ]);
  if (!booking) return null;

  const lines = linesFromCharges(folio.charges);
  if (lines.length === 0) throw new Error("This folio has no active charges to invoice.");
  const totalCharges = lines.reduce((sum, line) => sum + line.amount_ugx, 0);
  const totalPaid = totalPayments(folio.payments);

  return {
    companyAccountId: null,
    sourceReference: booking.reference,
    sourceTitle: booking.room_type_title,
    billToName: booking.guest_full_name,
    billToContact: booking.guest_full_name,
    billToEmail: booking.guest_email,
    billToPhone: booking.guest_phone,
    billToAddress: null,
    taxId: null,
    stayStart: booking.check_in,
    stayEnd: booking.check_out,
    paymentTermsDays: 0,
    totalChargesUgx: totalCharges,
    totalPaidUgx: totalPaid,
    balanceDueUgx: Math.max(0, totalCharges - totalPaid),
    note: "Resort invoice generated from booking folio. This is not an EFRIS fiscal invoice.",
    sourceSnapshot: {
      bookingReference: booking.reference,
      status: booking.status,
      roomType: booking.room_type_title,
      payments: folio.payments.map((payment) => ({
        id: payment.id,
        amount_ugx: payment.amount_ugx,
        method: payment.method,
        reference: payment.reference,
        receipt_number: payment.receipt_number
      }))
    },
    lines
  };
}

async function buildGroupDraft(groupId: string): Promise<RefreshedDraft | null> {
  const data = await getGroupFolioData(groupId);
  if (!data) return null;

  const company = data.group.company_account_id
    ? await getCompanyAccountById(data.group.company_account_id)
    : null;
  const lines = groupLines(data.bookings);
  if (lines.length === 0) throw new Error("This folio has no active charges to invoice.");
  const totalCharges = lines.reduce((sum, line) => sum + line.amount_ugx, 0);
  const totalPaid = data.bookings.reduce((sum, booking) => sum + totalPayments(booking.payments), 0);

  return {
    companyAccountId: company?.id ?? null,
    sourceReference: data.group.reference,
    sourceTitle: data.group.group_name,
    billToName: company?.company_name ?? data.group.group_name,
    billToContact: company?.contact_name ?? data.group.organizer_name,
    billToEmail: company?.contact_email ?? data.group.organizer_email,
    billToPhone: company?.contact_phone ?? data.group.organizer_phone,
    billToAddress: company?.billing_address ?? null,
    taxId: company?.tax_id ?? null,
    stayStart: data.group.first_check_in,
    stayEnd: data.group.last_check_out,
    paymentTermsDays: company?.payment_terms_days ?? 0,
    totalChargesUgx: totalCharges,
    totalPaidUgx: totalPaid,
    balanceDueUgx: Math.max(0, totalCharges - totalPaid),
    note: "Resort invoice generated from group folio. This is not an EFRIS fiscal invoice.",
    sourceSnapshot: {
      groupReference: data.group.reference,
      groupName: data.group.group_name,
      companyAccountId: company?.id ?? null,
      memberBookings: data.bookings.map((booking) => ({
        id: booking.id,
        reference: booking.reference,
        guest_full_name: booking.guest_full_name,
        status: booking.status
      })),
      groupPayments: data.groupPayments.map((payment) => ({
        id: payment.id,
        amount_ugx: payment.amount_ugx,
        method: payment.method,
        reference: payment.reference
      }))
    },
    lines
  };
}

async function insertInvoice(input: {
  invoiceType: "booking" | "group";
  bookingId: string | null;
  groupId: string | null;
  companyAccountId: string | null;
  sourceReference: string;
  sourceTitle: string;
  billToName: string;
  billToContact: string | null;
  billToEmail: string | null;
  billToPhone: string | null;
  billToAddress: string | null;
  taxId: string | null;
  stayStart: string | null;
  stayEnd: string | null;
  totalChargesUgx: number;
  totalPaidUgx: number;
  balanceDueUgx: number;
  paymentTermsDays: number;
  note: string | null;
  sourceSnapshot: Record<string, unknown>;
  lines: DraftLine[];
  createdBy: string;
}): Promise<string> {
  if (input.lines.length === 0) {
    throw new Error("This folio has no active charges to invoice.");
  }

  const sql = getSql();
  const rows = (await sql`
    WITH created_invoice AS (
      INSERT INTO invoices (
        invoice_type,
        booking_id,
        group_id,
        company_account_id,
        source_reference,
        source_title,
        bill_to_name,
        bill_to_contact,
        bill_to_email,
        bill_to_phone,
        bill_to_address,
        tax_id,
        stay_start,
        stay_end,
        payment_terms_days,
        total_charges_ugx,
        total_paid_ugx,
        balance_due_ugx,
        note,
        source_snapshot,
        created_by
      )
      VALUES (
        ${input.invoiceType},
        ${input.bookingId}::uuid,
        ${input.groupId}::uuid,
        ${input.companyAccountId}::uuid,
        ${input.sourceReference},
        ${input.sourceTitle},
        ${input.billToName},
        ${input.billToContact},
        ${input.billToEmail},
        ${input.billToPhone},
        ${input.billToAddress},
        ${input.taxId},
        ${input.stayStart}::date,
        ${input.stayEnd}::date,
        ${input.paymentTermsDays},
        ${input.totalChargesUgx},
        ${input.totalPaidUgx},
        ${input.balanceDueUgx},
        ${input.note},
        ${JSON.stringify(input.sourceSnapshot)}::jsonb,
        ${input.createdBy}::uuid
      )
      RETURNING id
    ),
    inserted_lines AS (
      INSERT INTO invoice_lines (
        invoice_id,
        line_order,
        description,
        category,
        quantity,
        unit_amount_ugx,
        amount_ugx,
        source_charge_id
      )
      SELECT
        ci.id,
        line.line_order,
        line.description,
        line.category,
        1,
        line.unit_amount_ugx,
        line.amount_ugx,
        line.source_charge_id::uuid
      FROM created_invoice ci
      CROSS JOIN jsonb_to_recordset(${JSON.stringify(input.lines)}::jsonb) AS line(
        line_order integer,
        description text,
        category text,
        unit_amount_ugx bigint,
        amount_ugx bigint,
        source_charge_id text
      )
      RETURNING invoice_id
    )
    SELECT ci.id::text
    FROM created_invoice ci
  `) as { id: string }[];

  const invoiceId = rows[0]?.id;
  if (!invoiceId) throw new Error("Invoice could not be created.");
  return invoiceId;
}

export async function createBookingInvoiceAction(formData: FormData): Promise<InvoiceActionResult> {
  const session = await requireApprovedAdminRole();
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  if (!bookingId) return { ok: false, error: "Missing booking." };

  const [booking, folio] = await Promise.all([
    getBookingById(bookingId),
    getFolioData(bookingId)
  ]);

  if (!booking) return { ok: false, error: "Booking not found." };

  const lines = linesFromCharges(folio.charges);
  const totalCharges = lines.reduce((sum, line) => sum + line.amount_ugx, 0);
  const totalPaid = totalPayments(folio.payments);
  const balanceDue = Math.max(0, totalCharges - totalPaid);

  try {
    const invoiceId = await insertInvoice({
      invoiceType: "booking",
      bookingId,
      groupId: null,
      companyAccountId: null,
      sourceReference: booking.reference,
      sourceTitle: booking.room_type_title,
      billToName: booking.guest_full_name,
      billToContact: booking.guest_full_name,
      billToEmail: booking.guest_email,
      billToPhone: booking.guest_phone,
      billToAddress: null,
      taxId: null,
      stayStart: booking.check_in,
      stayEnd: booking.check_out,
      totalChargesUgx: totalCharges,
      totalPaidUgx: totalPaid,
      balanceDueUgx: balanceDue,
      paymentTermsDays: 0,
      note: "Resort invoice generated from booking folio. This is not an EFRIS fiscal invoice.",
      sourceSnapshot: {
        bookingReference: booking.reference,
        status: booking.status,
        roomType: booking.room_type_title,
        payments: folio.payments.map((payment) => ({
          id: payment.id,
          amount_ugx: payment.amount_ugx,
          method: payment.method,
          reference: payment.reference,
          receipt_number: payment.receipt_number
        }))
      },
      lines,
      createdBy: session.userId
    });

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "invoice.draft_created",
      entityType: "invoice",
      entityId: invoiceId,
      summary: `Created draft invoice for booking ${booking.reference}.`,
      context: { bookingId, bookingReference: booking.reference, totalCharges, totalPaid, balanceDue }
    });

    revalidatePath("/invoices");
    revalidatePath(`/bookings/${bookingId}/folio`);
    return { ok: true, invoiceId };
  } catch (error) {
    console.error("create_booking_invoice failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Invoice could not be created." };
  }
}

export async function createGroupInvoiceAction(formData: FormData): Promise<InvoiceActionResult> {
  const session = await requireApprovedAdminRole();
  const groupId = String(formData.get("groupId") ?? "").trim();
  if (!groupId) return { ok: false, error: "Missing group." };

  const data = await getGroupFolioData(groupId);
  if (!data) return { ok: false, error: "Group not found." };

  const company = data.group.company_account_id
    ? await getCompanyAccountById(data.group.company_account_id)
    : null;
  const lines = groupLines(data.bookings);
  const totalCharges = lines.reduce((sum, line) => sum + line.amount_ugx, 0);
  const totalPaid = data.bookings.reduce((sum, booking) => sum + totalPayments(booking.payments), 0);
  const balanceDue = Math.max(0, totalCharges - totalPaid);

  try {
    const invoiceId = await insertInvoice({
      invoiceType: "group",
      bookingId: null,
      groupId,
      companyAccountId: company?.id ?? null,
      sourceReference: data.group.reference,
      sourceTitle: data.group.group_name,
      billToName: company?.company_name ?? data.group.group_name,
      billToContact: company?.contact_name ?? data.group.organizer_name,
      billToEmail: company?.contact_email ?? data.group.organizer_email,
      billToPhone: company?.contact_phone ?? data.group.organizer_phone,
      billToAddress: company?.billing_address ?? null,
      taxId: company?.tax_id ?? null,
      stayStart: data.group.first_check_in,
      stayEnd: data.group.last_check_out,
      totalChargesUgx: totalCharges,
      totalPaidUgx: totalPaid,
      balanceDueUgx: balanceDue,
      paymentTermsDays: company?.payment_terms_days ?? 0,
      note: "Resort invoice generated from group folio. This is not an EFRIS fiscal invoice.",
      sourceSnapshot: {
        groupReference: data.group.reference,
        groupName: data.group.group_name,
        companyAccountId: company?.id ?? null,
        memberBookings: data.bookings.map((booking) => ({
          id: booking.id,
          reference: booking.reference,
          guest_full_name: booking.guest_full_name,
          status: booking.status
        })),
        groupPayments: data.groupPayments.map((payment) => ({
          id: payment.id,
          amount_ugx: payment.amount_ugx,
          method: payment.method,
          reference: payment.reference
        }))
      },
      lines,
      createdBy: session.userId
    });

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "invoice.draft_created",
      entityType: "invoice",
      entityId: invoiceId,
      summary: `Created draft invoice for group ${data.group.reference}.`,
      context: { groupId, groupReference: data.group.reference, totalCharges, totalPaid, balanceDue }
    });

    revalidatePath("/invoices");
    revalidatePath(`/groups/${groupId}/folio`);
    revalidatePath(`/groups/${groupId}/statement`);
    if (company?.id) revalidatePath(`/companies/${company.id}`);
    return { ok: true, invoiceId };
  } catch (error) {
    console.error("create_group_invoice failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Invoice could not be created." };
  }
}

export async function issueInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) throw new Error("Missing invoice.");

  const sql = getSql();
  const rows = (await sql`
    UPDATE invoices
    SET
      status = 'issued',
      invoice_number = 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
      issued_at = now(),
      due_date = (now() AT TIME ZONE 'Africa/Kampala')::date + payment_terms_days,
      issued_by = ${session.userId}::uuid
    WHERE id = ${invoiceId}::uuid
      AND status = 'draft'
      AND EXISTS (SELECT 1 FROM invoice_lines il WHERE il.invoice_id = invoices.id)
    RETURNING
      id::text,
      invoice_number,
      invoice_type,
      booking_id::text,
      group_id::text,
      company_account_id::text
  `) as {
    id: string;
    invoice_number: string;
    invoice_type: "booking" | "group";
    booking_id: string | null;
    group_id: string | null;
    company_account_id: string | null;
  }[];

  const invoice = rows[0];
  if (!invoice) throw new Error("Only draft invoices with lines can be issued.");

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "invoice.issued",
    entityType: "invoice",
    entityId: invoiceId,
    summary: `Issued invoice ${invoice.invoice_number}.`,
    context: invoice
  });

  revalidateInvoicePaths(invoice);
  redirect(`/invoices/${invoiceId}`);
}

export async function refreshDraftInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  if (!invoiceId) throw new Error("Missing invoice.");

  const detail = await getInvoiceDetail(invoiceId);
  if (!detail) throw new Error("Invoice not found.");
  if (detail.invoice.status !== "draft") throw new Error("Only draft invoices can be refreshed.");

  const refreshed =
    detail.invoice.invoice_type === "booking" && detail.invoice.booking_id
      ? await buildBookingDraft(detail.invoice.booking_id)
      : detail.invoice.invoice_type === "group" && detail.invoice.group_id
        ? await buildGroupDraft(detail.invoice.group_id)
        : null;

  if (!refreshed) throw new Error("Invoice source could not be refreshed.");

  const sql = getSql();
  await sql`
    WITH updated_invoice AS (
      UPDATE invoices
      SET
        company_account_id = ${refreshed.companyAccountId}::uuid,
        source_reference = ${refreshed.sourceReference},
        source_title = ${refreshed.sourceTitle},
        bill_to_name = ${refreshed.billToName},
        bill_to_contact = ${refreshed.billToContact},
        bill_to_email = ${refreshed.billToEmail},
        bill_to_phone = ${refreshed.billToPhone},
        bill_to_address = ${refreshed.billToAddress},
        tax_id = ${refreshed.taxId},
        stay_start = ${refreshed.stayStart}::date,
        stay_end = ${refreshed.stayEnd}::date,
        payment_terms_days = ${refreshed.paymentTermsDays},
        total_charges_ugx = ${refreshed.totalChargesUgx},
        total_paid_ugx = ${refreshed.totalPaidUgx},
        balance_due_ugx = ${refreshed.balanceDueUgx},
        note = ${refreshed.note},
        source_snapshot = ${JSON.stringify(refreshed.sourceSnapshot)}::jsonb
      WHERE id = ${invoiceId}::uuid
        AND status = 'draft'
      RETURNING id
    ),
    removed_lines AS (
      DELETE FROM invoice_lines
      WHERE invoice_id = ${invoiceId}::uuid
        AND EXISTS (SELECT 1 FROM updated_invoice)
    )
    INSERT INTO invoice_lines (
      invoice_id,
      line_order,
      description,
      category,
      quantity,
      unit_amount_ugx,
      amount_ugx,
      source_charge_id
    )
    SELECT
      ui.id,
      line.line_order,
      line.description,
      line.category,
      1,
      line.unit_amount_ugx,
      line.amount_ugx,
      line.source_charge_id::uuid
    FROM updated_invoice ui
    CROSS JOIN jsonb_to_recordset(${JSON.stringify(refreshed.lines)}::jsonb) AS line(
      line_order integer,
      description text,
      category text,
      unit_amount_ugx bigint,
      amount_ugx bigint,
      source_charge_id text
    )
  `;

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "invoice.draft_refreshed",
    entityType: "invoice",
    entityId: invoiceId,
    summary: `Refreshed draft invoice for ${refreshed.sourceReference}.`,
    context: {
      invoiceId,
      sourceReference: refreshed.sourceReference,
      totalCharges: refreshed.totalChargesUgx,
      totalPaid: refreshed.totalPaidUgx,
      balanceDue: refreshed.balanceDueUgx
    }
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  if (detail.invoice.booking_id) revalidatePath(`/bookings/${detail.invoice.booking_id}/folio`);
  if (detail.invoice.group_id) revalidatePath(`/groups/${detail.invoice.group_id}/folio`);
  if (refreshed.companyAccountId) revalidatePath(`/companies/${refreshed.companyAccountId}`);
  redirect(`/invoices/${invoiceId}`);
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  if (session.role === "staff") throw new Error("Only admin or superadmin can void invoices.");

  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!invoiceId) throw new Error("Missing invoice.");
  if (!reason) throw new Error("Void reason is required.");
  if (reason.length > 500) throw new Error("Void reason is too long.");

  const sql = getSql();
  const rows = (await sql`
    UPDATE invoices
    SET
      status = 'voided',
      voided_at = now(),
      voided_by = ${session.userId}::uuid,
      void_reason = ${reason}
    WHERE id = ${invoiceId}::uuid
      AND status = 'issued'
    RETURNING
      id::text,
      invoice_number,
      invoice_type,
      booking_id::text,
      group_id::text,
      company_account_id::text
  `) as {
    id: string;
    invoice_number: string;
    invoice_type: "booking" | "group";
    booking_id: string | null;
    group_id: string | null;
    company_account_id: string | null;
  }[];

  const invoice = rows[0];
  if (!invoice) throw new Error("Only issued invoices can be voided.");

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "invoice.voided",
    entityType: "invoice",
    entityId: invoiceId,
    summary: `Voided invoice ${invoice.invoice_number}.`,
    context: { ...invoice, reason }
  });

  revalidateInvoicePaths(invoice);
  redirect(`/invoices/${invoiceId}`);
}

function revalidateInvoicePaths(invoice: {
  id: string;
  booking_id: string | null;
  group_id: string | null;
  company_account_id: string | null;
}) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoice.id}`);
  if (invoice.booking_id) revalidatePath(`/bookings/${invoice.booking_id}/folio`);
  if (invoice.group_id) {
    revalidatePath(`/groups/${invoice.group_id}/folio`);
    revalidatePath(`/groups/${invoice.group_id}/statement`);
  }
  if (invoice.company_account_id) revalidatePath(`/companies/${invoice.company_account_id}`);
}

export async function createBookingInvoiceAndRedirect(formData: FormData): Promise<void> {
  const result = await createBookingInvoiceAction(formData);
  if (!result.ok) throw new Error(result.error);
  redirect(`/invoices/${result.invoiceId}`);
}

export async function createGroupInvoiceAndRedirect(formData: FormData): Promise<void> {
  const result = await createGroupInvoiceAction(formData);
  if (!result.ok) throw new Error(result.error);
  redirect(`/invoices/${result.invoiceId}`);
}
