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

export async function postChargeAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();

  const bookingId = formData.get("booking_id") as string;
  const description = (formData.get("description") as string)?.trim();
  const amountStr = formData.get("amount_ugx") as string;
  const category = formData.get("category") as FolioCategory;

  if (!bookingId) throw new Error("Missing booking ID.");
  if (!description) throw new Error("Description is required.");
  if (!VALID_CATEGORIES.includes(category)) throw new Error("Invalid category.");

  const amount = Math.round(Number(amountStr));
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
  const amountStr = formData.get("amount_ugx") as string;
  const method = formData.get("method") as PaymentMethod;
  const reference = (formData.get("reference") as string)?.trim() || null;

  if (!bookingId) throw new Error("Missing booking ID.");
  if (!VALID_METHODS.includes(method)) throw new Error("Invalid payment method.");

  const amount = Math.round(Number(amountStr));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number.");
  }

  const sql = getSql();
  await sql`
    INSERT INTO folio_payments (booking_id, amount_ugx, method, reference, recorded_by)
    VALUES (
      ${bookingId}::uuid,
      ${amount},
      ${method},
      ${reference},
      ${session.userId}::uuid
    )
  `;

  revalidatePath(`/bookings/${bookingId}/folio`);
}
