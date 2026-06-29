import assert from "node:assert/strict";
import test from "node:test";
import {
  isOfflineAccessAuthorized,
  LOCAL_ADMIN_DATA_TABLES,
  OFFLINE_ACCESS_LOCKED_VALUE,
  shouldReplaceOfflineSession
} from "../lib/local-db/security-policy.ts";

const identity = { user_id: "user-a", session_epoch: "session-a" };

test("legacy or incomplete local identity is cleared before use", () => {
  assert.equal(shouldReplaceOfflineSession(null, null, identity), true);
  assert.equal(shouldReplaceOfflineSession("user-a", null, identity), true);
  assert.equal(shouldReplaceOfflineSession(null, "session-a", identity), true);
});

test("only the exact authenticated local session can reuse cached data", () => {
  assert.equal(shouldReplaceOfflineSession("user-a", "session-a", identity), false);
  assert.equal(shouldReplaceOfflineSession("user-b", "session-a", identity), true);
  assert.equal(shouldReplaceOfflineSession("user-a", "session-b", identity), true);

  assert.equal(isOfflineAccessAuthorized("session-a", "user-a", "session-a"), true);
  assert.equal(isOfflineAccessAuthorized(null, "user-a", "session-a"), false);
  assert.equal(
    isOfflineAccessAuthorized(OFFLINE_ACCESS_LOCKED_VALUE, "user-a", "session-a"),
    false
  );
  assert.equal(isOfflineAccessAuthorized("session-b", "user-a", "session-a"), false);
});

test("logout wipe covers every current local data table but preserves schema", () => {
  assert.deepEqual(new Set(LOCAL_ADMIN_DATA_TABLES), new Set([
    "_outbox",
    "contact_submissions",
    "room_units",
    "offline_snapshot_meta",
    "bookings_snapshot",
    "room_types_snapshot",
    "folios_snapshot",
    "payment_receipts_snapshot",
    "reservation_groups_snapshot",
    "room_units_snapshot",
    "maintenance_activity",
    "maintenance_photos",
    "maintenance_work_orders",
    "maintenance_staff",
    "maintenance_rooms"
  ]));
  assert.equal(LOCAL_ADMIN_DATA_TABLES.includes("_migrations"), false);
});
