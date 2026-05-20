"use client";

// Browser sync engine. Two flows:
//
//   PUSH — drain the local _outbox to /api/sync/push. Successes and permanent
//          failures are removed; transient failures stay for retry.
//   PULL — fetch sync_changes since our cursor from /api/sync/pull and apply
//          them to the mirrored local tables, advancing the cursor.
//
// Mutations are enqueued via enqueueMutation() by UI code; they apply
// optimistically to the local DB first (so the UI updates instantly) and the
// outbox row carries the same change to the server on the next drain.

import { getLocalDb, type ExecResult } from "@/lib/local-db/client";
import { SYNCED_TABLES } from "@/lib/local-db/migrations";
import type {
  PullResponse,
  PushRequest,
  PushResponse,
  QueuedMutation,
  SyncChange
} from "./protocol";

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

function newKey(): string {
  return crypto.randomUUID();
}

/**
 * Queue a mutation for the server. Returns the idempotency key. Callers
 * should also apply the change to the local DB optimistically so the UI
 * reflects it immediately; the server is the eventual source of truth and a
 * later pull will reconcile.
 */
export async function enqueueMutation(
  type: string,
  payload: Record<string, unknown>
): Promise<string> {
  const db = getLocalDb();
  const key = newKey();
  await db.exec(
    "INSERT INTO _outbox (idempotency_key, mutation_type, payload) VALUES (?, ?, ?)",
    [key, type, JSON.stringify(payload)]
  );
  return key;
}

function normalizeValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

async function applyChange(change: SyncChange): Promise<void> {
  if (!SYNCED_TABLES.has(change.table)) return; // ignore unknown tables
  const db = getLocalDb();

  if (change.op === "delete") {
    await db.exec(`DELETE FROM ${change.table} WHERE id = ?`, [change.rowId]);
    return;
  }

  const row = change.row;
  if (!row) return;

  const cols = Object.keys(row);
  if (cols.length === 0) return;

  const placeholders = cols.map(() => "?").join(", ");
  const updates = cols
    .filter((c) => c !== "id")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");
  const values = cols.map((c) => normalizeValue(row[c]));

  const conflictClause = updates
    ? `ON CONFLICT(id) DO UPDATE SET ${updates}`
    : "ON CONFLICT(id) DO NOTHING";

  await db.exec(
    `INSERT INTO ${change.table} (${cols.join(", ")}) VALUES (${placeholders}) ${conflictClause}`,
    values
  );
}

async function getCursor(): Promise<number> {
  const db = getLocalDb();
  const rows = await db.query<{ value: string }>(
    "SELECT value FROM _meta WHERE key = 'sync_cursor'"
  );
  return Number(rows[0]?.value ?? 0);
}

async function setCursor(cursor: number): Promise<void> {
  const db = getLocalDb();
  await db.exec(
    `UPDATE _meta SET value = ?, updated_at = ${NOW_SQL} WHERE key = 'sync_cursor'`,
    [String(cursor)]
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status}`);
  }
  return (await res.json()) as T;
}

/** Drain pending outbox rows to the server. */
export async function pushOutbox(): Promise<{ pushed: number; failed: number }> {
  const db = getLocalDb();
  const pending = await db.query<{
    idempotency_key: string;
    mutation_type: string;
    payload: string;
  }>(
    `SELECT idempotency_key, mutation_type, payload
     FROM _outbox
     WHERE status != 'syncing'
     ORDER BY created_at
     LIMIT 100`
  );
  if (pending.length === 0) return { pushed: 0, failed: 0 };

  const mutations: QueuedMutation[] = pending.map((r) => ({
    idempotencyKey: r.idempotency_key,
    type: r.mutation_type,
    payload: JSON.parse(r.payload) as Record<string, unknown>
  }));

  const data = await postJson<PushResponse>("/api/sync/push", {
    mutations
  } satisfies PushRequest);

  let pushed = 0;
  let failed = 0;
  for (const result of data.results) {
    if (result.ok) {
      await db.exec("DELETE FROM _outbox WHERE idempotency_key = ?", [result.idempotencyKey]);
      pushed += 1;
    } else if (!result.retryable) {
      // Permanent failure (validation / permission). Drop it so it stops
      // blocking the queue; surface via last_error before deletion would be
      // nicer, but for now the engine just discards.
      await db.exec("DELETE FROM _outbox WHERE idempotency_key = ?", [result.idempotencyKey]);
      failed += 1;
    } else {
      await db.exec(
        `UPDATE _outbox
         SET attempts = attempts + 1, last_error = ?, last_attempt_at = ${NOW_SQL}
         WHERE idempotency_key = ?`,
        [result.error, result.idempotencyKey]
      );
      failed += 1;
    }
  }

  return { pushed, failed };
}

/** Pull server changes since the cursor and apply them locally. */
export async function pullChanges(): Promise<{ applied: number }> {
  let applied = 0;
  let hasMore = true;

  while (hasMore) {
    const cursor = await getCursor();
    const data = await postJson<PullResponse>("/api/sync/pull", { cursor });

    for (const change of data.changes) {
      await applyChange(change);
      applied += 1;
    }

    await setCursor(data.cursor);
    hasMore = data.hasMore;
  }

  return { applied };
}

/** Full sync cycle: push local mutations first, then pull server changes. */
export async function sync(): Promise<{
  pushed: number;
  failed: number;
  applied: number;
}> {
  const pushResult = await pushOutbox();
  const pullResult = await pullChanges();
  return { ...pushResult, applied: pullResult.applied };
}

export type OutboxRow = {
  idempotency_key: string;
  mutation_type: string;
  payload: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

export async function listOutbox(): Promise<OutboxRow[]> {
  const db = getLocalDb();
  return db.query<OutboxRow>(
    `SELECT idempotency_key, mutation_type, payload, status, attempts, last_error, created_at
     FROM _outbox ORDER BY created_at`
  );
}

export type { ExecResult };
