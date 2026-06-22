import "server-only";

import { getSql } from "@/lib/db/client";
import type { FolioCharge, FolioPayment } from "@/lib/folios/types";
import { getReservationGroupById, listReservationGroupBookings } from "./data";
import type {
  GroupFolioAllocation,
  GroupFolioBooking,
  GroupFolioData,
  GroupFolioPayment
} from "./folio-types";

export type {
  GroupFolioAllocation,
  GroupFolioBooking,
  GroupFolioData,
  GroupFolioPayment
} from "./folio-types";

export async function getGroupFolioData(groupId: string): Promise<GroupFolioData | null> {
  const [group, bookings] = await Promise.all([
    getReservationGroupById(groupId),
    listReservationGroupBookings(groupId)
  ]);

  if (!group) return null;

  const sql = getSql();
  const [chargeRows, paymentRows, groupPaymentRows, allocationRows] = await Promise.all([
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
      JOIN bookings b ON b.id = fc.booking_id
      LEFT JOIN admin_users au ON au.id = fc.posted_by
      WHERE b.group_id = ${groupId}::uuid
      ORDER BY fc.posted_at, fc.id
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
        to_char(fp.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recorded_at,
        pr.id::text AS receipt_id,
        pr.receipt_number
      FROM folio_payments fp
      JOIN bookings b ON b.id = fp.booking_id
      LEFT JOIN admin_users au ON au.id = fp.recorded_by
      LEFT JOIN payment_receipts pr ON pr.payment_id = fp.id
      WHERE b.group_id = ${groupId}::uuid
      ORDER BY fp.recorded_at, fp.id
    `,
    sql`
      SELECT
        gfp.id::text,
        gfp.group_id::text,
        gfp.amount_ugx,
        gfp.method,
        gfp.reference,
        gfp.note,
        gfp.recorded_by::text,
        au.full_name AS recorded_by_name,
        to_char(gfp.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recorded_at,
        COALESCE(SUM(gfpa.amount_ugx), 0)::bigint AS allocated_amount_ugx,
        COUNT(gfpa.id)::int AS allocation_count
      FROM group_folio_payments gfp
      LEFT JOIN admin_users au ON au.id = gfp.recorded_by
      LEFT JOIN group_folio_payment_allocations gfpa ON gfpa.group_payment_id = gfp.id
      WHERE gfp.group_id = ${groupId}::uuid
      GROUP BY gfp.id, au.full_name
      ORDER BY gfp.recorded_at DESC, gfp.id DESC
    `,
    sql`
      SELECT
        gfpa.id::text,
        gfpa.group_payment_id::text,
        gfpa.booking_id::text,
        b.reference AS booking_reference,
        b.guest_full_name,
        gfpa.folio_payment_id::text,
        pr.id::text AS receipt_id,
        pr.receipt_number,
        gfpa.amount_ugx,
        to_char(gfpa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM group_folio_payment_allocations gfpa
      JOIN bookings b ON b.id = gfpa.booking_id
      LEFT JOIN payment_receipts pr ON pr.payment_id = gfpa.folio_payment_id
      WHERE b.group_id = ${groupId}::uuid
      ORDER BY gfpa.created_at DESC, gfpa.id DESC
    `
  ]);

  const chargesByBooking = new Map<string, FolioCharge[]>();
  for (const charge of chargeRows as FolioCharge[]) {
    const normalized = { ...charge, amount_ugx: Number(charge.amount_ugx) };
    chargesByBooking.set(normalized.booking_id, [
      ...(chargesByBooking.get(normalized.booking_id) ?? []),
      normalized
    ]);
  }

  const paymentsByBooking = new Map<string, FolioPayment[]>();
  for (const payment of paymentRows as FolioPayment[]) {
    const normalized = { ...payment, amount_ugx: Number(payment.amount_ugx) };
    paymentsByBooking.set(normalized.booking_id, [
      ...(paymentsByBooking.get(normalized.booking_id) ?? []),
      normalized
    ]);
  }

  return {
    group,
    bookings: bookings.map((booking) => ({
      ...booking,
      charges: chargesByBooking.get(booking.id) ?? [],
      payments: paymentsByBooking.get(booking.id) ?? []
    })) as GroupFolioBooking[],
    groupPayments: (groupPaymentRows as GroupFolioPayment[]).map((payment) => ({
      ...payment,
      amount_ugx: Number(payment.amount_ugx),
      allocated_amount_ugx: Number(payment.allocated_amount_ugx),
      allocation_count: Number(payment.allocation_count)
    })),
    allocations: (allocationRows as GroupFolioAllocation[]).map((allocation) => ({
      ...allocation,
      amount_ugx: Number(allocation.amount_ugx)
    }))
  };
}
