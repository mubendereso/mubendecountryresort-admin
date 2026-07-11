import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_OFFLINE_ROOM_UNITS,
  roomUnitSnapshotExceedsLimit
} from "../lib/offline-snapshots/policy.ts";

test("room-unit snapshot limit allows the configured capacity", () => {
  assert.equal(roomUnitSnapshotExceedsLimit(MAX_OFFLINE_ROOM_UNITS), false);
});

test("room-unit snapshot limit rejects one row beyond capacity", () => {
  assert.equal(roomUnitSnapshotExceedsLimit(MAX_OFFLINE_ROOM_UNITS + 1), true);
});
