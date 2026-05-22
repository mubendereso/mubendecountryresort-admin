"use client";

import { useRef, useState, useTransition } from "react";
import { uploadRoomCoverAction } from "@/lib/rooms/actions";
import { shrinkImage } from "@/lib/images/shrink-image";

const MAX_BYTES = 8 * 1024 * 1024;

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
