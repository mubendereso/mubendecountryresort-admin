"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import { getSql } from "@/lib/db/client";
import { ImageUploadError } from "@/lib/storage/image-upload";
import { createMaintenancePhotoRecord } from "./photo";
import {
  addMaintenanceNote,
  assignMaintenanceRecord,
  changeMaintenanceStatus,
  createMaintenanceRecord,
  editMaintenanceRecord
} from "./service";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from "./types";

export type MaintenanceActionResult =
  | { ok: true; workOrderId: string; workOrderNumber?: string }
  | { ok: false; error: string };

const optionalUuid = z.union([z.string().uuid(), z.literal("")]).transform((value) => value || null);
const optionalDateTime = z.union([z.string().datetime({ local: true }), z.literal("")]).transform((value) => value || null);
const optionalText = z.string().trim().max(500).transform((value) => value || null);
const money = z.string().trim().transform((value) => {
  if (!value) return null;
  const normalized = value.replace(/[,\s]/g, "");
  return /^\d+$/.test(normalized) ? Number(normalized) : Number.NaN;
}).refine((value) => value === null || (Number.isSafeInteger(value) && value >= 0), "Enter a valid non-negative UGX amount.");

const createSchema = z.object({
  id: optionalUuid.optional(),
  roomUnitId: optionalUuid,
  roomTypeId: optionalUuid,
  assignedTo: optionalUuid,
  externalVendorName: optionalText,
  category: z.enum(MAINTENANCE_CATEGORIES),
  priority: z.enum(MAINTENANCE_PRIORITIES),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(5).max(5000),
  scheduledFor: optionalDateTime,
  expectedReturnAt: optionalDateTime,
  estimatedCostUgx: money
});

function revalidateMaintenance(id?: string) {
  revalidatePath("/maintenance");
  if (id) revalidatePath(`/maintenance/${id}`);
  revalidatePath("/dashboard");
}

function errorResult(error: unknown): MaintenanceActionResult {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Invalid work order." };
  return { ok: false, error: error instanceof Error ? error.message : "Maintenance action failed." };
}

export async function createMaintenanceWorkOrderAction(formData: FormData): Promise<MaintenanceActionResult> {
  const session = await requireApprovedAdminRole();
  try {
    const roomUnitId = String(formData.get("roomUnitId") ?? "");
    const roomTypeId = String(formData.get("roomTypeId") ?? "");
    const parsed = createSchema.parse({
      id: String(formData.get("id") ?? ""), roomUnitId, roomTypeId,
      assignedTo: String(formData.get("assignedTo") ?? ""),
      externalVendorName: String(formData.get("externalVendorName") ?? ""),
      category: String(formData.get("category") ?? ""), priority: String(formData.get("priority") ?? "normal"),
      title: String(formData.get("title") ?? ""), description: String(formData.get("description") ?? ""),
      scheduledFor: String(formData.get("scheduledFor") ?? ""), expectedReturnAt: String(formData.get("expectedReturnAt") ?? ""),
      estimatedCostUgx: String(formData.get("estimatedCostUgx") ?? "")
    });
    const created = await createMaintenanceRecord({ ...parsed, id: parsed.id ?? undefined }, session);
    await recordAuditLog({ actorId: session.userId, actorEmail: session.email, ...created.audit });
    revalidateMaintenance(created.id);
    return { ok: true, workOrderId: created.id, workOrderNumber: created.number };
  } catch (error) {
    return errorResult(error);
  }
}

export async function editMaintenanceWorkOrderAction(formData: FormData): Promise<MaintenanceActionResult> {
  const session = await requireApprovedAdminRole();
  try {
    const parsed = createSchema.omit({ id: true, roomUnitId: true, roomTypeId: true, assignedTo: true }).parse({
      externalVendorName: String(formData.get("externalVendorName") ?? ""), category: String(formData.get("category") ?? ""),
      priority: String(formData.get("priority") ?? ""), title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""), scheduledFor: String(formData.get("scheduledFor") ?? ""),
      expectedReturnAt: String(formData.get("expectedReturnAt") ?? ""), estimatedCostUgx: String(formData.get("estimatedCostUgx") ?? "")
    });
    const id = z.string().uuid().parse(String(formData.get("workOrderId") ?? ""));
    const audit = await editMaintenanceRecord({ id, ...parsed }, session);
    await recordAuditLog({ actorId: session.userId, actorEmail: session.email, ...audit });
    revalidateMaintenance(id);
    return { ok: true, workOrderId: id };
  } catch (error) { return errorResult(error); }
}

