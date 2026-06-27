import "server-only";

import { getSql } from "@/lib/db/client";
import type {
  MaintenanceActivity,
  MaintenanceDetail,
  MaintenancePhoto,
  MaintenanceRoomOption,
  MaintenanceStaffOption,
  MaintenanceWorkOrder
} from "./types";

type MaintenanceFilters = {
  status?: string | null;
  priority?: string | null;
  category?: string | null;
  assignedTo?: string | null;
  query?: string | null;
};

function normalizeWorkOrder(row: MaintenanceWorkOrder): MaintenanceWorkOrder {
  return {
    ...row,
    estimated_cost_ugx: row.estimated_cost_ugx === null ? null : Number(row.estimated_cost_ugx),
    actual_cost_ugx: row.actual_cost_ugx === null ? null : Number(row.actual_cost_ugx)
  };
}

export async function listMaintenanceWorkOrders(filters: MaintenanceFilters = {}): Promise<MaintenanceWorkOrder[]> {
  const sql = getSql();
  const status = filters.status?.trim() || null;
  const priority = filters.priority?.trim() || null;
  const category = filters.category?.trim() || null;
  const assignedTo = filters.assignedTo?.trim() || null;
  const query = filters.query?.trim() || null;
  const pattern = query ? `%${query}%` : null;
  const rows = (await sql`
    SELECT
      mwo.id::text, mwo.work_order_number, mwo.room_unit_id::text, ru.unit_name AS room_unit_name,
      mwo.room_type_id::text, rt.title AS room_type_title,
      mwo.reported_by::text, reporter.full_name AS reported_by_name, reporter.email AS reported_by_email,
      mwo.assigned_to::text, assignee.full_name AS assigned_to_name, assignee.email AS assigned_to_email,
      mwo.external_vendor_name, mwo.category, mwo.priority, mwo.status, mwo.title, mwo.description,
      to_char(mwo.reported_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS reported_at,
      to_char(mwo.scheduled_for AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS scheduled_for,
      to_char(mwo.expected_return_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expected_return_at,
      to_char(mwo.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS started_at,
      to_char(mwo.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS completed_at,
      mwo.estimated_cost_ugx, mwo.actual_cost_ugx, mwo.resolution_notes,
      to_char(mwo.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
      to_char(mwo.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
    FROM maintenance_work_orders mwo
    LEFT JOIN room_units ru ON ru.id = mwo.room_unit_id
    LEFT JOIN room_types rt ON rt.id = mwo.room_type_id
    LEFT JOIN admin_users reporter ON reporter.id = mwo.reported_by
    LEFT JOIN admin_users assignee ON assignee.id = mwo.assigned_to
    WHERE (${status}::text IS NULL OR mwo.status = ${status})
      AND (${priority}::text IS NULL OR mwo.priority = ${priority})
      AND (${category}::text IS NULL OR mwo.category = ${category})
      AND (${assignedTo}::text IS NULL OR mwo.assigned_to = ${assignedTo}::uuid)
      AND (${pattern}::text IS NULL OR mwo.work_order_number ILIKE ${pattern} OR mwo.title ILIKE ${pattern} OR ru.unit_name ILIKE ${pattern})
    ORDER BY
      CASE mwo.status WHEN 'in_progress' THEN 0 WHEN 'assigned' THEN 1 WHEN 'open' THEN 2 WHEN 'waiting_parts' THEN 3 WHEN 'on_hold' THEN 4 ELSE 5 END,
      CASE mwo.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      mwo.reported_at DESC
  `) as MaintenanceWorkOrder[];
  return rows.map(normalizeWorkOrder);
}

export async function getMaintenanceDetail(id: string): Promise<MaintenanceDetail | null> {
  const sql = getSql();
  const [orders, activity, photos] = await Promise.all([
    listMaintenanceWorkOrders().then((rows) => rows.filter((row) => row.id === id)),
    sql`
      SELECT ma.id::text, ma.work_order_id::text, ma.actor::text,
        au.full_name AS actor_name, au.email AS actor_email, ma.action,
        ma.previous_status, ma.new_status, ma.notes,
        to_char(ma.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      FROM maintenance_activity ma LEFT JOIN admin_users au ON au.id = ma.actor
      WHERE ma.work_order_id = ${id}::uuid ORDER BY ma.created_at, ma.id
    `,
    sql`
      SELECT mp.id::text, mp.work_order_id::text, mp.filename, mp.storage_path,
        mp.uploaded_by::text, au.full_name AS uploaded_by_name,
        to_char(mp.uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS uploaded_at
      FROM maintenance_photos mp LEFT JOIN admin_users au ON au.id = mp.uploaded_by
      WHERE mp.work_order_id = ${id}::uuid ORDER BY mp.uploaded_at, mp.id
    `
  ]);
  if (!orders[0]) return null;
  return { workOrder: orders[0], activity: activity as MaintenanceActivity[], photos: photos as MaintenancePhoto[] };
}

export async function listMaintenanceRoomOptions(): Promise<MaintenanceRoomOption[]> {
  const sql = getSql();
  return (await sql`
    SELECT ru.id::text, ru.unit_name, ru.room_type_id::text, rt.title AS room_type_title
    FROM room_units ru JOIN room_types rt ON rt.id = ru.room_type_id
    ORDER BY rt.sort_order, rt.title, ru.floor NULLS LAST, ru.unit_name
  `) as MaintenanceRoomOption[];
}

export async function listMaintenanceStaffOptions(): Promise<MaintenanceStaffOption[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id::text, COALESCE(NULLIF(full_name, ''), email) AS name, email, role
    FROM admin_users WHERE is_active = true
    ORDER BY CASE role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, name
  `) as MaintenanceStaffOption[];
  return rows;
}
