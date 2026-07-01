"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import { shrinkImage } from "@/lib/images/shrink-image";
import { createRoomTypeAction, uploadRoomGalleryImageAction, type CreateRoomTypeState } from "@/lib/rooms/actions";

const MAX_GALLERY_IMAGES = 15;
const MAX_BYTES = 8 * 1024 * 1024;

const initialCreateRoomTypeState: CreateRoomTypeState = {
  status: "idle",
  message: null,
  createdSlug: null,
  createdId: null
};

function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  required = false
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <input
        className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm font-normal"
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
      />
    </label>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  rows = 4
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <textarea
        className="resize-y rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm font-normal leading-6"
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
      />
    </label>
  );
}

function syncFileInput(input: HTMLInputElement | null, files: File[]) {
  if (!input) return;
  const dataTransfer = new DataTransfer();
  for (const file of files) {
    dataTransfer.items.add(file);
  }
  input.files = dataTransfer.files;
}

export function RoomCreateForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    createRoomTypeAction,
    initialCreateRoomTypeState
  );
  const [isSubmitting, startTransition] = useTransition();
  const uploadStartedForRef = useRef<string | null>(null);

  useEffect(() => {
    const nextUrls = galleryFiles.map((file) => URL.createObjectURL(file));
    setGalleryPreviews(nextUrls);
    return () => {
      for (const url of nextUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [galleryFiles]);

  function clearGallerySelection() {
    formRef.current?.reset();
    setGalleryFiles([]);
    setGalleryPreviews([]);
    setUploadProgress(null);
    syncFileInput(galleryInputRef.current, []);
  }

  function resetFormState() {
    clearGallerySelection();
    setPhotoError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhotoError(null);

    const formData = new FormData(event.currentTarget);
    formData.delete("gallery_images");

    startTransition(() => {
      formAction(formData);
    });
  }

  useEffect(() => {
    const createdId = state.createdId;
    const createdSlug = state.createdSlug;
    if (state.status !== "success" || !createdId || !createdSlug) return;

    if (uploadStartedForRef.current === createdId) return;
    uploadStartedForRef.current = createdId;

    if (galleryFiles.length === 0) {
      resetFormState();
      uploadStartedForRef.current = null;
      return;
    }

    void (async () => {
      const failures: string[] = [];
      let uploadedCount = 0;

      try {
        for (let index = 0; index < galleryFiles.length; index += 1) {
          const file = galleryFiles[index];
          setUploadProgress(`Uploading ${index + 1} of ${galleryFiles.length}: ${file.name}`);

          try {
            const processed = await shrinkImage(file);
            if (processed.size > MAX_BYTES) {
              throw new Error(
                `"${file.name}" is too large even after compression. Try a smaller photo.`
              );
            }

            const uploadForm = new FormData();
            uploadForm.set("id", createdId);
            uploadForm.set("slug", createdSlug);
            uploadForm.set("image", processed);
            await uploadRoomGalleryImageAction(uploadForm);
            uploadedCount += 1;
          } catch (error) {
            failures.push(`${file.name}: ${error instanceof Error ? error.message : "Upload failed."}`);
          }
        }

        clearGallerySelection();
        if (failures.length > 0) {
          const failureSummary = failures.length === 1 ? failures[0] : `${failures[0]} (+${failures.length - 1} more)`;
          setPhotoError(`Uploaded ${uploadedCount} of ${galleryFiles.length} images. ${failureSummary}`);
        }
      } catch (error) {
        clearGallerySelection();
        setPhotoError(error instanceof Error ? error.message : "Upload failed.");
      } finally {
        uploadStartedForRef.current = null;
      }
    })();
  }, [galleryFiles, state.createdId, state.createdSlug, state.status]);

  function updateGalleryFiles(files: File[]) {
    if (files.length > MAX_GALLERY_IMAGES) {
      setPhotoError(`You can upload at most ${MAX_GALLERY_IMAGES} gallery images.`);
      return;
    }
    setPhotoError(null);
    setGalleryFiles(files);
    syncFileInput(galleryInputRef.current, files);
  }

  function removeGalleryFile(index: number) {
    const next = galleryFiles.filter((_, currentIndex) => currentIndex !== index);
    updateGalleryFiles(next);
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="grid gap-5">
      {state.message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            state.status === "error"
              ? "border-[#a4635b]/25 bg-[#a4635b]/10 text-[#8b4d46]"
              : "border-stoneWarm-200 bg-white text-oliveMuted-600"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{state.message}</span>
            {state.createdSlug && (
              <Link
                href={`/rooms/${state.createdSlug}`}
                className="text-xs font-semibold text-oliveMuted-600 underline-offset-4 hover:underline"
              >
                Open room page
              </Link>
            )}
          </div>
        </div>
      ) : null}

      <section id="amenities" className="surface-card grid scroll-mt-24 gap-4 p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Core</p>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Title" name="title" required />
          <label className="grid gap-2 text-sm font-semibold">
            Price UGX
            <UgxAmountInput
              name="price_ugx"
              required
              className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm font-normal"
            />
          </label>
          <TextField label="Inventory count" name="inventory_count" type="number" defaultValue={1} required />
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold">
          <input className="h-4 w-4 accent-oliveMuted-600" type="checkbox" name="is_published" />
          Published
        </label>
      </section>

      <section className="surface-card grid gap-4 p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Copy</p>
        <TextAreaField label="Short description" name="description" rows={3} />
        <TextAreaField label="Overview" name="overview" rows={6} />
        <TextField label="Cover image URL" name="cover_image_url" />
      </section>

      <section className="surface-card grid gap-4 p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Lists</p>
        <div className="grid gap-4 md:grid-cols-2">
          <TextAreaField label="Details" name="details" rows={7} />
          <TextAreaField label="Amenities" name="amenities" rows={7} />
          <TextAreaField label="Dining hours" name="dining_hours" rows={5} />
        </div>
      </section>

      <section id="photos" className="surface-card grid scroll-mt-24 gap-4 p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Upload room images</p>
        <div className="grid gap-3">
          <p className="text-sm font-semibold">
            {galleryFiles.length} of {MAX_GALLERY_IMAGES} images assigned
          </p>
          <input
            ref={galleryInputRef}
            type="file"
            name="gallery_images"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={isPending || galleryFiles.length >= MAX_GALLERY_IMAGES}
            onChange={(event) => {
              setPhotoError(null);
              updateGalleryFiles(Array.from(event.currentTarget.files ?? []));
            }}
            className="text-sm"
          />
          <p className="text-xs text-oliveMuted-600">
            {galleryFiles.length >= MAX_GALLERY_IMAGES
              ? `This room already has ${MAX_GALLERY_IMAGES} images selected. Remove one below to add more.`
              : `Select up to ${MAX_GALLERY_IMAGES - galleryFiles.length} image${MAX_GALLERY_IMAGES - galleryFiles.length === 1 ? "" : "s"} at once. Large photos are resized automatically before upload.`}
          </p>
          {photoError ? <p className="text-xs font-semibold text-red-600">{photoError}</p> : null}
          {uploadProgress ? <p className="text-xs font-semibold text-oliveMuted-600">{uploadProgress}</p> : null}
          {galleryFiles.length > 0 && !uploadProgress ? (
            <p className="text-xs text-oliveMuted-500">Images will upload one at a time after you create the room.</p>
          ) : null}
        </div>
      </section>

      <section className="surface-card grid gap-4 p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Images for this room</p>
        {galleryFiles.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {galleryPreviews.map((url, index) => (
              <div key={`${galleryFiles[index]?.name ?? "image"}-${index}`} className="group relative overflow-hidden rounded-2xl border border-stoneWarm-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Selected room image ${index + 1}`}
                  className="h-32 w-full object-cover"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => removeGalleryFile(index)}
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
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || isSubmitting || uploadProgress !== null}
          className="rounded-2xl bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploadProgress ? "Uploading images..." : isPending ? "Creating room..." : "Create room type"}
        </button>
      </div>
    </form>
  );
}
