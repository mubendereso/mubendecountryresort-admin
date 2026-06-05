"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import type { FolioCategory, PaymentMethod } from "./types";

const VALID_CATEGORIES: FolioCategory[] = [
  "accommodation",
  "food",
  "beverage",
  "other",
  "tax",
  "discount"
];

const VALID_METHODS: PaymentMethod[] = [
  "pesapal",
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
  await sql`
    UPDATE folio_charges
    SET voided_at = now(), voided_by = ${session.userId}::uuid
    WHERE id = ${chargeId}::uuid AND voided_at IS NULL
  `;

  revalidatePath(`/bookings/${bookingId}/folio`);
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();

  const bookingId = formData.get("booking_id") as string;
  const method = formData.get("method") as PaymentMethod;
  const reference = (formData.get("reference") as string)?.trim() || null;

  if (!bookingId) throw new Error("Missing booking ID.");
  if (!VALID_METHODS.includes(method)) throw new Error("Invalid payment method.");
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
        br.title || ' â€“ ' ||
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

  revalidatePath(`/bookings/${bookingId}/folio`);
}
