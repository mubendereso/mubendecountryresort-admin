"use server";

import { revalidatePath } from "next/cache";
import { recordAuditLog } from "@/lib/audit/log";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import type { FolioCategory, PaymentMethod } from "./types";

const VALID_CATEGORIES: FolioCategory[] = [
  "accommodation",
  "food",
  "beverage",
  "other",
  "tax"
];

const VALID_METHODS: PaymentMethod[] = [
  "pesapal_manual",
  "cash",
  "mpesa",
  "card",
  "transfer"
];

const MAX_DESCRIPTION_LENGTH = 300;
const MAX_PAYMENT_REFERENCE_LENGTH = 200;

function parseUgxAmount(value: FormDataEntryValue | null): number {
  const normalized = String(value ?? "").trim().replace(/[,\s]/g, "");
  if (!/^\d+$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized));
}

export async function postChargeAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();

  const bookingId = formData.get("booking_id") as string;
  const description = (formData.get("description") as string)?.trim();
  const category = formData.get("category") as FolioCategory;

  if (!bookingId) throw new Error("Missing booking ID.");
  if (!description) throw new Error("Description is required.");
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error("Description is too long.");
  }
  if (!VALID_CATEGORIES.includes(category)) throw new Error("Invalid category.");

  const amount = parseUgxAmount(formData.get("amount_ugx"));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }

  const sql = getSql();
  await sql`
    INSERT INTO folio_charges (booking_id, description, amount_ugx, category, posted_by)
    VALUES (
      ${bookingId}::uuid,
      ${description},
      ${amount},
      ${category},
      ${session.userId}::uuid
    )
  `;

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "folio.charge_posted",
    entityType: "booking",
    entityId: bookingId,
    summary: `Posted a ${category} charge of ${amount} UGX.`,
    context: {
      bookingId,
      description,
      amountUgx: amount,
      category
    }
  });

  revalidatePath(`/bookings/${bookingId}/folio`);
}

export async function voidChargeAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();

  if (session.role === "staff") {
    throw new Error("Only admin or superadmin can void charges.");
  }

  const chargeId = formData.get("charge_id") as string;
  const bookingId = formData.get("booking_id") as string;

  if (!chargeId || !bookingId) throw new Error("Missing charge or booking ID.");

  const sql = getSql();
  const rows = (await sql`
    UPDATE folio_charges
    SET voided_at = now(), voided_by = ${session.userId}::uuid
    WHERE id = ${chargeId}::uuid AND voided_at IS NULL
    RETURNING description, amount_ugx, category
  `) as { description: string; amount_ugx: string | number; category: string }[];

  if (rows.length === 0) {
    throw new Error("Charge not found or already voided.");
  }

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "folio.charge_voided",
    entityType: "booking",
    entityId: bookingId,
    summary: `Voided a ${rows[0].category} charge of ${Number(rows[0].amount_ugx)} UGX.`,
    context: {
      bookingId,
      chargeId,
      description: rows[0].description,
      amountUgx: Number(rows[0].amount_ugx),
      category: rows[0].category
    }
  });

  revalidatePath(`/bookings/${bookingId}/folio`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();

  const bookingId = formData.get("booking_id") as string;
  const submittedMethod = formData.get("method") as PaymentMethod;
  const method: PaymentMethod =
    submittedMethod === "pesapal" ? "pesapal_manual" : submittedMethod;
  const reference = (formData.get("reference") as string)?.trim() || null;

  if (!bookingId) throw new Error("Missing booking ID.");
  if (!VALID_METHODS.includes(method)) throw new Error("Invalid payment method.");
  if (method === "pesapal_manual" && !reference) {
    throw new Error("Enter the Pesapal transaction reference.");
  }
  if ((reference?.length ?? 0) > MAX_PAYMENT_REFERENCE_LENGTH) {
    throw new Error("Payment reference is too long.");
  }

  const amount = parseUgxAmount(formData.get("amount_ugx"));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }

  const sql = getSql();
  const rows = (await sql`
    WITH booking_room AS (
      SELECT
        b.id,
        b.quoted_total_ugx,
        b.check_in,
        b.check_out,
        rt.title
      FROM bookings b
      JOIN room_types rt ON rt.id = b.room_type_id
      WHERE b.id = ${bookingId}::uuid
      FOR UPDATE OF b
    ),
    accommodation_charge AS (
      INSERT INTO folio_charges (booking_id, description, amount_ugx, category, posted_by)
      SELECT
        br.id,
        br.title || ' - ' ||
          (br.check_out::date - br.check_in::date)::text ||
          ' night' ||
          CASE WHEN (br.check_out::date - br.check_in::date) = 1 THEN '' ELSE 's' END,
        br.quoted_total_ugx,
        'accommodation',
        ${session.userId}::uuid
      FROM booking_room br
      WHERE NOT EXISTS (
        SELECT 1
        FROM folio_charges fc
        WHERE fc.booking_id = br.id
          AND fc.category = 'accommodation'
          AND fc.voided_at IS NULL
      )
      RETURNING booking_id
    ),
    payment AS (
      INSERT INTO folio_payments (booking_id, amount_ugx, method, reference, recorded_by)
      SELECT
        br.id,
        ${amount},
        ${method},
        ${reference},
        ${session.userId}::uuid
      FROM booking_room br
      RETURNING booking_id
    )
    SELECT
      (SELECT count(*)::int FROM payment) AS payment_count,
      (SELECT count(*)::int FROM accommodation_charge) AS accommodation_charge_count
  `) as { payment_count: number; accommodation_charge_count: number }[];

  if ((rows[0]?.payment_count ?? 0) === 0) {
    throw new Error("Booking not found.");
  }

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "folio.payment_recorded",
    entityType: "booking",
    entityId: bookingId,
    summary: `Recorded a ${method} payment of ${amount} UGX${reference ? ` with reference ${reference}` : ""}.`,
    context: {
      bookingId,
      amountUgx: amount,
      method,
      reference,
      accommodationChargeCreated: (rows[0]?.accommodation_charge_count ?? 0) > 0
    }
  });

  revalidatePath(`/bookings/${bookingId}/folio`);
}

