"use server";

import { revalidatePath } from "next/cache";
import { recordAuditLog } from "@/lib/audit/log";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getSql } from "@/lib/db/client";
import {
  HOUSEKEEPING_STATUSES,
  type HousekeepingStatus
} from "./types";

const VALID_STATUSES = new Set<HousekeepingStatus>(HOUSEKEEPING_STATUSES);

function readRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${key}.`);
  }
  return value.trim();
}

export async function updateRoomUnitHousekeepingAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();

  const id = readRequiredString(formData, "id");
  const status = readRequiredString(formData, "status") as HousekeepingStatus;
  const notesValue = formData.get("notes");
  const notes =
    typeof notesValue === "string" && notesValue.trim().length > 0 ? notesValue.trim() : null;

  if (!VALID_STATUSES.has(status)) {
    throw new Error("Invalid housekeeping status.");
  }

  if (notes && notes.length > 600) {
    throw new Error("Notes must be 600 characters or fewer.");
  }

  const sql = getSql();
  const beforeRows = (await sql`
    SELECT id::text, unit_name, housekeeping_status, notes
    FROM room_units
    WHERE id = ${id}::uuid
    LIMIT 1
  `) as { id: string; unit_name: string; housekeeping_status: HousekeepingStatus; notes: string | null }[];
  const before = beforeRows[0];
  if (!before) {
    throw new Error("Room unit not found.");
  }

  const rows = (await sql`
    UPDATE room_units
    SET housekeeping_status = ${status}, notes = ${notes}
    WHERE id = ${id}::uuid
    RETURNING id, unit_name
  `) as { id: string; unit_name: string }[];

  if (rows.length === 0) {
    throw new Error("Room unit not found.");
  }

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "housekeeping.updated",
    entityType: "room_unit",
    entityId: id,
    summary: `Marked ${rows[0].unit_name} as ${status.replaceAll("_", " ")}.`,
    context: {
      roomUnitId: id,
      unitName: rows[0].unit_name,
      previousStatus: before.housekeeping_status,
      status,
      before: {
        housekeepingStatus: before.housekeeping_status,
        notes: before.notes
      },
      after: {
        housekeepingStatus: status,
        notes
      },
      notes
    }
  });

  revalidatePath("/housekeeping");
  revalidatePath("/dashboard");
}
