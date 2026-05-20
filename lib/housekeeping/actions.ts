"use server";

import { revalidatePath } from "next/cache";
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
  await requireApprovedAdminRole();

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
  const rows = (await sql`
    UPDATE room_units
    SET housekeeping_status = ${status}, notes = ${notes}
    WHERE id = ${id}::uuid
    RETURNING id
  `) as { id: string }[];

  if (rows.length === 0) {
    throw new Error("Room unit not found.");
  }

  revalidatePath("/housekeeping");
  revalidatePath("/dashboard");
}
