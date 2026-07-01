export type RoomGalleryUploadResult = {
  ok: true;
  url: string;
  requestId: string;
};

type UploadErrorBody = {
  error?: string;
  requestId?: string;
  stage?: string;
};

export async function uploadRoomGalleryImage(input: {
  roomId: string;
  slug: string;
  image: File;
}): Promise<RoomGalleryUploadResult> {
  const requestId = crypto.randomUUID();
  const formData = new FormData();
  formData.set("id", input.roomId);
  formData.set("slug", input.slug);
  formData.set("image", input.image);

  let response: Response;
  try {
    response = await fetch("/api/rooms/gallery-images", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-upload-request-id": requestId },
      body: formData
    });
  } catch {
    throw new Error(`Network request failed (reference ${requestId}).`);
  }

  let body: UploadErrorBody | RoomGalleryUploadResult = {};
  try {
    body = (await response.json()) as UploadErrorBody | RoomGalleryUploadResult;
  } catch {
    // A non-JSON response usually means the request failed before our route handled it.
  }

  if (!response.ok) {
    const errorBody = body as UploadErrorBody;
    const stage = errorBody.stage ? ` during ${errorBody.stage}` : "";
    const reference = errorBody.requestId ?? requestId;
    throw new Error(
      `${errorBody.error ?? `Server returned HTTP ${response.status}`}${stage} (reference ${reference}).`
    );
  }

  if (!("ok" in body) || body.ok !== true || !("url" in body)) {
    throw new Error(`Server returned an invalid upload response (reference ${requestId}).`);
  }

  return body as RoomGalleryUploadResult;
}
