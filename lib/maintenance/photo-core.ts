export type MaintenancePhotoInput = {
  photoId: string;
  workOrderId: string;
  filename: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  base64: string;
};

export type MaintenanceActor = {
  userId: string;
  email: string | null;
  role: "staff" | "admin" | "superadmin";
  activityId?: string;
};

export type MaintenancePhotoDeps = {
  uploadImageFile: (
    file: File,
    prefix: string,
    options?: { key?: string }
  ) => Promise<{ key: string; url: string }>;
  deleteObject: (key: string) => Promise<void>;
};

export type SqlLike = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;

const EXTENSION_BY_TYPE: Record<MaintenancePhotoInput["mimeType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif"
};

export function buildMaintenancePhotoStorageKey(input: Pick<MaintenancePhotoInput, "workOrderId" | "photoId" | "mimeType">): string {
  return `maintenance/${input.workOrderId}/${input.photoId}.${EXTENSION_BY_TYPE[input.mimeType]}`;
}

export async function createMaintenancePhotoRecord(
  input: MaintenancePhotoInput,
  actor: MaintenanceActor,
  sql: SqlLike,
  deps: MaintenancePhotoDeps
): Promise<{ audit: { action: string; entityType: string; entityId: string; summary: string; context: Record<string, unknown> }; storagePath: string }> {
  const binary = atob(input.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  const file = new File([bytes], input.filename, { type: input.mimeType });
  const storageKey = buildMaintenancePhotoStorageKey(input);
  const uploaded = await deps.uploadImageFile(file, `maintenance/${input.workOrderId}`, { key: storageKey });
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
    await deps.deleteObject(uploaded.key).catch(() => undefined);
    throw error;
  }
}



