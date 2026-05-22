import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

export type UploadResult = {
  key: string;
  url: string;
};

type UploadBody = ArrayBuffer | ReadableStream | Uint8Array;

function getBucket() {
  return getCloudflareContext().env.MEDIA;
}

function getPublicUrl(key: string) {
  const base = getCloudflareContext().env.R2_PUBLIC_URL.replace(/\/$/, "");
  return `${base}/${key}`;
}

export async function uploadObject(
  key: string,
  body: UploadBody,
  contentType: string
): Promise<UploadResult> {
  await getBucket().put(key, body, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable"
    }
  });

  return { key, url: getPublicUrl(key) };
}

export async function deleteObject(key: string) {
  await getBucket().delete(key);
}

// Derive the R2 object key from a stored public URL, or null if the URL does
// not belong to our bucket (e.g. an external/legacy URL we shouldn't delete).
export function keyFromPublicUrl(url: string): string | null {
  const base = getCloudflareContext().env.R2_PUBLIC_URL.replace(/\/$/, "");
  if (!url.startsWith(base + "/")) return null;
  return url.slice(base.length + 1);
}
