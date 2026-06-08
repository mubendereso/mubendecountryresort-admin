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
  slug: z.string().trim().min(1).max(MAX_SLUG_LENGTH).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must use lowercase letters, numbers, and hyphens."
  ),
  title: z.string().trim().min(1, "Title is required.").max(MAX_TITLE_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  overview: z.string().trim().max(MAX_OVERVIEW_LENGTH).optional(),
  price_ugx: z.coerce.number().int().positive("Price must be greater than zero."),
  cover_image_url: z.string().trim().max(MAX_URL_LENGTH).optional(),
  inventory_count: z.coerce.number().int().min(0, "Inventory cannot be negative."),
  is_published: z.boolean(),
  details: listSchema,
  amenities: listSchema,
  dining_hours: listSchema
  // gallery is managed separately via the gallery upload/remove actions so the
  // core form save does not overwrite uploaded images.
});

const createRoomTypeSchema = roomTypeSchema.omit({
  id: true,
  slug: true
});

function optionalText(value: string | undefined) {
  return value ? value : null;
}

function roomSlugFromTitle(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);

  return slug || "room";
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
    WITH updated AS (
      UPDATE room_types
      SET
        title = ${room.title},
        description = ${optionalText(room.description)},
        overview = ${optionalText(room.overview)},
        price_ugx = ${room.price_ugx},
        cover_image_url = ${optionalText(room.cover_image_url)},
        details = ${room.details},
        amenities = ${room.amenities},
        dining_hours = ${room.dining_hours},
        inventory_count = ${room.inventory_count},
        is_published = ${room.is_published}
      WHERE id = ${room.id}
      RETURNING id, title, inventory_count
    ),
    unit_counts AS (
      SELECT
        updated.id,
        updated.title,
        updated.inventory_count,
        count(ru.id)::int AS unit_count
      FROM updated
      LEFT JOIN room_units ru ON ru.room_type_id = updated.id
      GROUP BY updated.id, updated.title, updated.inventory_count
    )
    INSERT INTO room_units (room_type_id, unit_name, housekeeping_status)
    SELECT
      unit_counts.id,
      CASE
        WHEN unit_counts.inventory_count = 1 THEN unit_counts.title
        ELSE unit_counts.title || ' ' || generated.unit_number::text
      END,
      'clean'
    FROM unit_counts
    CROSS JOIN LATERAL generate_series(
      unit_counts.unit_count + 1,
      unit_counts.inventory_count
    ) AS generated(unit_number)
    ON CONFLICT (room_type_id, unit_name) DO NOTHING
  `;

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${room.slug}`);
  revalidatePath("/availability");
  redirect(`/rooms/${room.slug}?message=${encodeURIComponent("Room type updated.")}`);
}

export async function createRoomTypeAction(formData: FormData) {
  await requireContentManager();

  const parsed = createRoomTypeSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    overview: formData.get("overview"),
    price_ugx: formData.get("price_ugx"),
    cover_image_url: formData.get("cover_image_url"),
    inventory_count: formData.get("inventory_count"),
    is_published: formData.get("is_published") === "on",
    details: textareaToList(formData.get("details")),
    amenities: textareaToList(formData.get("amenities")),
    dining_hours: textareaToList(formData.get("dining_hours"))
  });

  if (!parsed.success) {
    const message = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid room data.");
    redirect(`/rooms/new?message=${message}`);
  }

  const room = parsed.data;
  const baseSlug = roomSlugFromTitle(room.title);
  const sql = getSql();

  const createdRows = (await sql`
    WITH locked AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(hashtext(${baseSlug}))
    ),
    candidate AS (
      SELECT
        CASE
          WHEN suffix = 0 THEN ${baseSlug}
          ELSE left(${baseSlug}, ${MAX_SLUG_LENGTH - 5}) || '-' || suffix::text
        END AS slug
      FROM generate_series(0, 9999) AS suffix
      CROSS JOIN locked
      WHERE NOT EXISTS (
        SELECT 1
        FROM room_types rt
        WHERE rt.slug = CASE
          WHEN suffix = 0 THEN ${baseSlug}
          ELSE left(${baseSlug}, ${MAX_SLUG_LENGTH - 5}) || '-' || suffix::text
        END
      )
      ORDER BY suffix
      LIMIT 1
    ),
    created AS (
      INSERT INTO room_types (
        slug,
        title,
        description,
        overview,
        price_ugx,
        cover_image_url,
        details,
        amenities,
        dining_hours,
        inventory_count,
        is_published,
        sort_order
      )
      SELECT
        candidate.slug,
        ${room.title},
        ${optionalText(room.description)},
        ${optionalText(room.overview)},
        ${room.price_ugx},
        ${optionalText(room.cover_image_url)},
        ${room.details},
        ${room.amenities},
        ${room.dining_hours},
        ${room.inventory_count},
        ${room.is_published},
        COALESCE((SELECT max(sort_order) + 10 FROM room_types), 0)
      FROM candidate
      RETURNING id, slug, title, inventory_count
    ),
    units AS (
      INSERT INTO room_units (room_type_id, unit_name, housekeeping_status)
      SELECT
        created.id,
        CASE
          WHEN created.inventory_count = 1 THEN created.title
          ELSE created.title || ' ' || generated.unit_number::text
        END,
        'clean'
      FROM created
      CROSS JOIN LATERAL generate_series(1, created.inventory_count) AS generated(unit_number)
    )
    SELECT slug
    FROM created
  `) as { slug: string }[];

  const created = createdRows[0];
  if (!created) {
    redirect(`/rooms/new?message=${encodeURIComponent("Could not generate a unique room URL.")}`);
  }

  revalidatePath("/rooms");
  revalidatePath("/availability");
  redirect(`/rooms/${created.slug}?message=${encodeURIComponent("Room type created. Add its photos below.")}`);
}

const roomLifecycleSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1).max(MAX_SLUG_LENGTH)
});

export async function setRoomPublicationAction(formData: FormData) {
  await requireContentManager();

  const parsed = roomLifecycleSchema.safeParse({
    id: formData.get("id"),
    slug: formData.get("slug")
  });
  if (!parsed.success) throw new Error("Invalid room type.");

  const published = formData.get("published") === "true";
  const sql = getSql();
  await sql`
    UPDATE room_types
    SET
      is_published = ${published},
      archived_at = CASE WHEN ${published} THEN NULL ELSE archived_at END
    WHERE id = ${parsed.data.id}
  `;

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${parsed.data.slug}`);
  revalidatePath("/availability");
}

export async function setRoomArchivedAction(formData: FormData) {
  await requireContentManager();

  const parsed = roomLifecycleSchema.safeParse({
    id: formData.get("id"),
    slug: formData.get("slug")
  });
  if (!parsed.success) throw new Error("Invalid room type.");

  const archived = formData.get("archived") === "true";
  const sql = getSql();
  await sql`
    UPDATE room_types
    SET
      archived_at = CASE WHEN ${archived} THEN now() ELSE NULL END,
      is_published = CASE WHEN ${archived} THEN false ELSE is_published END
    WHERE id = ${parsed.data.id}
  `;

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${parsed.data.slug}`);
  revalidatePath("/availability");
}

export async function duplicateRoomTypeAction(formData: FormData) {
  await requireContentManager();

  const parsed = roomLifecycleSchema.safeParse({
    id: formData.get("id"),
    slug: formData.get("slug")
  });
  if (!parsed.success) throw new Error("Invalid room type.");

  const sql = getSql();
  const suffix = Date.now().toString(36);
  const duplicateSlug = `${parsed.data.slug}-copy-${suffix}`.slice(0, MAX_SLUG_LENGTH);
  const rows = (await sql`
    WITH duplicated AS (
      INSERT INTO room_types (
        slug,
        title,
        description,
        overview,
        price_ugx,
        cover_image_url,
        details,
        amenities,
        dining_hours,
        gallery,
        inventory_count,
        is_published,
        sort_order
      )
      SELECT
        ${duplicateSlug},
        title || ' Copy',
        description,
        overview,
        price_ugx,
        cover_image_url,
        details,
        amenities,
        dining_hours,
        gallery,
        inventory_count,
        false,
        COALESCE((SELECT max(sort_order) + 10 FROM room_types), 0)
      FROM room_types
      WHERE id = ${parsed.data.id}
      RETURNING id, slug, title, inventory_count
    ),
    units AS (
      INSERT INTO room_units (room_type_id, unit_name, housekeeping_status)
      SELECT
        duplicated.id,
        CASE
          WHEN duplicated.inventory_count = 1 THEN duplicated.title
          ELSE duplicated.title || ' ' || generated.unit_number::text
        END,
        'clean'
      FROM duplicated
      CROSS JOIN LATERAL generate_series(1, duplicated.inventory_count) AS generated(unit_number)
    )
    SELECT slug
    FROM duplicated
  `) as { slug: string }[];

  const duplicate = rows[0];
  if (!duplicate) throw new Error("Room type not found.");

  revalidatePath("/rooms");
  redirect(`/rooms/${duplicate.slug}?message=${encodeURIComponent("Room type duplicated as a draft.")}`);
}

