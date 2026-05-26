"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeRoomGalleryImageAction } from "@/lib/rooms/actions";

const MAX_GALLERY_IMAGES = 15;

type RoomGalleryProps = {
  roomId: string;
  slug: string;
  gallery: string[];
};

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