export async function adjustRoomPriceAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();

  const bookingId = String(formData.get("booking_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const finalRoomPrice = parseUgxAmount(formData.get("final_room_price_ugx"));

  if (!bookingId) throw new Error("Missing booking ID.");
  if (!Number.isFinite(finalRoomPrice) || finalRoomPrice <= 0) {
    throw new Error("Final room price must be a positive amount.");
  }
  if ((reason?.length ?? 0) > MAX_DESCRIPTION_LENGTH) {
    throw new Error("Discount reason is too long.");
  }

  const sql = getSql();
  const rows = (await sql`
    WITH booking_room AS (
      SELECT b.id
      FROM bookings b
      WHERE b.id = ${bookingId}::uuid
      FOR UPDATE
    ),
    totals AS (
      SELECT
        br.id AS booking_id,
        COALESCE(SUM(fc.amount_ugx) FILTER (
          WHERE fc.category = 'accommodation' AND fc.voided_at IS NULL
        ), 0)::bigint AS accommodation_total,
        COALESCE(SUM(fc.amount_ugx) FILTER (
          WHERE fc.category = 'discount'
            AND fc.discount_scope = 'room_price'
            AND fc.voided_at IS NULL
        ), 0)::bigint AS room_discount_total
      FROM booking_room br
      LEFT JOIN folio_charges fc ON fc.booking_id = br.id
      GROUP BY br.id
    ),
    adjustment AS (
      INSERT INTO folio_charges (
        booking_id,
        description,
        amount_ugx,
        category,
        discount_scope,
        posted_by
      )
      SELECT
        t.booking_id,
        'Room price adjusted to ' || ${finalRoomPrice}::bigint::text
          || ' UGX ('
          || round(
            ((t.accommodation_total - ${finalRoomPrice}::bigint)::numeric * 100)
            / t.accommodation_total,
            1
          )::text
          || '% total discount)'
          || CASE WHEN ${reason}::text IS NULL THEN '' ELSE ' - ' || ${reason}::text END,
        (t.accommodation_total - t.room_discount_total) - ${finalRoomPrice}::bigint,
        'discount',
        'room_price',
        ${session.userId}::uuid
      FROM totals t
      WHERE t.accommodation_total > 0
        AND ${finalRoomPrice}::bigint < (t.accommodation_total - t.room_discount_total)
      RETURNING booking_id
    )
    SELECT
      t.accommodation_total,
      t.room_discount_total,
      (t.accommodation_total - t.room_discount_total)::bigint AS current_room_price,
      (SELECT count(*)::int FROM adjustment) AS adjustment_count
    FROM totals t
  `) as {
    accommodation_total: string;
    room_discount_total: string;
    current_room_price: string;
    adjustment_count: number;
  }[];

  if (!rows[0]) throw new Error("Booking not found.");

  const accommodationTotal = Number(rows[0].accommodation_total);
  const currentRoomPrice = Number(rows[0].current_room_price);
  if (accommodationTotal <= 0) {
    throw new Error("This folio has no active accommodation charge.");
  }
  if (rows[0].adjustment_count === 0) {
    throw new Error(
      finalRoomPrice === currentRoomPrice
        ? "That is already the current room price."
        : "Final room price must be lower than the current room price."
    );
  }

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "folio.room_price_adjusted",
    entityType: "booking",
    entityId: bookingId,
    summary: `Adjusted the room price to ${finalRoomPrice} UGX.`,
    context: {
      bookingId,
      finalRoomPriceUgx: finalRoomPrice,
      currentRoomPriceUgx: currentRoomPrice,
      accommodationTotalUgx: accommodationTotal,
      discountDeltaUgx: currentRoomPrice - finalRoomPrice,
      reason
    }
  });

  revalidatePath(`/bookings/${bookingId}/folio`);
}
