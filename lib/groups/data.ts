import "server-only";

import { getSql } from "@/lib/db/client";
import type { BookingRow } from "@/lib/bookings/data";
import { getGroupRoomBlockSummary, listGroupRoomBlocks } from "./room-blocks";
import type {
  ReservationGroupAuditEvent,
  ReservationGroupDetailData,
  ReservationGroupRow,
  ReservationGroupSettlement
} from "./types";

function formatIsoDate(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeGroupRow(row: ReservationGroupRow): ReservationGroupRow {
  return {
    ...row,
    booking_count: Number(row.booking_count),
    historical_booking_count: Number(row.historical_booking_count),
    inactive_booking_count: Number(row.inactive_booking_count),
    guest_count: Number(row.guest_count),
    historical_guest_count: Number(row.historical_guest_count),
    inactive_guest_count: Number(row.inactive_guest_count),
    total_charges_ugx: Number(row.total_charges_ugx),
    total_paid_ugx: Number(row.total_paid_ugx),
    balance_due_ugx: Number(row.balance_due_ugx),
    historical_total_charges_ugx: Number(row.historical_total_charges_ugx),
    historical_total_paid_ugx: Number(row.historical_total_paid_ugx),
    historical_balance_due_ugx: Number(row.historical_balance_due_ugx)
  };
}

function titleFromAction(action: string): string {
  switch (action) {
    case "reservation_group.created":
      return "Group created";
    case "reservation_group.updated":
      return "Group updated";
    case "reservation_group.archived":
      return "Group archived";
    case "reservation_group.closed":
      return "Group closed";
    case "reservation_group.booking_attached":
      return "Booking attached";
    case "reservation_group.booking_detached":
      return "Booking detached";
    case "reservation_group.room_block_created":
      return "Room block created";
    case "reservation_group.room_block_released":
      return "Room block released";
    case "booking.group_attached":
      return "Booking attached to group";
    case "booking.group_detached":
      return "Booking detached from group";
    case "booking.group_changed":
      return "Booking moved between groups";
    default:
      return action.replaceAll(".", " ").replaceAll("_", " ");
  }
}

function detailFromAction(action: string, summary: string): string {
  if (summary.trim().length > 0) return summary;
  return titleFromAction(action);
}

export async function listReservationGroups(): Promise<ReservationGroupRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      rg.id::text,
      rg.reference,
      rg.status,
      rg.group_name,
      rg.organizer_name,
      rg.organizer_email,
      rg.organizer_phone,
      rg.notes,
      COUNT(b.id) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded'))::int AS booking_count,
      COUNT(b.id)::int AS historical_booking_count,
      COUNT(b.id) FILTER (WHERE b.status IN ('cancelled', 'no_show', 'refunded'))::int AS inactive_booking_count,
      COALESCE(
        SUM(b.guests_adults + b.guests_children) FILTER (
          WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')
        ),
        0
      )::int AS guest_count,
      COALESCE(SUM(b.guests_adults + b.guests_children), 0)::int AS historical_guest_count,
      COALESCE(
        SUM(b.guests_adults + b.guests_children) FILTER (
          WHERE b.status IN ('cancelled', 'no_show', 'refunded')
        ),
        0
      )::int AS inactive_guest_count,
      COALESCE(
        SUM(
          CASE
            WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)
            ELSE 0
          END
        ),
        0
      )::bigint AS total_charges_ugx,
      COALESCE(
        SUM(
          CASE
            WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(
              payments.total_paid_ugx,
              CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
            )
            ELSE 0
          END
        ),
        0
      )::bigint AS total_paid_ugx,
      COALESCE(
        SUM(
          CASE
            WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)
              - COALESCE(
                payments.total_paid_ugx,
                CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
              )
            ELSE 0
          END
        ),
        0
      )::bigint AS balance_due_ugx,
      COALESCE(SUM(COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)), 0)::bigint AS historical_total_charges_ugx,
      COALESCE(
        SUM(
          COALESCE(
            payments.total_paid_ugx,
            CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
          )
        ),
        0
      )::bigint AS historical_total_paid_ugx,
      COALESCE(
        SUM(
          COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)
          - COALESCE(
            payments.total_paid_ugx,
            CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
          )
        ),
        0
      )::bigint AS historical_balance_due_ugx,
      COALESCE(
        MIN(b.check_in) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')),
        MIN(b.check_in)
      )::text AS first_check_in,
      COALESCE(
        MAX(b.check_out) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')),
        MAX(b.check_out)
      )::text AS last_check_out,
      to_char(rg.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(rg.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
    FROM reservation_groups rg
    LEFT JOIN bookings b ON b.group_id = rg.id
    LEFT JOIN LATERAL (
      SELECT sum(
        CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END
      ) FILTER (WHERE fc.voided_at IS NULL) AS total_charges_ugx
      FROM folio_charges fc
      WHERE fc.booking_id = b.id
    ) charges ON true
    LEFT JOIN LATERAL (
      SELECT sum(fp.amount_ugx) AS total_paid_ugx
      FROM folio_payments fp
      WHERE fp.booking_id = b.id
    ) payments ON true
    WHERE rg.status <> 'archived'
    GROUP BY rg.id
    ORDER BY rg.created_at DESC, rg.group_name ASC
  `) as ReservationGroupRow[];

  return rows.map(normalizeGroupRow);
}

export async function getReservationGroupById(groupId: string): Promise<ReservationGroupRow | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      rg.id::text,
      rg.reference,
      rg.status,
      rg.group_name,
      rg.organizer_name,
      rg.organizer_email,
      rg.organizer_phone,
      rg.notes,
      COUNT(b.id) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded'))::int AS booking_count,
      COUNT(b.id)::int AS historical_booking_count,
      COUNT(b.id) FILTER (WHERE b.status IN ('cancelled', 'no_show', 'refunded'))::int AS inactive_booking_count,
      COALESCE(
        SUM(b.guests_adults + b.guests_children) FILTER (
          WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')
        ),
        0
      )::int AS guest_count,
      COALESCE(SUM(b.guests_adults + b.guests_children), 0)::int AS historical_guest_count,
      COALESCE(
        SUM(b.guests_adults + b.guests_children) FILTER (
          WHERE b.status IN ('cancelled', 'no_show', 'refunded')
        ),
        0
      )::int AS inactive_guest_count,
      COALESCE(
        SUM(
          CASE
            WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)
            ELSE 0
          END
        ),
        0
      )::bigint AS total_charges_ugx,
      COALESCE(
        SUM(
          CASE
            WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(
              payments.total_paid_ugx,
              CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
            )
            ELSE 0
          END
        ),
        0
      )::bigint AS total_paid_ugx,
      COALESCE(
        SUM(
          CASE
            WHEN b.status NOT IN ('cancelled', 'no_show', 'refunded') THEN COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)
              - COALESCE(
                payments.total_paid_ugx,
                CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
              )
            ELSE 0
          END
        ),
        0
      )::bigint AS balance_due_ugx,
      COALESCE(SUM(COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)), 0)::bigint AS historical_total_charges_ugx,
      COALESCE(
        SUM(
          COALESCE(
            payments.total_paid_ugx,
            CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
          )
        ),
        0
      )::bigint AS historical_total_paid_ugx,
      COALESCE(
        SUM(
          COALESCE(charges.total_charges_ugx, b.quoted_total_ugx)
          - COALESCE(
            payments.total_paid_ugx,
            CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
          )
        ),
        0
      )::bigint AS historical_balance_due_ugx,
      COALESCE(
        MIN(b.check_in) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')),
        MIN(b.check_in)
      )::text AS first_check_in,
      COALESCE(
        MAX(b.check_out) FILTER (WHERE b.status NOT IN ('cancelled', 'no_show', 'refunded')),
        MAX(b.check_out)
      )::text AS last_check_out,
      to_char(rg.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(rg.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
    FROM reservation_groups rg
    LEFT JOIN bookings b ON b.group_id = rg.id
    LEFT JOIN LATERAL (
      SELECT sum(
        CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END
      ) FILTER (WHERE fc.voided_at IS NULL) AS total_charges_ugx
      FROM folio_charges fc
      WHERE fc.booking_id = b.id
    ) charges ON true
    LEFT JOIN LATERAL (
      SELECT sum(fp.amount_ugx) AS total_paid_ugx
      FROM folio_payments fp
      WHERE fp.booking_id = b.id
    ) payments ON true
    WHERE rg.id = ${groupId}::uuid
    GROUP BY rg.id
    LIMIT 1
  `) as ReservationGroupRow[];

  const group = rows[0];
  return group ? normalizeGroupRow(group) : null;
}

