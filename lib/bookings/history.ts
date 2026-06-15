import "server-only";

import { getSql } from "@/lib/db/client";
import { getBookingById, type BookingRow } from "./data";

export type BookingAuditEvent = {
  id: string;
  kind: "booking" | "folio" | "receipt";
  title: string;
  detail: string;
  at: string;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
};

export type BookingHistoryData = {
  booking: BookingRow;
  auditEvents: BookingAuditEvent[];
  ledgerEvents: BookingAuditEvent[];
};

function titleFromAction(action: string): string {
  switch (action) {
    case "booking.created":
      return "Booking created";
    case "booking.modified":
      return "Booking updated";
    case "booking.group_attached":
      return "Group attached";
    case "booking.group_detached":
      return "Group detached";
    case "booking.group_changed":
      return "Group changed";
    case "booking.status.changed":
      return "Booking status changed";
    case "booking.room_assigned":
      return "Room assigned";
    case "booking.room_unassigned":
      return "Room unassigned";
    case "folio.charge_posted":
      return "Charge posted";
    case "folio.charge_voided":
      return "Charge voided";
    case "folio.payment_recorded":
      return "Payment recorded";
    case "folio.room_price_adjusted":
      return "Room price adjusted";
    case "housekeeping.updated":
      return "Housekeeping updated";
    case "night_audit.closed":
      return "Night audit closed";
    case "night_audit.voided":
      return "Night audit voided";
    default:
      return action.replaceAll(".", " ").replaceAll("_", " ");
  }
}

function detailFromAction(action: string, summary: string): string {
  if (summary.trim().length > 0) return summary;
  return titleFromAction(action);
}

export async function getBookingHistoryData(bookingId: string): Promise<BookingHistoryData | null> {
  const booking = await getBookingById(bookingId);
  if (!booking) return null;

  const sql = getSql();
  const [auditRows, chargeRows, paymentRows, receiptRows] = await Promise.all([
    sql`
      SELECT
        al.id::text,
        al.action,
        al.summary,
        to_char(al.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
        al.actor_email,
        au.full_name AS actor_name
      FROM audit_log al
      LEFT JOIN admin_users au ON au.id = al.actor_id
      WHERE al.entity_type = 'booking'
        AND al.entity_id = ${bookingId}::uuid
      ORDER BY al.created_at ASC
    `,
    sql`
      SELECT
        fc.id::text,
        fc.description,
        fc.amount_ugx,
        fc.category,
        fc.discount_scope,
        to_char(fc.posted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS posted_at,
        to_char(fc.voided_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS voided_at,
        posted_by.full_name AS posted_by_name,
        voided_by.full_name AS voided_by_name
      FROM folio_charges fc
      LEFT JOIN admin_users posted_by ON posted_by.id = fc.posted_by
      LEFT JOIN admin_users voided_by ON voided_by.id = fc.voided_by
      WHERE fc.booking_id = ${bookingId}::uuid
      ORDER BY fc.posted_at ASC
    `,
    sql`
      SELECT
        fp.id::text,
        fp.amount_ugx,
        fp.method,
        fp.reference,
        to_char(fp.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recorded_at,
        recorder.full_name AS recorded_by_name,
        pr.id::text AS receipt_id,
        pr.receipt_number
      FROM folio_payments fp
      LEFT JOIN admin_users recorder ON recorder.id = fp.recorded_by
      LEFT JOIN payment_receipts pr ON pr.payment_id = fp.id
      WHERE fp.booking_id = ${bookingId}::uuid
      ORDER BY fp.recorded_at ASC
    `,
    sql`
      SELECT
        pr.id::text,
        pr.payment_id::text,
        pr.receipt_number,
        to_char(pr.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS issued_at,
        pr.amount_ugx,
        pr.payment_method,
        pr.payment_reference
      FROM payment_receipts pr
      WHERE pr.booking_id = ${bookingId}::uuid
      ORDER BY pr.issued_at ASC
    `
  ]);

  const bookingAuditRows = auditRows as {
    id: string;
    action: string;
    summary: string;
    created_at: string;
    actor_email: string | null;
    actor_name: string | null;
  }[];

  const auditEvents: BookingAuditEvent[] = [];

  if (!bookingAuditRows.some((row) => row.action === "booking.created")) {
    auditEvents.push({
      id: `booking-created:${booking.id}`,
      kind: "booking",
      title: "Booking created",
      detail: `${booking.reference} was created for ${booking.guest_full_name}.`,
      at: booking.created_at,
      actor_name: null,
      actor_email: null,
      action: "booking.created"
    });
  }

  for (const row of bookingAuditRows) {
    auditEvents.push({
      id: row.id,
      kind: "booking",
      title: titleFromAction(row.action),
      detail: detailFromAction(row.action, row.summary),
      at: row.created_at,
      actor_name: row.actor_name,
      actor_email: row.actor_email,
      action: row.action
    });
  }

  const ledgerEvents: BookingAuditEvent[] = [
    ...(chargeRows as {
      id: string;
      description: string;
      amount_ugx: string | number;
      category: string;
      discount_scope: string | null;
      posted_at: string;
      voided_at: string | null;
      posted_by_name: string | null;
      voided_by_name: string | null;
    }[]).map((row) => ({
      id: `charge:${row.id}`,
      kind: "folio" as const,
      title:
        row.category === "discount"
          ? row.discount_scope === "room_price"
            ? "Room price discount"
            : "Discount posted"
          : "Charge posted",
      detail: `${row.description} - ${Number(row.amount_ugx)} UGX${
        row.voided_at ? ` (voided by ${row.voided_by_name ?? "unknown"})` : ""
      }`,
      at: row.posted_at,
      actor_name: row.posted_by_name,
      actor_email: null,
      action: row.category === "discount" ? "folio.discount_posted" : "folio.charge_posted"
    })),
    ...(paymentRows as {
      id: string;
      amount_ugx: string | number;
      method: string;
      reference: string | null;
      recorded_at: string;
      recorded_by_name: string | null;
      receipt_id: string | null;
      receipt_number: string | null;
    }[]).map((row) => ({
      id: `payment:${row.id}`,
      kind: "folio" as const,
      title: "Payment recorded",
      detail: `${Number(row.amount_ugx)} UGX via ${row.method}${row.reference ? ` - ${row.reference}` : ""}`,
      at: row.recorded_at,
      actor_name: row.recorded_by_name,
      actor_email: null,
      action: "folio.payment_recorded"
    })),
    ...(receiptRows as {
      id: string;
      payment_id: string;
      receipt_number: string;
      issued_at: string;
      amount_ugx: string | number;
      payment_method: string;
      payment_reference: string | null;
    }[]).map((row) => ({
      id: `receipt:${row.id}`,
      kind: "receipt" as const,
      title: "Receipt issued",
      detail: `${row.receipt_number} - ${Number(row.amount_ugx)} UGX`,
      at: row.issued_at,
      actor_name: null,
      actor_email: null,
      action: "receipt.issued"
    }))
  ].sort((a, b) => {
    const diff = new Date(a.at).getTime() - new Date(b.at).getTime();
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  return {
    booking,
    auditEvents,
    ledgerEvents
  };
}
