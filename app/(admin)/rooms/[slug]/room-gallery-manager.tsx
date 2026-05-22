"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadRoomGalleryImageAction,
  removeRoomGalleryImageAction
} from "@/lib/rooms/actions";
import { shrinkImage } from "@/lib/images/shrink-image";

const MAX_GALLERY_IMAGES = 15;
const MAX_BYTES = 8 * 1024 * 1024;

export function RoomGalleryManager({
  roomId,
  slug,
  gallery
}: {
  roomId: string;
  slug: string;
  gallery: string[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remaining = MAX_GALLERY_IMAGES - gallery.length;
  const isFull = remaining <= 0;

  function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) {
      setError("Choose one or more images to upload.");
      return;
    }
    if (files.length > remaining) {
      setError(
        `You can add ${remaining} more image${remaining === 1 ? "" : "s"} (max ${MAX_GALLERY_IMAGES}).`
      );
      return;
    }

    startTransition(async () => {
      try {
        for (let i = 0; i < files.length; i++) {
          setProgress(`Uploading ${i + 1} of ${files.length}…`);
          const processed = await shrinkImage(files[i]);
          if (processed.size > MAX_BYTES) {
            throw new Error(
              `"${files[i].name}" is too large even after compression. Try a smaller photo.`
            );
          }
          const formData = new FormData();
          formData.set("id", roomId);
          formData.set("slug", slug);
          formData.set("image", processed);
          await uploadRoomGalleryImageAction(formData);
        }
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setProgress(null);
      }
    });
  }

  function onRemove(url: string) {
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("id", roomId);
        formData.set("slug", slug);
        formData.set("url", url);
        await removeRoomGalleryImageAction(formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove image.");
      }
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">
          {gallery.length} of {MAX_GALLERY_IMAGES} images
        </p>
      </div>

      {gallery.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {gallery.map((url, index) => (
            <div key={url} className="group relative overflow-hidden rounded-2xl border border-stoneWarm-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Gallery image ${index + 1}`} className="h-32 w-full object-cover" />
              <button
                type="button"
                disabled={isPending}
                onClick={() => onRemove(url)}
                className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-oliveMuted-600">No gallery images yet.</p>
      )}

      <form onSubmit={onUpload} className="grid gap-3">
        <input
          ref={fileRef}
          type="file"
          name="images"
          multiple
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={isPending || isFull}
          className="text-sm"
        />
        <p className="text-xs text-oliveMuted-600">
          {isFull
            ? `Gallery is full (max ${MAX_GALLERY_IMAGES}). Remove an image to add more.`
            : `Select up to ${remaining} image${remaining === 1 ? "" : "s"}. JPEG, PNG, WebP, or AVIF — large photos are resized automatically.`}
        </p>
        {progress ? <p className="text-xs font-semibold text-oliveMuted-600">{progress}</p> : null}
        {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
        <div>
          <button
            type="submit"
            disabled={isPending || isFull}
            className="rounded-2xl bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Uploading…" : "Upload images"}
          </button>
        </div>
      </form>
    </div>
  );
}