export async function listReservationGroupBookings(groupId: string): Promise<BookingRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      b.id::text,
      b.reference,
      b.room_type_id::text,
      rt.title AS room_type_title,
      COALESCE(rt.cover_image_url, rt.gallery[1]) AS room_image_url,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_email,
      b.guest_phone,
      b.special_requests,
      b.status,
      to_char(b.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at,
      b.quoted_total_ugx,
      COALESCE(charges.total_charges_ugx, b.quoted_total_ugx) AS total_charges_ugx,
      COALESCE(
        payments.total_paid_ugx,
        CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
      ) AS total_paid_ugx,
      b.notes,
      b.room_unit_id::text,
      ru.unit_name AS room_unit_name,
      b.group_id::text,
      rg.reference AS group_reference,
      rg.group_name AS group_name,
      to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN room_units ru ON ru.id = b.room_unit_id
    LEFT JOIN reservation_groups rg ON rg.id = b.group_id
    LEFT JOIN LATERAL (
      SELECT sum(
        CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END
      ) FILTER (WHERE fc.voided_at IS NULL) AS total_charges_ugx
      FROM folio_charges fc
      WHERE fc.booking_id = b.id
    ) charges ON true
    LEFT JOIN LATERAL (
      SELECT sum(fp.amount_ugx) AS total_paid_ugx
      FROM folio_payments fp
      WHERE fp.booking_id = b.id
    ) payments ON true
    WHERE b.group_id = ${groupId}::uuid
    ORDER BY (b.status IN ('cancelled', 'no_show', 'refunded')) ASC, b.check_in ASC, b.created_at ASC
  `) as BookingRow[];

  return rows.map((booking) => ({
    ...booking,
    quoted_total_ugx: Number(booking.quoted_total_ugx),
    total_charges_ugx: Number(booking.total_charges_ugx),
    total_paid_ugx: Number(booking.total_paid_ugx)
  }));
}

export async function listReservationGroupAttachableBookings(groupId: string): Promise<BookingRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      b.id::text,
      b.reference,
      b.room_type_id::text,
      rt.title AS room_type_title,
      COALESCE(rt.cover_image_url, rt.gallery[1]) AS room_image_url,
      b.check_in::text,
      b.check_out::text,
      b.guests_adults,
      b.guests_children,
      b.guest_full_name,
      b.guest_email,
      b.guest_phone,
      b.special_requests,
      b.status,
      to_char(b.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at,
      b.quoted_total_ugx,
      COALESCE(charges.total_charges_ugx, b.quoted_total_ugx) AS total_charges_ugx,
      COALESCE(
        payments.total_paid_ugx,
        CASE WHEN b.paid_at IS NOT NULL THEN b.quoted_total_ugx ELSE 0 END
      ) AS total_paid_ugx,
      b.notes,
      b.room_unit_id::text,
      ru.unit_name AS room_unit_name,
      b.group_id::text,
      rg.reference AS group_reference,
      rg.group_name AS group_name,
      to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    LEFT JOIN room_units ru ON ru.id = b.room_unit_id
    LEFT JOIN reservation_groups rg ON rg.id = b.group_id
    LEFT JOIN LATERAL (
      SELECT sum(
        CASE WHEN fc.category = 'discount' THEN -fc.amount_ugx ELSE fc.amount_ugx END
      ) FILTER (WHERE fc.voided_at IS NULL) AS total_charges_ugx
      FROM folio_charges fc
      WHERE fc.booking_id = b.id
    ) charges ON true
    LEFT JOIN LATERAL (
      SELECT sum(fp.amount_ugx) AS total_paid_ugx
      FROM folio_payments fp
      WHERE fp.booking_id = b.id
    ) payments ON true
    WHERE b.group_id IS DISTINCT FROM ${groupId}::uuid
    ORDER BY b.created_at DESC
    LIMIT 300
  `) as BookingRow[];

  return rows.map((booking) => ({
    ...booking,
    quoted_total_ugx: Number(booking.quoted_total_ugx),
    total_charges_ugx: Number(booking.total_charges_ugx),
    total_paid_ugx: Number(booking.total_paid_ugx)
  }));
}

