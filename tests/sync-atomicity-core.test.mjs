import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, decideLedgerReplay, hashQueuedMutation } from "../lib/sync/atomicity.ts";
import {
  applyPushResults,
  claimOutboxRows,
  planPushBatch,
  requeueClaimedRows
} from "../lib/sync/outbox-core.ts";
import { buildMaintenancePhotoStorageKey, createMaintenancePhotoRecord } from "../lib/maintenance/photo-core.ts";

test("queued mutations hash canonically and detect replay drift", async () => {
  const a = await hashQueuedMutation({
    type: "maintenance.note",
    payload: { workOrderId: "123", note: "Hello", meta: { b: 2, a: 1 } }
  });
  const b = await hashQueuedMutation({
    type: "maintenance.note",
    payload: { meta: { a: 1, b: 2 }, note: "Hello", workOrderId: "123" }
  });
  const c = await hashQueuedMutation({
    type: "maintenance.note",
    payload: { workOrderId: "123", note: "Different" }
  });

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(
    canonicalJson({ type: "x", payload: { z: 1, a: 2 } }),
    canonicalJson({ payload: { a: 2, z: 1 }, type: "x" })
  );
  assert.equal(decideLedgerReplay(null, a), "apply");
  assert.equal(decideLedgerReplay(a, a), "replay");
  assert.equal(decideLedgerReplay("sha256:deadbeef", a), "conflict");
});

test("maintenance photo cleanup deletes the uploaded object when the DB write fails", async () => {
  const uploaded = [];
  const deleted = [];
  const sql = async () => {
    throw new Error("synthetic DB failure");
  };

  await assert.rejects(
    createMaintenancePhotoRecord(
      {
        photoId: "11111111-1111-4111-8111-111111111111",
        workOrderId: "22222222-2222-4222-8222-222222222222",
        filename: "photo.jpg",
        mimeType: "image/jpeg",
        base64: Buffer.from("fake image payload").toString("base64")
      },
      { userId: "33333333-3333-4333-8333-333333333333", email: "staff@example.com", role: "staff" },
      sql,
      {
        uploadImageFile: async (_file, _prefix, options) => {
          uploaded.push(options?.key);
          return {
            key: options?.key ?? "missing",
            url: `https://cdn.example/${options?.key ?? "missing"}`
          };
        },
        deleteObject: async (key) => {
          deleted.push(key);
        }
      }
    ),
    /synthetic DB failure/
  );

  assert.equal(uploaded.length, 1);
  assert.equal(
    uploaded[0],
    buildMaintenancePhotoStorageKey({
      workOrderId: "22222222-2222-4222-8222-222222222222",
      photoId: "11111111-1111-4111-8111-111111111111",
      mimeType: "image/jpeg"
    })
  );
  assert.deepEqual(deleted, uploaded);
});

