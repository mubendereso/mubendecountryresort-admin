"use server";

import { revalidatePath } from "next/cache";
import { recordAuditLog } from "@/lib/audit/log";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getSql } from "@/lib/db/client";
import type { PaymentMethod } from "@/lib/folios/types";

const VALID_GROUP_PAYMENT_METHODS: Exclude<PaymentMethod, "pesapal">[] = [
  "pesapal_manual",
  "cash",
  "mpesa",
  "card",
  "transfer"
];

const MAX_PAYMENT_REFERENCE_LENGTH = 200;
const MAX_PAYMENT_NOTE_LENGTH = 500;

export type RecordGroupPaymentResult =
  | {
      ok: true;
      groupId: string;
      groupPaymentId: string;
      allocationCount: number;
      allocatedAmountUgx: number;
    }
  | { ok: false; error: string };

function parseUgxAmount(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "").trim().replace(/[,\s]/g, "");
  if (!/^\d+$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized));
}

function normalizedText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function recordGroupPaymentAction(
  formData: FormData
): Promise<RecordGroupPaymentResult> {
  const session = await requireApprovedAdminRole();

  const groupId = normalizedText(formData.get("group_id"));
  const submittedMethod = normalizedText(formData.get("method")) as PaymentMethod;
  const method: Exclude<PaymentMethod, "pesapal"> =
    submittedMethod === "pesapal" ? "pesapal_manual" : submittedMethod;
  const reference = normalizedText(formData.get("reference")) || null;
  const note = normalizedText(formData.get("note")) || null;
  const amount = parseUgxAmount(formData.get("amount_ugx"));

  if (!groupId) return { ok: false, error: "Missing group reference." };
  if (!isUuid(groupId)) return { ok: false, error: "Please select a valid group." };
  if (!VALID_GROUP_PAYMENT_METHODS.includes(method)) {
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
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount must be a positive number." };
  }

  const sql = getSql();

  try {
    const rows = (await sql`
      WITH group_row AS (
        SELECT id, reference, group_name, status
        FROM reservation_groups
        WHERE id = ${groupId}::uuid
        FOR UPDATE
      ),
      booking_balances AS (
        SELECT
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
        FROM bookings b
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
        WHERE b.group_id = ${groupId}::uuid
          AND b.status NOT IN ('cancelled', 'no_show', 'refunded')
        FOR UPDATE OF b
      ),
      running_balances AS (
        SELECT
          bb.*,
          COALESCE(
            SUM(bb.balance_ugx) OVER (
              ORDER BY bb.check_in, bb.created_at, bb.booking_id
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          )::bigint AS prior_balance_ugx
        FROM booking_balances bb
        WHERE bb.balance_ugx > 0
      ),
      totals AS (
        SELECT COALESCE(SUM(balance_ugx), 0)::bigint AS total_balance_ugx
        FROM booking_balances
      ),
      group_payment AS (
        INSERT INTO group_folio_payments (
          group_id,
          amount_ugx,
          method,
          reference,
          note,
          recorded_by
        )
        SELECT
          gr.id,
          ${amount}::bigint,
          ${method},
          ${reference},
          ${note},
          ${session.userId}::uuid
        FROM group_row gr, totals t
        WHERE gr.status = 'active'
          AND t.total_balance_ugx >= ${amount}::bigint
        RETURNING id, group_id
      ),
      allocation_rows AS (
        SELECT
          rb.booking_id,
          rb.booking_reference,
          rb.quoted_total_ugx,
          rb.room_type_title,
          LEAST(
            rb.balance_ugx,
            GREATEST(${amount}::bigint - rb.prior_balance_ugx, 0)
          )::bigint AS allocation_amount_ugx
        FROM running_balances rb
        WHERE LEAST(
          rb.balance_ugx,
          GREATEST(${amount}::bigint - rb.prior_balance_ugx, 0)
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
          ar.room_type_title || ' - group folio settlement',
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
          gp.id
        FROM allocation_rows ar
        CROSS JOIN group_payment gp
        RETURNING id, booking_id, amount_ugx, group_payment_id
      ),
      allocation_ledger AS (
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
        gr.id::text AS group_id,
        gr.reference AS group_reference,
        gr.group_name,
        gr.status AS group_status,
        t.total_balance_ugx,
        gp.id::text AS group_payment_id,
        COALESCE(COUNT(al.group_payment_id), 0)::int AS allocation_count,
        COALESCE(SUM(al.amount_ugx), 0)::bigint AS allocated_amount_ugx
      FROM group_row gr
      CROSS JOIN totals t
      LEFT JOIN group_payment gp ON gp.group_id = gr.id
      LEFT JOIN allocation_ledger al ON al.group_payment_id = gp.id
      GROUP BY gr.id, gr.reference, gr.group_name, gr.status, t.total_balance_ugx, gp.id
    `) as {
      group_id: string;
      group_reference: string;
      group_name: string;
      group_status: string;
      total_balance_ugx: string | number;
      group_payment_id: string | null;
      allocation_count: number;
      allocated_amount_ugx: string | number;
    }[];

    const result = rows[0];
    if (!result) return { ok: false, error: "Group not found." };
    if (result.group_status !== "active") {
      return { ok: false, error: "Payments can only be recorded for active groups." };
    }
    if (!result.group_payment_id) {
      const totalBalance = Number(result.total_balance_ugx);
      return {
        ok: false,
        error:
          totalBalance <= 0
            ? "This group has no active balance to pay."
            : `Group payment cannot exceed the active balance of UGX ${new Intl.NumberFormat("en-UG").format(totalBalance)}.`
      };
    }

    const allocatedAmount = Number(result.allocated_amount_ugx);
    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "reservation_group.payment_recorded",
      entityType: "reservation_group",
      entityId: groupId,
      summary: `Recorded a group ${method} payment of ${allocatedAmount} UGX for ${result.group_name}.`,
      context: {
        groupId,
        groupReference: result.group_reference,
        groupName: result.group_name,
        groupPaymentId: result.group_payment_id,
        amountUgx: amount,
        allocatedAmountUgx: allocatedAmount,
        allocationCount: Number(result.allocation_count),
        method,
        reference,
        note
      }
    });

    revalidatePath("/groups");
    revalidatePath(`/groups/${groupId}`);
    revalidatePath(`/groups/${groupId}/folio`);
    revalidatePath("/bookings");
    revalidatePath("/front-desk");

    return {
      ok: true,
      groupId,
      groupPaymentId: result.group_payment_id,
      allocationCount: Number(result.allocation_count),
      allocatedAmountUgx: allocatedAmount
    };
  } catch (error) {
    console.error("record_group_payment failed:", error);
    return { ok: false, error: "Group payment could not be recorded. Please try again." };
  }
}