export async function listReservationGroupAuditEvents(groupId: string): Promise<ReservationGroupAuditEvent[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      al.id::text,
      al.action,
      al.summary,
      to_char(al.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      al.actor_email,
      au.full_name AS actor_name
    FROM audit_log al
    LEFT JOIN admin_users au ON au.id = al.actor_id
    WHERE al.entity_type = 'reservation_group'
      AND al.entity_id = ${groupId}::uuid
    ORDER BY al.created_at ASC
  `) as {
    id: string;
    action: string;
    summary: string;
    created_at: string;
    actor_email: string | null;
    actor_name: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    title: titleFromAction(row.action),
    detail: detailFromAction(row.action, row.summary),
    at: formatIsoDate(row.created_at) ?? row.created_at,
    actor_email: row.actor_email,
    actor_name: row.actor_name,
    action: row.action
  }));
}

export async function getReservationGroupSettlement(
  groupId: string,
  bookings?: BookingRow[]
): Promise<ReservationGroupSettlement> {
  const groupBookings = bookings ?? (await listReservationGroupBookings(groupId));
  const terminalStatuses = new Set(["checked_out", "cancelled", "no_show", "refunded"]);
  const openBookings = groupBookings
    .filter((booking) => !terminalStatuses.has(booking.status))
    .map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      guest_full_name: booking.guest_full_name,
      status: booking.status,
      balance_due_ugx: Math.max(0, booking.total_charges_ugx - booking.total_paid_ugx)
    }));
  const unsettledBookings = groupBookings
    .filter((booking) => !["cancelled", "no_show", "refunded"].includes(booking.status))
    .map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      guest_full_name: booking.guest_full_name,
      status: booking.status,
      balance_due_ugx: Math.max(0, booking.total_charges_ugx - booking.total_paid_ugx)
    }))
    .filter((booking) => booking.balance_due_ugx > 0);

  const sql = getSql();
  const receiptGaps = (await sql`
    SELECT
      b.id::text AS booking_id,
      b.reference AS booking_reference,
      COUNT(fp.id)::int AS missing_receipt_count
    FROM bookings b
    JOIN folio_payments fp ON fp.booking_id = b.id
    LEFT JOIN payment_receipts pr ON pr.payment_id = fp.id
    WHERE b.group_id = ${groupId}::uuid
      AND pr.id IS NULL
    GROUP BY b.id, b.reference
    ORDER BY b.reference ASC
  `) as {
    booking_id: string;
    booking_reference: string;
    missing_receipt_count: number;
  }[];
  const missingReceiptCount = receiptGaps.reduce(
    (sum, gap) => sum + Number(gap.missing_receipt_count),
    0
  );

  const blockers: string[] = [];
  if (groupBookings.length === 0) {
    blockers.push("No member bookings are attached to this group.");
  }
  if (openBookings.length > 0) {
    blockers.push(`${openBookings.length} member booking${openBookings.length === 1 ? " is" : "s are"} still active.`);
  }
  if (unsettledBookings.length > 0) {
    blockers.push(`${unsettledBookings.length} member folio${unsettledBookings.length === 1 ? " has" : "s have"} an unresolved balance.`);
  }
  if (missingReceiptCount > 0) {
    blockers.push(`${missingReceiptCount} payment${missingReceiptCount === 1 ? " is" : "s are"} missing receipts.`);
  }

  return {
    total_bookings: groupBookings.length,
    terminal_booking_count: groupBookings.length - openBookings.length,
    open_booking_count: openBookings.length,
    unsettled_booking_count: unsettledBookings.length,
    balance_due_ugx: unsettledBookings.reduce((sum, booking) => sum + booking.balance_due_ugx, 0),
    missing_receipt_count: missingReceiptCount,
    can_close: blockers.length === 0,
    blockers,
    open_bookings: openBookings,
    unsettled_bookings: unsettledBookings,
    receipt_gaps: receiptGaps.map((gap) => ({
      ...gap,
      missing_receipt_count: Number(gap.missing_receipt_count)
    }))
  };
}

export async function getReservationGroupDetailData(
  groupId: string
): Promise<ReservationGroupDetailData | null> {
  const [group, roomBlocks, roomBlockSummary, bookings, attachableBookings, auditEvents] = await Promise.all([
    getReservationGroupById(groupId),
    listGroupRoomBlocks(groupId),
    getGroupRoomBlockSummary(groupId),
    listReservationGroupBookings(groupId),
    listReservationGroupAttachableBookings(groupId),
    listReservationGroupAuditEvents(groupId)
  ]);

  if (!group) return null;
  const settlement = await getReservationGroupSettlement(groupId, bookings);

  return {
    group,
    roomBlocks,
    roomBlockSummary,
    bookings,
    attachableBookings,
    auditEvents,
    settlement
  };
}
