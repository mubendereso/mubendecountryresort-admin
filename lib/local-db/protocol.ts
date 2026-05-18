// Message protocol between the main thread (client.ts) and the SQLite Web
// Worker (worker.ts). Kept in its own module so both sides import from a
// single source of truth and the worker bundle doesn't pull in unrelated
// client code.

export type SqlParam = string | number | boolean | bigint | null | Uint8Array;
export type SqlParams = SqlParam[];
export type SqlRow = Record<string, SqlParam>;

export type ClientToWorker =
  | { id: number; kind: "init" }
  | { id: number; kind: "exec"; sql: string; params?: SqlParams };

export type WorkerToClient =
  | { id: number; kind: "ok"; rows: SqlRow[]; changes: number }
  | { id: number; kind: "error"; error: string }
  | { kind: "ready" };
