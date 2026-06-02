"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { textareaToList } from "@/lib/rooms/format";
import { ImageUploadError, uploadImageFile } from "@/lib/storage/image-upload";
import { deleteObject, keyFromPublicUrl } from "@/lib/storage/r2";

// Maximum number of gallery images per room.
const MAX_GALLERY_IMAGES = 15;
const MAX_SLUG_LENGTH = 120;
const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_OVERVIEW_LENGTH = 3000;
const MAX_URL_LENGTH = 2048;
const MAX_LIST_ITEMS = 50;
const MAX_LIST_ITEM_LENGTH = 300;

const listSchema = z
  .array(z.string().trim().min(1).max(MAX_LIST_ITEM_LENGTH))
  .max(MAX_LIST_ITEMS);

const roomTypeSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1).max(MAX_SLUG_LENGTH),
  title: z.string().trim().min(1, "Title is required.").max(MAX_TITLE_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  overview: z.string().trim().max(MAX_OVERVIEW_LENGTH).optional(),
  price_ugx: z.coerce.number().int().positive("Price must be greater than zero."),
  cover_image_url: z.string().trim().max(MAX_URL_LENGTH).optional(),
  inventory_count: z.coerce.number().int().min(0, "Inventory cannot be negative."),
  sort_order: z.coerce.number().int(),
  is_published: z.boolean(),
  details: listSchema,
  amenities: listSchema,
  dining_hours: listSchema
  // gallery is managed separately via the gallery upload/remove actions so the
  // core form save does not overwrite uploaded images.
});

function optionalText(value: string | undefined) {
  return value ? value : null;
}

async function requireContentManager() {
  const session = await requireApprovedAdminRole();

  if (session.role === "staff") {
    throw new Error("Only admin and superadmin users can manage room types.");
  }
}

export async function updateRoomTypeAction(formData: FormData) {
  await requireContentManager();

  const parsed = roomTypeSchema.safeParse({
    id: formData.get("id"),
    slug: formData.get("slug"),
    title: formData.get("title"),
    description: formData.get("description"),
    overview: formData.get("overview"),
    price_ugx: formData.get("price_ugx"),
    cover_image_url: formData.get("cover_image_url"),
    inventory_count: formData.get("inventory_count"),
    sort_order: formData.get("sort_order"),
    is_published: formData.get("is_published") === "on",
    details: textareaToList(formData.get("details")),
    amenities: textareaToList(formData.get("amenities")),
    dining_hours: textareaToList(formData.get("dining_hours"))
  });

  if (!parsed.success) {
    const message = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid room data.");
    redirect(`/rooms/${String(formData.get("slug") ?? "")}?message=${message}`);
  }

  const room = parsed.data;
  const sql = getSql();

  await sql`
    update room_types
    set
      title = ${room.title},
      description = ${optionalText(room.description)},
      overview = ${optionalText(room.overview)},
      price_ugx = ${room.price_ugx},
      cover_image_url = ${optionalText(room.cover_image_url)},
      details = ${room.details},
      amenities = ${room.amenities},
      dining_hours = ${room.dining_hours},
      inventory_count = ${room.inventory_count},
      is_published = ${room.is_published},
      sort_order = ${room.sort_order}
    where id = ${room.id}
  `;

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${room.slug}`);
  revalidatePath("/availability");
  redirect(`/rooms/${room.slug}?message=${encodeURIComponent("Room type updated.")}`);
}

const uploadCoverSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1)
});

export async function uploadRoomCoverAction(formData: FormData) {
  await requireContentManager();

  const parsed = uploadCoverSchema.safeParse({
    id: formData.get("id"),
    slug: formData.get("slug")
  });

  if (!parsed.success) {
    redirect(`/rooms?message=${encodeURIComponent("Invalid upload request.")}`);
  }

  const { id, slug } = parsed.data;
  const file = formData.get("image");

  if (!(file instanceof File) || file.size === 0) {
    redirect(`/rooms/${slug}?message=${encodeURIComponent("Choose an image to upload.")}`);
  }

  let url: string;
  try {
    ({ url } = await uploadImageFile(file as File, `rooms/${slug}/cover`));
  } catch (error) {
    const message =
      error instanceof ImageUploadError ? error.message : "Image upload failed.";
    redirect(`/rooms/${slug}?message=${encodeURIComponent(message)}`);
  }

  const sql = getSql();
  await sql`update room_types set cover_image_url = ${url} where id = ${id}`;

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${slug}`);
  redirect(`/rooms/${slug}?message=${encodeURIComponent("Cover image updated.")}`);
}

// Appends a single uploaded image to a room's gallery. Called once per file by
// the client (sequentially) so large multi-image selections don't exceed the
// server action body limit. Throws on error; the client surfaces the message.
export async function uploadRoomGalleryImageAction(formData: FormData): Promise<void> {
  await requireContentManager();

  const id = formData.get("id");
  const slug = formData.get("slug");
  if (typeof id !== "string" || typeof slug !== "string" || !id || !slug) {
    throw new Error("Invalid upload request.");
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose an image to upload.");
  }

  const sql = getSql();
  const rows = (await sql`
    select coalesce(array_length(gallery, 1), 0)::int as count from room_types where id = ${id}
  `) as { count: number }[];
  const current = rows[0]?.count ?? 0;
  if (current >= MAX_GALLERY_IMAGES) {
    throw new Error(`Gallery is full (max ${MAX_GALLERY_IMAGES} images). Remove one first.`);
  }

  let url: string;
  try {
    ({ url } = await uploadImageFile(file, `rooms/${slug}/gallery`));
  } catch (error) {
    throw error instanceof ImageUploadError ? error : new Error("Image upload failed.");
  }

  await sql`update room_types set gallery = array_append(gallery, ${url}) where id = ${id}`;

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${slug}`);
}

// Removes one image URL from a room's gallery and best-effort deletes the
// underlying R2 object. Throws on error; the client surfaces the message.
export async function removeRoomGalleryImageAction(formData: FormData): Promise<void> {
  await requireContentManager();

  const id = formData.get("id");
  const slug = formData.get("slug");
  const url = formData.get("url");
  if (
    typeof id !== "string" || typeof slug !== "string" || typeof url !== "string" ||
    !id || !slug || !url
  ) {
    throw new Error("Invalid remove request.");
  }

  const sql = getSql();
  await sql`update room_types set gallery = array_remove(gallery, ${url}) where id = ${id}`;

  // Best-effort: delete the file from R2 if it belongs to our bucket.
  try {
    const key = keyFromPublicUrl(url);
    if (key) await deleteObject(key);
  } catch {
    // Ignore — the DB reference is already gone, which is what matters.
  }

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${slug}`);
}
