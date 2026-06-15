import "server-only";

import { getSql } from "@/lib/db/client";
import type { PaymentMethod } from "./types";

export type PaymentReceipt = {
  id: string;
  payment_id: string;
  booking_id: string;
  receipt_number: string;
  booking_reference: string;
  guest_full_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  room_type_title: string;
  check_in: string;
  check_out: string;
  amount_ugx: number;
  payment_method: PaymentMethod;
  payment_reference: string | null;
  recorded_by_name: string | null;
  issued_at: string;
};

export async function getPaymentReceipt(
  bookingId: string,
  receiptId: string
): Promise<PaymentReceipt | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      pr.id::text,
      pr.payment_id::text,
      pr.booking_id::text,
      pr.receipt_number,
      pr.booking_reference,
      pr.guest_full_name,
      pr.guest_email,
      pr.guest_phone,
      pr.room_type_title,
      pr.check_in::text,
      pr.check_out::text,
      pr.amount_ugx,
      pr.payment_method,
      pr.payment_reference,
      pr.recorded_by_name,
      to_char(pr.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS issued_at
    FROM payment_receipts pr
    WHERE pr.id = ${receiptId}::uuid
      AND pr.booking_id = ${bookingId}::uuid
    LIMIT 1
  `) as PaymentReceipt[];

  if (!rows[0]) return null;
  return {
    ...rows[0],
    amount_ugx: Number(rows[0].amount_ugx)
  };
}
