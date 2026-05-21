import "server-only";

import { uploadObject, type UploadResult } from "@/lib/storage/r2";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_BYTES = 8 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif"
};

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadError";
  }
}

function randomId() {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function uploadImageFile(file: File, prefix: string): Promise<UploadResult> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ImageUploadError("Only JPEG, PNG, WebP, or AVIF images are allowed.");
  }
  if (file.size === 0) {
    throw new ImageUploadError("Image is empty.");
  }
  if (file.size > MAX_BYTES) {
    throw new ImageUploadError("Image must be 8MB or smaller.");
  }

  const extension = EXTENSION_BY_TYPE[file.type] ?? "bin";
  const key = `${prefix.replace(/^\/+|\/+$/g, "")}/${Date.now()}-${randomId()}.${extension}`;

  return uploadObject(key, file.stream(), file.type);
}
