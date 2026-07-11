export type RoomCoverRecord = {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
};

export type RoomCoverUploadResult = {
  key: string;
  url: string;
};

export type RoomCoverUploadDeps = {
  uploadImageFile: (file: File, prefix: string) => Promise<RoomCoverUploadResult>;
  deleteObject: (key: string) => Promise<void>;
  updateRoomCover: (url: string) => Promise<RoomCoverRecord | null>;
  onCleanupFailure?: (error: unknown, key: string) => void;
};

export class RoomCoverUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoomCoverUploadError";
  }
}

export async function uploadAndStoreRoomCover(
  file: File,
  prefix: string,
  deps: RoomCoverUploadDeps
): Promise<{ room: RoomCoverRecord; key: string; url: string }> {
  const uploaded = await deps.uploadImageFile(file, prefix);
  let stored = false;

  try {
    const room = await deps.updateRoomCover(uploaded.url);
    if (!room) {
      throw new RoomCoverUploadError("Room was not found.");
    }

    // From this point onward the database references the uploaded object.
    // Later audit or cache work must never delete it as compensation.
    stored = true;
    return { room, key: uploaded.key, url: uploaded.url };
  } catch (error) {
    if (!stored) {
      try {
        await deps.deleteObject(uploaded.key);
      } catch (cleanupError) {
        try {
          deps.onCleanupFailure?.(cleanupError, uploaded.key);
        } catch {
          // Cleanup reporting must not replace the original persistence error.
        }
      }
    }
    throw error;
  }
}