export async function assignMaintenanceWorkOrderAction(formData: FormData): Promise<MaintenanceActionResult> {
  const session = await requireApprovedAdminRole();
  try {
    const id = z.string().uuid().parse(String(formData.get("workOrderId") ?? ""));
    const assignedTo = optionalUuid.parse(String(formData.get("assignedTo") ?? ""));
    const note = optionalText.parse(String(formData.get("note") ?? ""));
    const audit = await assignMaintenanceRecord(id, assignedTo, note, session);
    await recordAuditLog({ actorId: session.userId, actorEmail: session.email, ...audit });
    revalidateMaintenance(id);
    return { ok: true, workOrderId: id };
  } catch (error) { return errorResult(error); }
}

export async function changeMaintenanceStatusAction(formData: FormData): Promise<MaintenanceActionResult> {
  const session = await requireApprovedAdminRole();
  try {
    const id = z.string().uuid().parse(String(formData.get("workOrderId") ?? ""));
    const status = z.enum(MAINTENANCE_STATUSES).parse(String(formData.get("status") ?? ""));
    const note = optionalText.parse(String(formData.get("note") ?? ""));
    const resolutionNotes = z.string().trim().max(3000).transform((value) => value || null).parse(String(formData.get("resolutionNotes") ?? ""));
    const actualCostUgx = money.parse(String(formData.get("actualCostUgx") ?? ""));
    const audit = await changeMaintenanceStatus({ id, status, note, resolutionNotes, actualCostUgx }, session);
    await recordAuditLog({ actorId: session.userId, actorEmail: session.email, ...audit });
    revalidateMaintenance(id);
    return { ok: true, workOrderId: id };
  } catch (error) { return errorResult(error); }
}

export async function addMaintenanceNoteAction(formData: FormData): Promise<MaintenanceActionResult> {
  const session = await requireApprovedAdminRole();
  try {
    const id = z.string().uuid().parse(String(formData.get("workOrderId") ?? ""));
    const note = z.string().trim().min(1).max(2000).parse(String(formData.get("note") ?? ""));
    const audit = await addMaintenanceNote(id, note, session);
    await recordAuditLog({ actorId: session.userId, actorEmail: session.email, ...audit });
    revalidateMaintenance(id);
    return { ok: true, workOrderId: id };
  } catch (error) { return errorResult(error); }
}

export async function uploadMaintenancePhotoAction(formData: FormData): Promise<MaintenanceActionResult> {
  const session = await requireApprovedAdminRole();
  try {
    const workOrderId = z.string().uuid().parse(String(formData.get("workOrderId") ?? ""));
    const photoId = optionalUuid.parse(String(formData.get("photoId") ?? "")) ?? crypto.randomUUID();
    const file = formData.get("image");
    if (!(file instanceof File)) throw new Error("Choose a maintenance photo.");
    const sql = getSql();
    const { audit, storagePath } = await createMaintenancePhotoRecord(
      {
        photoId,
        workOrderId,
        filename: file.name,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/avif",
        base64: Buffer.from(await file.arrayBuffer()).toString("base64")
      },
      { userId: session.userId, email: session.email, role: session.role },
      sql
    );
    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: audit.action,
      entityType: audit.entityType,
      entityId: workOrderId,
      summary: audit.summary,
      context: { ...audit.context, storagePath }
    });
    revalidateMaintenance(workOrderId);
    return { ok: true, workOrderId };
  } catch (error) {
    return errorResult(error instanceof ImageUploadError ? error : error);
  }
}
