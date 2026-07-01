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

export function imageExtensionForType(type: string): string {
  return EXTENSION_BY_TYPE[type] ?? "bin";
}

export function buildImageObjectKey(prefix: string, stem: string, contentType: string): string {
  return `${prefix.replace(/^\/+|\/+$/g, "")}/${stem}.${imageExtensionForType(contentType)}`;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function detectImageType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  if (bytes.length >= 16 && ascii(bytes, 4, 8) === "ftyp") {
    const brands = ascii(bytes, 8, Math.min(bytes.length, 32));
    if (brands.includes("avif") || brands.includes("avis")) {
      return "image/avif";
    }
  }

  return null;
}

export async function uploadImageFile(
  file: File,
  prefix: string,
  options?: { key?: string }
): Promise<UploadResult> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ImageUploadError("Only JPEG, PNG, WebP, or AVIF images are allowed.");
  }
  if (file.size === 0) {
    throw new ImageUploadError("Image is empty.");
  }
  if (file.size > MAX_BYTES) {
    throw new ImageUploadError("Image must be 8MB or smaller.");
  }

  const bytes = await file.arrayBuffer();
  const detectedType = detectImageType(new Uint8Array(bytes.slice(0, 64)));
  if (detectedType !== file.type) {
    throw new ImageUploadError("Image file contents do not match the selected file type.");
  }

  const key = options?.key ?? buildImageObjectKey(prefix, `${Date.now()}-${randomId()}`, file.type);

  return uploadObject(key, bytes, file.type);
}
