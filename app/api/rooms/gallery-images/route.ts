import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminAuthorizationError,
  assertSameOriginRequest,
  requireApprovedAdminRole
} from "@/lib/auth/admin-role";
import { getSql } from "@/lib/db/client";
import { ImageUploadError, uploadImageFile } from "@/lib/storage/image-upload";
import { deleteObject } from "@/lib/storage/r2";

const MAX_GALLERY_IMAGES = 15;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const uploadSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
});

class GalleryUploadRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 413
  ) {
    super(message);
    this.name = "GalleryUploadRequestError";
  }
}

function uploadRequestId(request: NextRequest) {
  const supplied = request.headers.get("x-upload-request-id");
  return supplied && /^[a-zA-Z0-9-]{1,64}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export async function POST(request: NextRequest) {
  const requestId = uploadRequestId(request);
  let stage = "authorization";
  let fileDetails: { name: string; size: number; type: string } | null = null;
  let uploadedObjectKey: string | null = null;
  let galleryStored = false;

  try {
    assertSameOriginRequest(request);
    const session = await requireApprovedAdminRole();
    if (session.role === "staff") {
      throw new AdminAuthorizationError(
        "Only admin and superadmin users can manage room types.",
        403
      );
    }

    stage = "request parsing";
    const formData = await request.formData();
    const parsed = uploadSchema.safeParse({
      id: formData.get("id"),
      slug: formData.get("slug")
    });
    if (!parsed.success) {
      throw new GalleryUploadRequestError("Invalid room upload request.", 400);
    }

    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
      throw new GalleryUploadRequestError("Choose an image to upload.", 400);
    }
    fileDetails = { name: file.name, size: file.size, type: file.type };
    if (file.size > MAX_IMAGE_BYTES) {
      throw new GalleryUploadRequestError("Image must be 8MB or smaller.", 413);
    }

    const { id, slug } = parsed.data;
    const sql = getSql();

    stage = "room lookup";
    const rooms = (await sql`
      select id::text, title, slug, coalesce(array_length(gallery, 1), 0)::int as gallery_count
      from room_types
      where id = ${id} and slug = ${slug}
    `) as { id: string; title: string; slug: string; gallery_count: number }[];
    const room = rooms[0];
    if (!room) {
      throw new GalleryUploadRequestError("Room was not found.", 404);
    }
    if (room.gallery_count >= MAX_GALLERY_IMAGES) {
      throw new GalleryUploadRequestError(
        `Gallery is full (max ${MAX_GALLERY_IMAGES} images). Remove one first.`,
        409
      );
    }

    stage = "R2 upload";
    const { key, url } = await uploadImageFile(file, `rooms/${slug}/gallery`);
    uploadedObjectKey = key;

    stage = "database update";
    const auditContext = JSON.stringify({
      roomTypeId: room.id,
      slug: room.slug,
      imageUrl: url,
      uploadRequestId: requestId
    });
    const stored = (await sql`
      with updated as (
        update room_types
        set gallery = array_append(gallery, ${url})
        where id = ${id}
          and coalesce(array_length(gallery, 1), 0) < ${MAX_GALLERY_IMAGES}
        returning id, title, slug
      ),
      audited as (
        insert into audit_log
          (actor_id, actor_email, action, entity_type, entity_id, summary, context)
        select
          ${session.userId}::uuid,
          ${session.email},
          'room_type.gallery_image_added',
          'room_type',
          id,
          'Added gallery image to ' || title || '.',
          ${auditContext}
        from updated
      )
      select id::text from updated
    `) as { id: string }[];
    if (!stored[0]) {
      throw new GalleryUploadRequestError(
        `Gallery is full (max ${MAX_GALLERY_IMAGES} images). Remove one first.`,
        409
      );
    }
    galleryStored = true;

    stage = "cache revalidation";
    try {
      revalidatePath("/rooms");
      revalidatePath(`/rooms/${slug}`);
    } catch (error) {
      console.error(
        "Room gallery upload cache revalidation failed.",
        { requestId, stage, file: fileDetails },
        error
      );
    }
    return NextResponse.json({ ok: true, url, requestId });
  } catch (error) {
    const context = { requestId, stage, file: fileDetails };
    if (uploadedObjectKey && !galleryStored) {
      try {
        await deleteObject(uploadedObjectKey);
      } catch (cleanupError) {
        console.error("Room gallery upload cleanup failed.", context, cleanupError);
      }
    }

    if (error instanceof AdminAuthorizationError) {
      console.warn("Room gallery upload rejected.", context, error.message);
      return NextResponse.json(
        { error: error.message, requestId, stage },
        { status: error.status }
      );
    }
    if (error instanceof GalleryUploadRequestError) {
      console.warn("Room gallery upload rejected.", context, error.message);
      return NextResponse.json(
        { error: error.message, requestId, stage },
        { status: error.status }
      );
    }
    if (error instanceof ImageUploadError) {
      console.warn("Room gallery image validation failed.", context, error.message);
      return NextResponse.json(
        { error: error.message, requestId, stage },
        { status: 400 }
      );
    }

    console.error("Room gallery upload failed.", context, error);
    return NextResponse.json(
      { error: "Image upload failed on the server.", requestId, stage },
      { status: 500 }
    );
  }
}
