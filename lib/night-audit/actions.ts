"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getNightAuditData } from "./data";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTES_LENGTH = 2000;
const MAX_REASON_LENGTH = 500;

function parseUgxAmount(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "").trim().replace(/[,\s]/g, "");
  if (!/^\d+$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

function nightAuditPath(date: string, message: string): string {
  return `/night-audit?date=${encodeURIComponent(date)}&message=${encodeURIComponent(message)}`;
}

export async function closeNightAuditAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  if (session.role === "staff") {
    throw new Error("Only admin or superadmin can close the night audit.");
  }

  const businessDate = String(formData.get("business_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const openingFloatUgx = parseUgxAmount(formData.get("opening_float_ugx"));
  const cashCountedUgx = parseUgxAmount(formData.get("cash_counted_ugx"));

  if (!ISO_DATE.test(businessDate)) {
    redirect(nightAuditPath("", "Please select a valid business date."));
  }
  if ((notes?.length ?? 0) > MAX_NOTES_LENGTH) {
    redirect(nightAuditPath(businessDate, "Please shorten the close notes."));
  }
  if (!Number.isFinite(openingFloatUgx) || openingFloatUgx < 0) {
    redirect(nightAuditPath(businessDate, "Opening float must be zero or a positive amount."));
  }
  if (!Number.isFinite(cashCountedUgx) || cashCountedUgx < 0) {
    redirect(nightAuditPath(businessDate, "Cash counted must be zero or a positive amount."));
  }

  const sql = getSql();
  const active = (await sql`
    SELECT id
    FROM night_audit_closures
    WHERE business_date = ${businessDate}::date
      AND voided_at IS NULL
    LIMIT 1
  `) as { id: string }[];

  if (active.length > 0) {
    redirect(nightAuditPath(businessDate, "That business date is already closed."));
  }

  const snapshot = await getNightAuditData(businessDate);
  const cashDifferenceUgx = cashCountedUgx - openingFloatUgx - snapshot.summary.cash_total_ugx;

  await sql`
    INSERT INTO night_audit_closures (
      business_date,
      closed_by,
      opening_float_ugx,
      cash_counted_ugx,
      cash_difference_ugx,
      total_units,
      occupied_room_nights,
      occupancy_percent,
      arrivals,
      departures,
      total_charged_ugx,
      total_collected_ugx,
      cash_total_ugx,
      mpesa_total_ugx,
      card_total_ugx,
      transfer_total_ugx,
      pesapal_total_ugx,
      pesapal_manual_total_ugx,
      receipt_count,
      missing_receipt_count,
      voided_charges_count,
      voided_charges_amount_ugx,
      open_balance_count,
      open_balance_amount_ugx,
      pending_payment_count,
      pending_payment_amount_ugx,
      notes
    )
    VALUES (
      ${businessDate}::date,
      ${session.userId}::uuid,
      ${openingFloatUgx}::bigint,
      ${cashCountedUgx}::bigint,
      ${cashDifferenceUgx}::bigint,
      ${snapshot.summary.total_units}::int,
      ${snapshot.summary.occupied_room_nights}::int,
      ${snapshot.summary.occupancy_percent}::int,
      ${snapshot.summary.arrivals}::int,
      ${snapshot.summary.departures}::int,
      ${snapshot.summary.total_charged_ugx}::bigint,
      ${snapshot.summary.total_collected_ugx}::bigint,
      ${snapshot.summary.cash_total_ugx}::bigint,
      ${snapshot.summary.mpesa_total_ugx}::bigint,
      ${snapshot.summary.card_total_ugx}::bigint,
      ${snapshot.summary.transfer_total_ugx}::bigint,
      ${snapshot.summary.pesapal_total_ugx}::bigint,
      ${snapshot.summary.pesapal_manual_total_ugx}::bigint,
      ${snapshot.summary.receipt_count}::int,
      ${snapshot.summary.missing_receipt_count}::int,
      ${snapshot.summary.voided_charges_count}::int,
      ${snapshot.summary.voided_charges_amount_ugx}::bigint,
      ${snapshot.summary.open_balance_count}::int,
      ${snapshot.summary.open_balance_amount_ugx}::bigint,
      ${snapshot.summary.pending_payment_count}::int,
      ${snapshot.summary.pending_payment_amount_ugx}::bigint,
      ${notes}
    )
  `;

  revalidatePath("/night-audit");
  redirect(nightAuditPath(businessDate, "Night audit closed."));
}

export async function voidNightAuditCloseAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  if (session.role !== "superadmin") {
    throw new Error("Only superadmin can void a night-audit close.");
  }

  const closureId = String(formData.get("closure_id") ?? "").trim();
  const businessDate = String(formData.get("business_date") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!closureId) {
    redirect(nightAuditPath(businessDate, "Missing close record."));
  }
  if (!reason) {
    redirect(nightAuditPath(businessDate, "Please enter a reason before voiding the close."));
  }
  if (reason.length > MAX_REASON_LENGTH) {
    redirect(nightAuditPath(businessDate, "Please shorten the void reason."));
  }

  const sql = getSql();
  const rows = (await sql`
    UPDATE night_audit_closures
    SET
      voided_at = now(),
      voided_by = ${session.userId}::uuid,
      void_reason = ${reason}
    WHERE id = ${closureId}::uuid
      AND voided_at IS NULL
    RETURNING business_date::text
  `) as { business_date: string }[];

  if (rows.length === 0) {
    redirect(nightAuditPath(businessDate, "That close record could not be voided."));
  }

  revalidatePath("/night-audit");
  redirect(nightAuditPath(rows[0].business_date, "Night audit close voided."));
}