export async function bulkUpdateRoomRatesAction(formData: FormData) {
  await requireContentManager();

  const updates: { id: string; price_ugx: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("rate_")) continue;
    const parsed = z.object({
      id: z.string().uuid(),
      price_ugx: z.coerce.number().int().positive()
    }).safeParse({
      id: key.slice(5),
      price_ugx: value
    });
    if (!parsed.success) {
      redirect(`/rooms/bulk-rates?message=${encodeURIComponent("Every rate must be a positive whole number.")}`);
    }
    updates.push(parsed.data);
  }

  if (updates.length === 0) {
    redirect(`/rooms/bulk-rates?message=${encodeURIComponent("No room rates were submitted.")}`);
  }

  const sql = getSql();
  await sql`
    UPDATE room_types rt
    SET price_ugx = rates.price_ugx
    FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
      AS rates(id uuid, price_ugx bigint)
    WHERE rt.id = rates.id
  `;

  revalidatePath("/rooms");
  revalidatePath("/availability");
  redirect(`/rooms?message=${encodeURIComponent("Room rates updated.")}`);
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const importedRoomSchema = z.object({
  slug: z.string().trim().min(1).max(MAX_SLUG_LENGTH).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slugs must use lowercase letters, numbers, and hyphens."),
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  price_ugx: z.coerce.number().int().positive(),
  inventory_count: z.coerce.number().int().min(0),
  is_published: z.enum(["true", "false", "yes", "no", "1", "0"]).transform((value) =>
    ["true", "yes", "1"].includes(value)
  ),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional()
});

export async function importRoomTypesAction(formData: FormData) {
  await requireContentManager();

  const input = String(formData.get("csv") ?? "").trim();
  const rows = parseCsvRows(input);
  if (rows.length === 0) {
    redirect(`/rooms/import?message=${encodeURIComponent("Paste at least one room row.")}`);
  }

  const firstRow = rows[0]?.map((value) => value.toLowerCase());
  const dataRows = firstRow?.[0] === "slug" ? rows.slice(1) : rows;
  const parsedRooms: {
    slug: string;
    title: string;
    price_ugx: number;
    inventory_count: number;
    is_published: boolean;
    description: string | null;
  }[] = [];

  for (const [index, row] of dataRows.entries()) {
    const parsed = importedRoomSchema.safeParse({
      slug: row[0],
      title: row[1],
      price_ugx: row[2],
      inventory_count: row[3],
      is_published: row[4]?.toLowerCase() || "false",
      description: row[5]
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? "Invalid values.";
      redirect(`/rooms/import?message=${encodeURIComponent(`Row ${index + 1}: ${issue}`)}`);
    }
    parsedRooms.push({
      ...parsed.data,
      description: parsed.data.description || null
    });
  }

  if (parsedRooms.length > 100) {
    redirect(`/rooms/import?message=${encodeURIComponent("Import a maximum of 100 room types at once.")}`);
  }

  const sql = getSql();
  const inserted = (await sql`
    WITH imported AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(parsedRooms)}::jsonb)
        AS rows(
          slug text,
          title text,
          price_ugx bigint,
          inventory_count int,
          is_published boolean,
          description text
        )
    ),
    inserted AS (
      INSERT INTO room_types (
        slug,
        title,
        price_ugx,
        inventory_count,
        is_published,
        description,
        sort_order
      )
      SELECT
        slug,
        title,
        price_ugx,
        inventory_count,
        is_published,
        description,
        COALESCE((SELECT max(sort_order) FROM room_types), -10)
          + row_number() OVER (ORDER BY slug) * 10
      FROM imported
      ON CONFLICT (slug) DO NOTHING
      RETURNING id, title, inventory_count
    ),
    units AS (
      INSERT INTO room_units (room_type_id, unit_name, housekeeping_status)
      SELECT
        inserted.id,
        CASE
          WHEN inserted.inventory_count = 1 THEN inserted.title
          ELSE inserted.title || ' ' || generated.unit_number::text
        END,
        'clean'
      FROM inserted
      CROSS JOIN LATERAL generate_series(1, inserted.inventory_count) AS generated(unit_number)
    )
    SELECT id
    FROM inserted
  `) as { id: string }[];

  revalidatePath("/rooms");
  revalidatePath("/availability");
  redirect(`/rooms?message=${encodeURIComponent(`${inserted.length} room type${inserted.length === 1 ? "" : "s"} imported. Existing slugs were skipped.`)}`);
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
