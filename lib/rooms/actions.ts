"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { textareaToList } from "@/lib/rooms/format";
import { ImageUploadError, uploadImageFile } from "@/lib/storage/image-upload";

const roomTypeSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1),
  title: z.string().trim().min(1, "Title is required."),
  description: z.string().trim().optional(),
  overview: z.string().trim().optional(),
  price_ugx: z.coerce.number().int().positive("Price must be greater than zero."),
  cover_image_url: z.string().trim().optional(),
  inventory_count: z.coerce.number().int().min(0, "Inventory cannot be negative."),
  sort_order: z.coerce.number().int(),
  is_published: z.boolean(),
  details: z.array(z.string()),
  amenities: z.array(z.string()),
  dining_hours: z.array(z.string()),
  gallery: z.array(z.string())
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
    dining_hours: textareaToList(formData.get("dining_hours")),
    gallery: textareaToList(formData.get("gallery"))
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
      gallery = ${room.gallery},
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
