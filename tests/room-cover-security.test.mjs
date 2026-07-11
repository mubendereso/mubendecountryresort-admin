import assert from "node:assert/strict";
import test from "node:test";
import {
  RoomCoverUploadError,
  uploadAndStoreRoomCover
} from "../lib/rooms/cover-upload-core.ts";

const file = new File([new Uint8Array([1, 2, 3])], "cover.jpg", {
  type: "image/jpeg"
});

const room = {
  id: "room-id",
  title: "Garden Room",
  slug: "garden-room",
  cover_image_url: "https://cdn.example/rooms/garden-room/cover.jpg"
};

function deps(overrides = {}) {
  return {
    uploadImageFile: async () => ({
      key: "rooms/garden-room/cover/new.jpg",
      url: "https://cdn.example/rooms/garden-room/cover/new.jpg"
    }),
    deleteObject: async () => {},
    updateRoomCover: async () => room,
    ...overrides
  };
}

test("successful cover storage does not delete the committed object", async () => {
  const deleted = [];
  const result = await uploadAndStoreRoomCover(file, "rooms/garden-room/cover", deps({
    deleteObject: async (key) => deleted.push(key)
  }));

  assert.equal(result.room, room);
  assert.deepEqual(deleted, []);
});

test("database failure deletes the newly uploaded object and preserves the error", async () => {
  const deleted = [];
  const failure = new Error("database unavailable");

  await assert.rejects(
    uploadAndStoreRoomCover(file, "rooms/garden-room/cover", deps({
      updateRoomCover: async () => {
        throw failure;
      },
      deleteObject: async (key) => deleted.push(key)
    })),
    failure
  );

  assert.deepEqual(deleted, ["rooms/garden-room/cover/new.jpg"]);
});

test("missing room deletes the newly uploaded object", async () => {
  const deleted = [];

  await assert.rejects(
    uploadAndStoreRoomCover(file, "rooms/garden-room/cover", deps({
      updateRoomCover: async () => null,
      deleteObject: async (key) => deleted.push(key)
    })),
    RoomCoverUploadError
  );

  assert.deepEqual(deleted, ["rooms/garden-room/cover/new.jpg"]);
});

test("cleanup failure does not mask the original database failure", async () => {
  const cleanupErrors = [];
  const failure = new Error("database unavailable");

  await assert.rejects(
    uploadAndStoreRoomCover(file, "rooms/garden-room/cover", deps({
      updateRoomCover: async () => {
        throw failure;
      },
      deleteObject: async () => {
        throw new Error("R2 unavailable");
      },
      onCleanupFailure: (error, key) => cleanupErrors.push({ error, key })
    })),
    failure
  );

  assert.equal(cleanupErrors.length, 1);
  assert.equal(cleanupErrors[0].key, "rooms/garden-room/cover/new.jpg");
});

test("upload failure does not attempt cleanup without an object key", async () => {
  let deleteCalls = 0;

  await assert.rejects(
    uploadAndStoreRoomCover(file, "rooms/garden-room/cover", deps({
      uploadImageFile: async () => {
        throw new Error("invalid image");
      },
      deleteObject: async () => {
        deleteCalls += 1;
      }
    })),
    /invalid image/
  );

  assert.equal(deleteCalls, 0);
});
