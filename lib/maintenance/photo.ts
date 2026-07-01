import { buildImageObjectKey, uploadImageFile } from "@/lib/storage/image-upload";
import { deleteObject } from "@/lib/storage/r2";
import type { SqlTag } from "@/lib/db/sql";
import type { AuditEntry } from "@/lib/sync/mutations";
import type { MaintenanceActor } from "./service";

export type MaintenancePhotoInput = {
  photoId: string;
  workOrderId: string;
  filename: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  base64: string;
};

export type MaintenancePhotoDeps = {
  uploadImageFile?: typeof uploadImageFile;
  deleteObject?: typeof deleteObject;
};

export async function createMaintenancePhotoRecord(
  input: MaintenancePhotoInput,
  actor: MaintenanceActor,
  sql: SqlTag,
  deps: MaintenancePhotoDeps = {}
): Promise<{ audit: AuditEntry; storagePath: string }> {
  const binary = atob(input.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  const file = new File([bytes], input.filename, { type: input.mimeType });
  const storageKey = buildImageObjectKey(`maintenance/${input.workOrderId}`, input.photoId, input.mimeType);
  const upload = deps.uploadImageFile ?? uploadImageFile;
  const remover = deps.deleteObject ?? deleteObject;
  const uploaded = await upload(file, `maintenance/${input.workOrderId}`, { key: storageKey });
  const activityId = actor.activityId ?? null;

  try {
    const rows = (await sql`
      WITH photo AS (
        INSERT INTO maintenance_photos (id, work_order_id, filename, storage_path, uploaded_by)
        VALUES (${input.photoId}::uuid, ${input.workOrderId}::uuid, ${input.filename}, ${uploaded.url}, ${actor.userId}::uuid)
        ON CONFLICT (id) DO NOTHING
        RETURNING work_order_id
      )
      INSERT INTO maintenance_activity (id, work_order_id, actor, action, notes)
      SELECT COALESCE(${activityId}::uuid, gen_random_uuid()), work_order_id, ${actor.userId}::uuid, 'photo_added', ${input.filename}
      FROM photo
      RETURNING work_order_id::text
    `) as { work_order_id: string }[];

    if (rows.length === 0) {
      throw new Error("Maintenance photo could not be saved.");
    }

    return {
      storagePath: uploaded.url,
      audit: {
        action: "maintenance.photo_added",
        entityType: "maintenance_work_order",
        entityId: input.workOrderId,
        summary: "Added a maintenance photo.",
        context: { photoId: input.photoId, filename: input.filename }
      }
    };
  } catch (error) {
    await remover(uploaded.key).catch(() => undefined);
    throw error;
  }
}



