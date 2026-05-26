"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeRoomGalleryImageAction,
  uploadRoomGalleryImageAction
} from "@/lib/rooms/actions";
import { shrinkImage } from "@/lib/images/shrink-image";

const MAX_GALLERY_IMAGES = 15;
const MAX_BYTES = 8 * 1024 * 1024;

type RoomGalleryProps = {
  roomId: string;
  slug: string;
  gallery: string[];
};

export function RoomImageUploader({ roomId, slug, gallery }: RoomGalleryProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remaining = MAX_GALLERY_IMAGES - gallery.length;
  const isFull = remaining <= 0;

  function onUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (selectedFiles.length === 0) {
      setError("Choose one or more images to upload.");
      return;
    }
    if (selectedFiles.length > remaining) {
      setError(
        `You can add ${remaining} more image${remaining === 1 ? "" : "s"} (max ${MAX_GALLERY_IMAGES}).`
      );
      return;
    }

    startTransition(async () => {
      try {
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          setProgress(`Uploading ${i + 1} of ${selectedFiles.length}...`);

          const processed = await shrinkImage(file);
          if (processed.size > MAX_BYTES) {
            throw new Error(
              `"${file.name}" is too large even after compression. Try a smaller photo.`
            );
          }

          const formData = new FormData();
          formData.set("id", roomId);
          formData.set("slug", slug);
          formData.set("image", processed);
          await uploadRoomGalleryImageAction(formData);
        }

        if (fileRef.current) fileRef.current.value = "";
        setSelectedFiles([]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setProgress(null);
      }
    });
  }

  return (
    <form onSubmit={onUpload} className="grid gap-3">
      <p className="text-sm font-semibold">
        {gallery.length} of {MAX_GALLERY_IMAGES} images assigned
      </p>
      <input
        ref={fileRef}
        type="file"
        name="images"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        disabled={isPending || isFull}
        onChange={(event) => {
          setError(null);
          setSelectedFiles(Array.from(event.currentTarget.files ?? []));
        }}
        className="text-sm"
      />
      <p className="text-xs text-oliveMuted-600">
        {isFull
          ? `This room already has ${MAX_GALLERY_IMAGES} images. Remove one below to add more.`
          : `Select up to ${remaining} image${remaining === 1 ? "" : "s"} at once. Large photos are resized automatically.`}
      </p>
      {selectedFiles.length > 0 ? (
        <div className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-xs text-oliveMuted-600">
          <p className="font-semibold text-oliveMuted-700">
            {selectedFiles.length} image{selectedFiles.length === 1 ? "" : "s"} selected
          </p>
          <p className="mt-1 truncate">{selectedFiles.map((file) => file.name).join(", ")}</p>
        </div>
      ) : null}
      {progress ? <p className="text-xs font-semibold text-oliveMuted-600">{progress}</p> : null}
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
      <div>
        <button
          type="submit"
          disabled={isPending || isFull}
          className="rounded-2xl bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Uploading..." : "Upload selected images"}
        </button>
      </div>
    </form>
  );
}

export function RoomGalleryManager({ roomId, slug, gallery }: RoomGalleryProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      <p className="text-sm font-semibold">
        {gallery.length} of {MAX_GALLERY_IMAGES} images assigned to this room
      </p>

      {gallery.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {gallery.map((url, index) => (
            <div key={url} className="group relative overflow-hidden rounded-2xl border border-stoneWarm-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Room image ${index + 1}`} className="h-32 w-full object-cover" />
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
        <p className="text-sm text-oliveMuted-600">No images assigned to this room yet.</p>
      )}

      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}
