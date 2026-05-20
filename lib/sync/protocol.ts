// Wire contract for the sync engine. Shared by the browser sync engine
// (lib/sync/engine.ts) and the server route handlers (app/api/sync/*).
//
// Two directions:
//   PUSH  — client drains its _outbox to the server. Each mutation carries
//           a client-generated idempotency key so retries never double-apply.
//   PULL  — client fetches rows changed since its stored cursor (the
//           sync_changes.seq high-water mark).

// ---------------------------------------------------------------------
// Push: client -> server
// ---------------------------------------------------------------------

export type QueuedMutation = {
  idempotencyKey: string; // UUID, also the _outbox primary key
  type: string; // registered mutation name, e.g. "contact.mark_read"
  payload: Record<string, unknown>;
};

export type PushRequest = {
  mutations: QueuedMutation[];
};

export type MutationResult =
  | { idempotencyKey: string; ok: true }
  | {
      idempotencyKey: string;
      ok: false;
      error: string;
      // retryable=false → drop from outbox (validation/permission failure).
      // retryable=true  → keep and retry later (transient/network/db error).
      retryable: boolean;
    };

export type PushResponse = {
  results: MutationResult[];
};

// ---------------------------------------------------------------------
// Pull: server -> client
// ---------------------------------------------------------------------

export type SyncOp = "insert" | "update" | "delete";

export type SyncChange = {
  seq: number;
  table: string;
  rowId: string;
  op: SyncOp;
  row: Record<string, unknown> | null; // null for deletes
};

export type PullRequest = {
  cursor: number; // last seq the client has applied
  limit?: number; // server clamps; default/clamp lives server-side
};

export type PullResponse = {
  changes: SyncChange[];
  cursor: number; // new high-water mark (max seq in this batch, or unchanged)
  hasMore: boolean; // true if more changes exist beyond this batch
};

// Default pull batch size; the server clamps requests to this.
export const PULL_BATCH_LIMIT = 500;
