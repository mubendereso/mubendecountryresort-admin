"use client";

import { useRef, useState, useTransition } from "react";
import { uploadRoomCoverAction } from "@/lib/rooms/actions";

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.85;
const MAX_BYTES = 8 * 1024 * 1024;

// Downscale + re-encode to WebP in the browser so we upload ~200-500KB instead
// of multi-MB phone photos. Decode happens off the main thread via
// createImageBitmap, so the UI stays responsive. Falls back to the original
// file if the browser can't decode/encode it.
async function shrinkImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", WEBP_QUALITY)
  );
  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}

export function RoomCoverUpload({ roomId, slug }: { roomId: string; slug: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an image to upload.");
      return;
    }

    startTransition(async () => {
      const processed = await shrinkImage(file);
      if (processed.size > MAX_BYTES) {
        setError("Image is too large even after compression. Try a smaller photo.");
        return;
      }

      const formData = new FormData();
      formData.set("id", roomId);
      formData.set("slug", slug);
      formData.set("image", processed);

      await uploadRoomCoverAction(formData);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <input
        ref={fileRef}
        type="file"
        name="image"
        accept="image/jpeg,image/png,image/webp,image/avif"
        disabled={isPending}
        className="text-sm"
      />
      <p className="text-xs text-oliveMuted-600">
        JPEG, PNG, WebP, or AVIF. Large photos are resized automatically before upload.
      </p>
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-2xl bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Uploading…" : "Upload cover image"}
        </button>
      </div>
    </form>
  );
}
