"use client";

import { getLocalDb } from "@/lib/local-db/client";
import { enqueueMutation, pushOutbox, sync } from "@/lib/sync/engine";
import type {
  MaintenanceActivity,
  MaintenanceDetail,
  MaintenancePhoto,
  MaintenanceRoomOption,
  MaintenanceStaffOption,
  MaintenanceWorkOrder
} from "./types";

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
let activeMaintenanceMutationId: string | null = null;

type SeedData = {
  workOrders: MaintenanceWorkOrder[];
  activity?: MaintenanceActivity[];
  photos?: MaintenancePhoto[];
  rooms: MaintenanceRoomOption[];
  staff: MaintenanceStaffOption[];
  currentUser?: { id: string; email: string | null; role: "staff" | "admin" | "superadmin" };
};

export async function seedMaintenanceCache(data: SeedData): Promise<void> {
  const db = getLocalDb();
  const now = new Date().toISOString();
  if (data.currentUser) {
    await db.exec("INSERT OR REPLACE INTO _meta(key, value, updated_at) VALUES ('maintenance_current_user', ?, ?)", [JSON.stringify(data.currentUser), now]);
  }
  for (const room of data.rooms) {
    await db.exec(`INSERT INTO maintenance_rooms (id, unit_name, room_type_id, room_type_title, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET unit_name=excluded.unit_name, room_type_id=excluded.room_type_id, room_type_title=excluded.room_type_title, updated_at=excluded.updated_at`, [room.id, room.unit_name, room.room_type_id, room.room_type_title, now]);
  }
  for (const person of data.staff) {
    await db.exec(`INSERT INTO maintenance_staff (id, name, email, role, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, role=excluded.role, updated_at=excluded.updated_at`, [person.id, person.name, person.email, person.role, now]);
  }
  for (const order of data.workOrders) {
    await db.exec(`INSERT INTO maintenance_work_orders (
      id, work_order_number, room_unit_id, room_type_id, reported_by, assigned_to, external_vendor_name,
      category, priority, status, title, description, reported_at, scheduled_for, expected_return_at,
      started_at, completed_at, estimated_cost_ugx, actual_cost_ugx, resolution_notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET work_order_number=excluded.work_order_number, room_unit_id=excluded.room_unit_id,
      room_type_id=excluded.room_type_id, reported_by=excluded.reported_by, assigned_to=excluded.assigned_to,
      external_vendor_name=excluded.external_vendor_name, category=excluded.category, priority=excluded.priority,
      status=excluded.status, title=excluded.title, description=excluded.description, reported_at=excluded.reported_at,
      scheduled_for=excluded.scheduled_for, expected_return_at=excluded.expected_return_at, started_at=excluded.started_at,
      completed_at=excluded.completed_at, estimated_cost_ugx=excluded.estimated_cost_ugx,
      actual_cost_ugx=excluded.actual_cost_ugx, resolution_notes=excluded.resolution_notes,
      created_at=excluded.created_at, updated_at=excluded.updated_at`, [
      order.id, order.work_order_number, order.room_unit_id, order.room_type_id, order.reported_by,
      order.assigned_to, order.external_vendor_name, order.category, order.priority, order.status,
      order.title, order.description, order.reported_at, order.scheduled_for, order.expected_return_at,
      order.started_at, order.completed_at, order.estimated_cost_ugx, order.actual_cost_ugx,
      order.resolution_notes, order.created_at, order.updated_at
    ]);
  }
  for (const item of data.activity ?? []) {
    await db.exec(`INSERT OR REPLACE INTO maintenance_activity (id, work_order_id, actor, action, previous_status, new_status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [item.id, item.work_order_id, item.actor, item.action, item.previous_status, item.new_status, item.notes, item.created_at]);
  }
  for (const photo of data.photos ?? []) {
    await db.exec(`INSERT OR REPLACE INTO maintenance_photos (id, work_order_id, filename, storage_path, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)`, [photo.id, photo.work_order_id, photo.filename, photo.storage_path, photo.uploaded_by, photo.uploaded_at]);
  }
}

export async function loadMaintenanceOfflineContext(): Promise<{
  rooms: MaintenanceRoomOption[];
  staff: MaintenanceStaffOption[];
  currentUser: { id: string; email: string | null; role: "staff" | "admin" | "superadmin" } | null;
}> {
  const db = getLocalDb();
  const [rooms, staff, meta] = await Promise.all([
    db.query<MaintenanceRoomOption>("SELECT id, unit_name, room_type_id, room_type_title FROM maintenance_rooms ORDER BY room_type_title, unit_name"),
    db.query<MaintenanceStaffOption>("SELECT id, name, email, role FROM maintenance_staff ORDER BY name"),
    db.query<{ value: string }>("SELECT value FROM _meta WHERE key='maintenance_current_user'")
  ]);
  let currentUser = null;
  try { currentUser = meta[0]?.value ? JSON.parse(meta[0].value) : null; } catch { currentUser = null; }
  return { rooms, staff, currentUser };
}

export async function loadLocalWorkOrders(): Promise<MaintenanceWorkOrder[]> {
  const db = getLocalDb();
  const rows = await db.query<MaintenanceWorkOrder>(`SELECT
    mwo.*, mr.unit_name AS room_unit_name, mr.room_type_title,
    reporter.name AS reported_by_name, reporter.email AS reported_by_email,
    assignee.name AS assigned_to_name, assignee.email AS assigned_to_email
    FROM maintenance_work_orders mwo
    LEFT JOIN maintenance_rooms mr ON mr.id=mwo.room_unit_id
    LEFT JOIN maintenance_staff reporter ON reporter.id=mwo.reported_by
    LEFT JOIN maintenance_staff assignee ON assignee.id=mwo.assigned_to
    ORDER BY CASE mwo.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, mwo.reported_at DESC`);
  return rows.map((row) => ({ ...row, estimated_cost_ugx: row.estimated_cost_ugx === null ? null : Number(row.estimated_cost_ugx), actual_cost_ugx: row.actual_cost_ugx === null ? null : Number(row.actual_cost_ugx) }));
}

export async function loadLocalMaintenanceDetail(id: string): Promise<MaintenanceDetail | null> {
  const workOrder = (await loadLocalWorkOrders()).find((order) => order.id === id);
  if (!workOrder) return null;
  const db = getLocalDb();
  const activity = await db.query<MaintenanceActivity>(`SELECT ma.*, staff.name AS actor_name, staff.email AS actor_email FROM maintenance_activity ma LEFT JOIN maintenance_staff staff ON staff.id=ma.actor WHERE ma.work_order_id=? ORDER BY ma.created_at, ma.id`, [id]);
  const photos = await db.query<MaintenancePhoto>(`SELECT mp.*, staff.name AS uploaded_by_name FROM maintenance_photos mp LEFT JOIN maintenance_staff staff ON staff.id=mp.uploaded_by WHERE mp.work_order_id=? ORDER BY mp.uploaded_at, mp.id`, [id]);
  return { workOrder, activity, photos };
}

export async function refreshMaintenanceFromServer(): Promise<void> {
  if (!navigator.onLine) return;
  await sync();
}

export async function createLocalMaintenance(input: {
  id: string; actorId: string; roomUnitId: string | null; roomTypeId: string | null; assignedTo: string | null;
  externalVendorName: string | null; category: string; priority: string; title: string; description: string;
  scheduledFor: string | null; expectedReturnAt: string | null; estimatedCostUgx: number | null;
}): Promise<void> {
  const db = getLocalDb();
  const now = new Date().toISOString();
  const provisional = `MWO-OFFLINE-${input.id.slice(0, 8).toUpperCase()}`;
  const status = input.assignedTo ? "assigned" : "open";
  await db.exec(`INSERT INTO maintenance_work_orders (id, work_order_number, room_unit_id, room_type_id, reported_by, assigned_to, external_vendor_name, category, priority, status, title, description, reported_at, scheduled_for, expected_return_at, started_at, completed_at, estimated_cost_ugx, actual_cost_ugx, resolution_notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, ?, ?)`, [input.id, provisional, input.roomUnitId, input.roomTypeId, input.actorId, input.assignedTo, input.externalVendorName, input.category, input.priority, status, input.title, input.description, now, input.scheduledFor, input.expectedReturnAt, input.estimatedCostUgx, now, now]);
  const activityId = crypto.randomUUID();
  await db.exec(`INSERT INTO maintenance_activity (id, work_order_id, actor, action, previous_status, new_status, notes, created_at) VALUES (?, ?, ?, 'created', NULL, ?, ?, ?)`, [activityId, input.id, input.actorId, status, input.description, now]);
  await enqueueMutation("maintenance.create", { id: input.id, roomUnitId: input.roomUnitId, roomTypeId: input.roomTypeId, assignedTo: input.assignedTo, externalVendorName: input.externalVendorName, category: input.category, priority: input.priority, title: input.title, description: input.description, scheduledFor: input.scheduledFor, expectedReturnAt: input.expectedReturnAt, estimatedCostUgx: input.estimatedCostUgx }, activityId);
  if (navigator.onLine) await pushOutbox();
}

export async function queueMaintenanceMutation(type: string, payload: Record<string, unknown>, localUpdate: (activityId: string) => Promise<void>): Promise<void> {
  const activityId = crypto.randomUUID();
  activeMaintenanceMutationId = activityId;
  try {
    await localUpdate(activityId);
  } finally {
    activeMaintenanceMutationId = null;
  }
  const normalizedPayload = { ...payload };
  for (const key of ["scheduledFor", "expectedReturnAt"]) {
    const value = normalizedPayload[key];
    if (typeof value === "string" && value && !value.endsWith("Z")) {
      normalizedPayload[key] = new Date(value).toISOString();
    }
  }
  await enqueueMutation(type, normalizedPayload, activityId);
  if (navigator.onLine) await pushOutbox();
}

export async function addLocalActivity(input: { id?: string; workOrderId: string; actorId: string; action: string; previousStatus: string | null; newStatus: string | null; notes: string | null }): Promise<void> {
  const db = getLocalDb();
  await db.exec(`INSERT INTO maintenance_activity (id, work_order_id, actor, action, previous_status, new_status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ${NOW_SQL})`, [input.id ?? activeMaintenanceMutationId ?? crypto.randomUUID(), input.workOrderId, input.actorId, input.action, input.previousStatus, input.newStatus, input.notes]);
}

export async function queueMaintenancePhoto(input: { photoId: string; workOrderId: string; actorId: string; filename: string; mimeType: string; dataUrl: string; base64: string }): Promise<void> {
  const db = getLocalDb();
  const now = new Date().toISOString();
  await db.exec(`INSERT INTO maintenance_photos (id, work_order_id, filename, storage_path, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)`, [input.photoId, input.workOrderId, input.filename, input.dataUrl, input.actorId, now]);
  const activityId = crypto.randomUUID();
  await addLocalActivity({ id: activityId, workOrderId: input.workOrderId, actorId: input.actorId, action: "photo_added", previousStatus: null, newStatus: null, notes: input.filename });
  await enqueueMutation("maintenance.photo_upload", { photoId: input.photoId, workOrderId: input.workOrderId, filename: input.filename, mimeType: input.mimeType, base64: input.base64 }, activityId);
  if (navigator.onLine) await pushOutbox();
}