test("outbox claim/reclaim keeps a single claim owner and reclaims stale rows", async () => {
  const state = [
    {
      idempotency_key: "00000000-0000-4000-8000-000000000001",
      mutation_type: "maintenance.note",
      payload: JSON.stringify({ workOrderId: "wo-1", note: "one" }),
      status: "pending",
      attempts: 0,
      last_error: null,
      created_at: "2026-06-30T00:00:00.000Z",
      claim_token: null,
      claimed_at: null
    },
    {
      idempotency_key: "00000000-0000-4000-8000-000000000002",
      mutation_type: "maintenance.note",
      payload: JSON.stringify({ workOrderId: "wo-2", note: "two" }),
      status: "pending",
      attempts: 0,
      last_error: null,
      created_at: "2026-06-30T00:00:01.000Z",
      claim_token: null,
      claimed_at: null
    }
  ];

  const fakeDb = {
    async query(sql, params = []) {
      if (sql.startsWith("UPDATE _outbox") && sql.includes("SET status = 'syncing'")) {
        const [claimToken, claimTime, reclaimBefore, limit] = params;
        const eligible = state
          .filter((row) => {
            if (row.status === "pending" || row.status === "failed") return true;
            if (row.status === "syncing" && row.claimed_at && row.claimed_at < reclaimBefore) return true;
            return false;
          })
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .slice(0, limit);
        for (const row of eligible) {
          row.status = "syncing";
          row.claim_token = claimToken;
          row.claimed_at = claimTime;
        }
        return eligible.map((row) => ({ ...row }));
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async exec(sql, params = []) {
      if (sql.startsWith("DELETE FROM _outbox")) {
        const [idempotencyKey, claimToken] = params;
        const index = state.findIndex(
          (row) => row.idempotency_key === idempotencyKey && row.claim_token === claimToken
        );
        if (index >= 0) state.splice(index, 1);
        return { rows: [], changes: index >= 0 ? 1 : 0 };
      }
      if (sql.includes("SET status = 'pending'")) {
        const [claimToken, ...keys] = params;
        for (const row of state) {
          if (row.claim_token === claimToken && keys.includes(row.idempotency_key)) {
            row.status = "pending";
            row.claim_token = null;
            row.claimed_at = null;
          }
        }
        return { rows: [], changes: 1 };
      }
      if (sql.includes("SET status = 'failed'")) {
        const [error, idempotencyKey, claimToken] = params;
        const row = state.find(
          (entry) => entry.idempotency_key === idempotencyKey && entry.claim_token === claimToken
        );
        if (row) {
          row.status = "failed";
          row.attempts += 1;
          row.last_error = error;
          row.claim_token = null;
          row.claimed_at = null;
        }
        return { rows: [], changes: row ? 1 : 0 };
      }
      throw new Error(`Unexpected exec: ${sql}`);
    }
  };

  const firstClaim = await claimOutboxRows(fakeDb, "claim-a", "2026-06-30T00:00:10.000Z", "2026-06-30T00:00:05.000Z");
  assert.equal(firstClaim.length, 2);
  assert.equal(state.every((row) => row.status === "syncing"), true);
  assert.equal(state.every((row) => row.claim_token === "claim-a"), true);

  const plan = planPushBatch(firstClaim);
  assert.equal(plan.mutations.length, 2);
  assert.deepEqual(plan.requeueIds, []);

  await requeueClaimedRows(fakeDb, "claim-a", plan.requeueIds);
  const applied = await applyPushResults(fakeDb, "claim-a", [
    { idempotencyKey: "00000000-0000-4000-8000-000000000001", ok: true },
    { idempotencyKey: "00000000-0000-4000-8000-000000000002", ok: false, retryable: true, error: "temporary" }
  ]);
  assert.equal(applied.pushed, 1);
  assert.equal(applied.failed, 1);
  assert.equal(state.length, 1);
  assert.equal(state[0].idempotency_key, "00000000-0000-4000-8000-000000000002");
  assert.equal(state[0].status, "failed");
  assert.equal(state[0].claim_token, null);

  const staleRow = {
    idempotency_key: "00000000-0000-4000-8000-000000000003",
    mutation_type: "maintenance.note",
    payload: JSON.stringify({ workOrderId: "wo-3", note: "stale" }),
    status: "syncing",
    attempts: 0,
    last_error: null,
    created_at: "2026-06-30T00:00:02.000Z",
    claim_token: "stale-token",
    claimed_at: "2026-06-30T00:00:00.000Z"
  };
  state.push(staleRow);
  const reclaimed = await claimOutboxRows(fakeDb, "claim-b", "2026-06-30T00:00:20.000Z", "2026-06-30T00:00:05.000Z");
  assert.equal(reclaimed.length, 2);
  assert.equal(reclaimed.some((row) => row.idempotency_key === "00000000-0000-4000-8000-000000000003"), true);
  assert.equal(state.every((row) => row.claim_token === "claim-b"), true);
});


