import "server-only";

import { getSql } from "@/lib/db/client";

export type AuditEvent = {
  id: string;
  action: string;
  title: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  context: Record<string, unknown>;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
};

export type AuditFilters = {
  action?: string;
  entityType?: string;
  actorId?: string;
  limit?: number;
};

export function titleFromAuditAction(action: string): string {
  switch (action) {
    case "booking.created":
      return "Booking created";
    case "booking.modified":
      return "Booking updated";
    case "booking.checked_in":
      return "Checked in";
    case "booking.checked_out":
      return "Checked out";
    case "booking.cancelled":
      return "Booking cancelled";
    case "booking.no_show":
      return "No-show marked";
    case "booking.room_assigned":
      return "Room assigned";
    case "booking.room_unassigned":
      return "Room unassigned";
    case "booking.group_attached":
      return "Booking attached to group";
    case "booking.group_detached":
      return "Booking detached from group";
    case "booking.group_changed":
      return "Booking moved between groups";
    case "folio.charge_posted":
      return "Charge posted";
    case "folio.charge_voided":
      return "Charge voided";
    case "folio.payment_recorded":
      return "Payment recorded";
    case "folio.room_price_adjusted":
      return "Room price adjusted";
    case "invoice.draft_created":
      return "Invoice draft created";
    case "invoice.draft_refreshed":
      return "Invoice draft refreshed";
    case "invoice.issued":
      return "Invoice issued";
    case "invoice.voided":
      return "Invoice voided";
    case "reservation_group.created":
      return "Group created";
    case "reservation_group.updated":
      return "Group updated";
    case "reservation_group.archived":
      return "Group archived";
    case "reservation_group.closed":
      return "Group closed";
    case "reservation_group.active":
      return "Group reactivated";
    case "reservation_group.booking_attached":
      return "Group booking attached";
    case "reservation_group.booking_detached":
      return "Group booking detached";
    case "reservation_group.company_attached":
      return "Company payer attached";
    case "reservation_group.company_removed":
      return "Company payer removed";
    case "reservation_group.room_block_created":
      return "Room block created";
    case "reservation_group.room_block_released":
      return "Room block released";
    case "company_account.created":
      return "Company account created";
    case "company_account.updated":
      return "Company account updated";
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

function normalizeAuditEvent(row: AuditEvent): AuditEvent {
  return {
    ...row,
    title: titleFromAuditAction(row.action),
    context:
      typeof row.context === "string"
        ? JSON.parse(row.context)
        : row.context ?? {}
  };
}

export async function listAuditEvents(filters: AuditFilters = {}): Promise<AuditEvent[]> {
  const sql = getSql();
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const rows = (await sql`
    SELECT
      al.id::text,
      al.action,
      al.entity_type,
      al.entity_id::text,
      al.summary,
      COALESCE(al.context, '{}'::jsonb) AS context,
      to_char(al.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      al.actor_id::text,
      al.actor_email,
      au.full_name AS actor_name
    FROM audit_log al
    LEFT JOIN admin_users au ON au.id = al.actor_id
    WHERE (${filters.action ?? null}::text IS NULL OR al.action = ${filters.action ?? null})
      AND (${filters.entityType ?? null}::text IS NULL OR al.entity_type = ${filters.entityType ?? null})
      AND (${filters.actorId ?? null}::uuid IS NULL OR al.actor_id = ${filters.actorId ?? null}::uuid)
    ORDER BY al.created_at DESC
    LIMIT ${limit}
  `) as AuditEvent[];

  return rows.map(normalizeAuditEvent);
}

export async function listAuditEventsForEntity(
  entityType: string,
  entityId: string,
  limit = 80
): Promise<AuditEvent[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      al.id::text,
      al.action,
      al.entity_type,
      al.entity_id::text,
      al.summary,
      COALESCE(al.context, '{}'::jsonb) AS context,
      to_char(al.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      al.actor_id::text,
      al.actor_email,
      au.full_name AS actor_name
    FROM audit_log al
    LEFT JOIN admin_users au ON au.id = al.actor_id
    WHERE al.entity_type = ${entityType}
      AND al.entity_id = ${entityId}::uuid
    ORDER BY al.created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 200)}
  `) as AuditEvent[];

  return rows.map(normalizeAuditEvent);
}
