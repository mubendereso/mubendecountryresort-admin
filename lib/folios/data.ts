import "server-only";

import { getSql } from "@/lib/db/client";
import type { FolioCharge, FolioData, FolioPayment } from "./types";

export type { FolioCharge, FolioData, FolioPayment } from "./types";

export async function getFolioData(bookingId: string): Promise<FolioData> {
  const sql = getSql();

  const [charges, payments] = await Promise.all([
    sql`
      SELECT
        fc.id::text,
        fc.booking_id::text,
        fc.description,
        fc.amount_ugx,
        fc.category,
        fc.discount_scope,
        fc.posted_by::text,
        au.full_name AS posted_by_name,
        to_char(fc.posted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS posted_at,
        to_char(fc.voided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS voided_at,
        fc.voided_by::text
      FROM folio_charges fc
      LEFT JOIN admin_users au ON au.id = fc.posted_by
      WHERE fc.booking_id = ${bookingId}::uuid
      ORDER BY fc.posted_at
    `,
    sql`
      SELECT
        fp.id::text,
        fp.booking_id::text,
        fp.amount_ugx,
        fp.method,
        fp.reference,
        fp.recorded_by::text,
        au.full_name AS recorded_by_name,
        to_char(fp.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recorded_at
      FROM folio_payments fp
      LEFT JOIN admin_users au ON au.id = fp.recorded_by
      WHERE fp.booking_id = ${bookingId}::uuid
      ORDER BY fp.recorded_at
    `
  ]);

  // amount_ugx is a Postgres bigint, which the driver returns as a string.
  // Coerce to number so the typed contract holds and arithmetic in the UI
  // (sums, balance) doesn't fall back to string concatenation.
  return {
    charges: (charges as FolioCharge[]).map((c) => ({
      ...c,
      amount_ugx: Number(c.amount_ugx)
    })),
    payments: (payments as FolioPayment[]).map((p) => ({
      ...p,
      amount_ugx: Number(p.amount_ugx)
    }))
  };
}
