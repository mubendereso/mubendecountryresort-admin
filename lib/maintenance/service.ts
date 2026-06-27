import "server-only";

import type { AdminRole } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import type { AuditEntry } from "@/lib/sync/mutations";
import type { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from "./types";

export type MaintenanceActor = { userId: string; email: string | null; role: AdminRole; activityId?: string };

export type CreateMaintenanceInput = {
  id?: string;
  roomUnitId: string | null;
  roomTypeId: string | null;
  assignedTo: string | null;
  externalVendorName: string | null;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  title: string;
  description: string;
  scheduledFor: string | null;
  expectedReturnAt: string | null;
  estimatedCostUgx: number | null;
};

type WorkOrderState = {
  id: string;
  work_order_number: string;
  status: MaintenanceStatus;
  assigned_to: string | null;
  title: string;
};

function isManager(role: AdminRole): boolean {
  return role === "admin" || role === "superadmin";
}

async function getWorkOrder(id: string): Promise<WorkOrderState | null> {
  const sql = getSql();
  const rows = (await sql`SELECT id::text, work_order_number, status, assigned_to::text, title FROM maintenance_work_orders WHERE id=${id}::uuid LIMIT 1`) as WorkOrderState[];
  return rows[0] ?? null;
}

export async function createMaintenanceRecord(input: CreateMaintenanceInput, actor: MaintenanceActor): Promise<{ id: string; number: string; audit: AuditEntry }> {
  if (input.assignedTo && !isManager(actor.role)) throw new Error("Only admin or superadmin can assign work orders.");
  const manager = isManager(actor.role);
  const assignedTo = manager ? input.assignedTo : null;
  const externalVendorName = manager ? input.externalVendorName : null;
  const scheduledFor = manager ? input.scheduledFor : null;
  const expectedReturnAt = manager ? input.expectedReturnAt : null;
  const estimatedCostUgx = manager ? input.estimatedCostUgx : null;
  const workOrderId = input.id ?? crypto.randomUUID();
  const activityId = actor.activityId ?? crypto.randomUUID();
  const sql = getSql();
  const rows = (await sql`
    WITH created AS (
      INSERT INTO maintenance_work_orders (
        id, room_unit_id, room_type_id, reported_by, assigned_to, external_vendor_name,
        category, priority, status, title, description, scheduled_for,
        expected_return_at, estimated_cost_ugx
      ) VALUES (
        ${workOrderId}::uuid, ${input.roomUnitId}::uuid,
        ${input.roomTypeId}::uuid, ${actor.userId}::uuid, ${assignedTo}::uuid,
        ${externalVendorName}, ${input.category}, ${input.priority},
        CASE WHEN ${assignedTo}::uuid IS NULL THEN 'open' ELSE 'assigned' END,
        ${input.title}, ${input.description}, ${scheduledFor}::timestamptz,
        ${expectedReturnAt}::timestamptz, ${estimatedCostUgx}::bigint
      ) RETURNING id, work_order_number, status
    ), activity AS (
      INSERT INTO maintenance_activity (id, work_order_id, actor, action, previous_status, new_status, notes)
      SELECT ${activityId}::uuid, id, ${actor.userId}::uuid, 'created', NULL, status, ${input.description} FROM created
    )
    SELECT id::text, work_order_number, status FROM created
  `) as { id: string; work_order_number: string; status: MaintenanceStatus }[];
  const row = rows[0];
  if (!row) throw new Error("Work order could not be created.");
  return {
    id: row.id,
    number: row.work_order_number,
    audit: { action: "maintenance.created", entityType: "maintenance_work_order", entityId: row.id, summary: `Created work order ${row.work_order_number}: ${input.title}.`, context: { ...input, assignedTo, externalVendorName, scheduledFor, expectedReturnAt, estimatedCostUgx, status: row.status } }
  };
}

export async function editMaintenanceRecord(input: {
  id: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  externalVendorName: string | null;
  scheduledFor: string | null;
  expectedReturnAt: string | null;
  estimatedCostUgx: number | null;
}, actor: MaintenanceActor): Promise<AuditEntry> {
  const before = await getWorkOrder(input.id);
  if (!before) throw new Error("Work order not found.");
  if (["completed", "cancelled"].includes(before.status)) throw new Error("Closed work orders cannot be edited.");
  const manager = isManager(actor.role);
  const activityId = actor.activityId ?? crypto.randomUUID();
  const sql = getSql();
  await sql`
    WITH updated AS (
      UPDATE maintenance_work_orders SET
        title=${input.title}, description=${input.description}, category=${input.category}, priority=${input.priority},
        external_vendor_name=CASE WHEN ${manager} THEN ${input.externalVendorName} ELSE external_vendor_name END,
        scheduled_for=CASE WHEN ${manager} THEN ${input.scheduledFor}::timestamptz ELSE scheduled_for END,
        expected_return_at=CASE WHEN ${manager} THEN ${input.expectedReturnAt}::timestamptz ELSE expected_return_at END,
        estimated_cost_ugx=CASE WHEN ${manager} THEN ${input.estimatedCostUgx}::bigint ELSE estimated_cost_ugx END
      WHERE id=${input.id}::uuid RETURNING id, status
    )
    INSERT INTO maintenance_activity (id, work_order_id, actor, action, previous_status, new_status, notes)
    SELECT ${activityId}::uuid, id, ${actor.userId}::uuid, 'edited', status, status, 'Work order details updated.' FROM updated
  `;
  return { action: "maintenance.edited", entityType: "maintenance_work_order", entityId: input.id, summary: `Updated work order ${before.work_order_number}.`, context: input };
}

export async function assignMaintenanceRecord(id: string, assignedTo: string | null, note: string | null, actor: MaintenanceActor): Promise<AuditEntry> {
  if (!isManager(actor.role)) throw new Error("Only admin or superadmin can assign work orders.");
  const before = await getWorkOrder(id);
  if (!before) throw new Error("Work order not found.");
  if (["completed", "cancelled"].includes(before.status)) throw new Error("Closed work orders cannot be assigned.");
  const nextStatus: MaintenanceStatus = assignedTo ? (before.status === "open" ? "assigned" : before.status) : "open";
  const activityId = actor.activityId ?? crypto.randomUUID();
  const sql = getSql();
  await sql`
    WITH updated AS (
      UPDATE maintenance_work_orders SET assigned_to=${assignedTo}::uuid, status=${nextStatus}
      WHERE id=${id}::uuid RETURNING id
    )
    INSERT INTO maintenance_activity (id, work_order_id, actor, action, previous_status, new_status, notes)
    SELECT ${activityId}::uuid, id, ${actor.userId}::uuid, 'assigned', ${before.status}, ${nextStatus}, ${note} FROM updated
  `;
  return { action: "maintenance.assigned", entityType: "maintenance_work_order", entityId: id, summary: `${assignedTo ? "Assigned" : "Unassigned"} work order ${before.work_order_number}.`, context: { previousAssignee: before.assigned_to, assignedTo, note, previousStatus: before.status, nextStatus } };
}

const ALLOWED_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  open: ["in_progress", "cancelled"],
  assigned: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["waiting_parts", "on_hold", "completed", "cancelled"],
  waiting_parts: ["in_progress", "on_hold", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: []
};

export async function changeMaintenanceStatus(input: {
  id: string;
  status: MaintenanceStatus;
  note: string | null;
  resolutionNotes: string | null;
  actualCostUgx: number | null;
}, actor: MaintenanceActor): Promise<AuditEntry> {
  const before = await getWorkOrder(input.id);
  if (!before) throw new Error("Work order not found.");
  if (!ALLOWED_TRANSITIONS[before.status].includes(input.status)) throw new Error(`Cannot move a ${before.status.replaceAll("_", " ")} work order to ${input.status.replaceAll("_", " ")}.`);
  const manager = isManager(actor.role);
  if (!manager && before.assigned_to !== actor.userId) throw new Error("Only the assigned staff member or a manager can update this work order.");
  if ((input.status === "completed" || input.status === "cancelled") && !manager) throw new Error("Only admin or superadmin can complete or cancel work orders.");
  if (input.status === "completed" && !input.resolutionNotes?.trim()) throw new Error("Resolution notes are required to complete a work order.");
  const action = input.status === "completed" ? "completed" : input.status === "cancelled" ? "cancelled" : `status_${input.status}`;
  const activityId = actor.activityId ?? crypto.randomUUID();
  const sql = getSql();
  await sql`
    WITH updated AS (
      UPDATE maintenance_work_orders SET
        status=${input.status},
        started_at=CASE WHEN ${input.status}='in_progress' AND started_at IS NULL THEN now() ELSE started_at END,
        completed_at=CASE WHEN ${input.status}='completed' THEN now() ELSE completed_at END,
        resolution_notes=CASE WHEN ${input.status}='completed' THEN ${input.resolutionNotes} ELSE resolution_notes END,
        actual_cost_ugx=CASE WHEN ${input.status}='completed' THEN ${input.actualCostUgx}::bigint ELSE actual_cost_ugx END
      WHERE id=${input.id}::uuid RETURNING id
    )
    INSERT INTO maintenance_activity (id, work_order_id, actor, action, previous_status, new_status, notes)
    SELECT ${activityId}::uuid, id, ${actor.userId}::uuid, ${action}, ${before.status}, ${input.status}, COALESCE(${input.note}, ${input.resolutionNotes}) FROM updated
  `;
  return { action: `maintenance.${action}`, entityType: "maintenance_work_order", entityId: input.id, summary: `Changed ${before.work_order_number} from ${before.status.replaceAll("_", " ")} to ${input.status.replaceAll("_", " ")}.`, context: { previousStatus: before.status, newStatus: input.status, note: input.note, resolutionNotes: input.resolutionNotes, actualCostUgx: input.actualCostUgx } };
}

export async function addMaintenanceNote(id: string, note: string, actor: MaintenanceActor): Promise<AuditEntry> {
  const before = await getWorkOrder(id);
  if (!before) throw new Error("Work order not found.");
  const sql = getSql();
  const activityId = actor.activityId ?? crypto.randomUUID();
  await sql`INSERT INTO maintenance_activity (id, work_order_id, actor, action, previous_status, new_status, notes) VALUES (${activityId}::uuid, ${id}::uuid, ${actor.userId}::uuid, 'note_added', ${before.status}, ${before.status}, ${note})`;
  return { action: "maintenance.note_added", entityType: "maintenance_work_order", entityId: id, summary: `Added a note to ${before.work_order_number}.`, context: { note } };
}
