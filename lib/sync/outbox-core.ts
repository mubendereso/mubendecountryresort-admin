import type { ExecResult } from "../local-db/client";
import type { PushResponse, QueuedMutation } from "./protocol";

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
export const OUTBOX_CLAIM_TTL_MS = 5 * 60 * 1000;
export const OUTBOX_BATCH_LIMIT = 100;
export const OUTBOX_BYTE_LIMIT = 1_800_000;

export type LocalDbLike = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string, params?: unknown[]): Promise<ExecResult>;
};

export type ClaimedOutboxRow = {
  idempotency_key: string;
  mutation_type: string;
  payload: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  claim_token: string | null;
  claimed_at: string | null;
};

export async function claimOutboxRows(
  db: LocalDbLike,
  claimToken: string,
  claimTime: string,
  reclaimBefore: string
): Promise<ClaimedOutboxRow[]> {
  const rows = await db.query<ClaimedOutboxRow>(
    `UPDATE _outbox
     SET status = 'syncing',
         claim_token = ?,
         claimed_at = ?
     WHERE idempotency_key IN (
       SELECT idempotency_key
       FROM _outbox
       WHERE status IN ('pending', 'failed')
          OR (status = 'syncing' AND claimed_at IS NOT NULL AND claimed_at < ?)
       ORDER BY created_at
       LIMIT ?
     )
     RETURNING idempotency_key, mutation_type, payload, status, attempts, last_error, created_at, claim_token, claimed_at`,
    [claimToken, claimTime, reclaimBefore, OUTBOX_BATCH_LIMIT]
  );
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function planPushBatch(pending: ClaimedOutboxRow[]): {
  mutations: QueuedMutation[];
  requeueIds: string[];
} {
  const mutations: QueuedMutation[] = [];
  let estimatedBytes = 0;

  for (const row of pending) {
    const next = {
      idempotencyKey: row.idempotency_key,
      type: row.mutation_type,
      payload: JSON.parse(row.payload) as Record<string, unknown>
    };
    const nextBytes = JSON.stringify(next).length;
    if (mutations.length > 0 && estimatedBytes + nextBytes > OUTBOX_BYTE_LIMIT) break;
    mutations.push(next);
    estimatedBytes += nextBytes;
  }

  return {
    mutations,
    requeueIds: pending.slice(mutations.length).map((row) => row.idempotency_key)
  };
}

export async function deleteClaimedRow(
  db: LocalDbLike,
  claimToken: string,
  idempotencyKey: string
): Promise<void> {
  await db.exec("DELETE FROM _outbox WHERE idempotency_key = ? AND claim_token = ?", [
    idempotencyKey,
    claimToken
  ]);
}

export async function markClaimFailure(
  db: LocalDbLike,
  claimToken: string,
  idempotencyKey: string,
  error: string
): Promise<void> {
  await db.exec(
    `UPDATE _outbox
     SET status = 'failed',
         attempts = attempts + 1,
         last_error = ?,
         last_attempt_at = ${NOW_SQL},
         claim_token = NULL,
         claimed_at = NULL
     WHERE idempotency_key = ? AND claim_token = ?`,
    [error, idempotencyKey, claimToken]
  );
}

export async function requeueClaimedRows(
  db: LocalDbLike,
  claimToken: string,
  idempotencyKeys: string[]
): Promise<void> {
  if (idempotencyKeys.length === 0) return;
  await db.exec(
    `UPDATE _outbox
     SET status = 'pending',
         claim_token = NULL,
         claimed_at = NULL
     WHERE claim_token = ? AND idempotency_key IN (${idempotencyKeys.map(() => "?").join(", ")})`,
    [claimToken, ...idempotencyKeys]
  );
}

export async function applyPushResults(
  db: LocalDbLike,
  claimToken: string,
  results: PushResponse["results"]
): Promise<{ pushed: number; failed: number }> {
  let pushed = 0;
  let failed = 0;
  for (const result of results) {
    if (result.ok) {
      await deleteClaimedRow(db, claimToken, result.idempotencyKey);
      pushed += 1;
    } else if (!result.retryable) {
      await deleteClaimedRow(db, claimToken, result.idempotencyKey);
      failed += 1;
    } else {
      await markClaimFailure(db, claimToken, result.idempotencyKey, result.error);
      failed += 1;
    }
  }
  return { pushed, failed };
}

