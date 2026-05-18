/// <reference lib="webworker" />
//
// SQLite Web Worker. Holds the only DB handle in the tab; the main thread
// talks to it via the postMessage protocol in `./protocol.ts`.
//
// Persistence is via OPFS using the SAH (Synchronous Access Handle) Pool
// VFS — chosen because it does NOT require cross-origin isolation
// (COOP/COEP), so it won't break R2 image loading or any third-party
// embeds we might add later.

import { MIGRATIONS } from "./migrations";
import type { ClientToWorker, SqlRow, WorkerToClient } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const DB_FILENAME = "/mcr-admin.db";
const POOL_NAME = "mcr-admin-pool";
// sqlite-wasm dist/ files are copied to /sqlite-wasm/ by
// scripts/copy-sqlite-wasm.mjs. We load the entry module via a *runtime*
// dynamic import so Turbopack/webpack never try to statically analyse the
// package internals (which contain bundler-hostile dynamic Worker URLs).
const SQLITE_WASM_MODULE_URL = "/sqlite-wasm/index.mjs";

// `sqlite-wasm`'s TypeScript surface is partial; treat the live objects as
// `any` and pin shapes locally where we need them.
type SqliteDb = {
  exec: (arg: string | { sql: string; bind?: unknown[] }) => unknown;
  selectObjects: (sql: string, bind?: unknown[]) => SqlRow[];
  selectValue: (sql: string, bind?: unknown[]) => unknown;
  changes: () => number;
};

let db: SqliteDb | null = null;
let initPromise: Promise<void> | null = null;

type SqliteInitOptions = {
  locateFile?: (path: string) => string;
  print?: (...args: unknown[]) => void;
  printErr?: (...args: unknown[]) => void;
};

type SqliteInitFn = (opts?: SqliteInitOptions) => Promise<unknown>;

async function loadSqliteWasm(): Promise<SqliteInitFn> {
  // Variable-based dynamic import + ignore comments → bundlers leave this
  // alone and the URL is resolved by the browser at runtime against
  // `/sqlite-wasm/` (served from public/).
  const moduleUrl = SQLITE_WASM_MODULE_URL;
  const mod = (await import(
    /* webpackIgnore: true */
    /* @vite-ignore */
    moduleUrl
  )) as { default: SqliteInitFn };
  return mod.default;
}

async function init(): Promise<void> {
  const initSqlite = await loadSqliteWasm();
  const sqlite3: any = await initSqlite({
    locateFile: (path: string) => `/sqlite-wasm/${path}`,
    print: (...args: unknown[]) => console.log("[sqlite]", ...args),
    printErr: (...args: unknown[]) => console.error("[sqlite]", ...args)
  });

  const poolUtil: any = await sqlite3.installOpfsSAHPoolVfs({
    name: POOL_NAME,
    initialCapacity: 6
  });

  db = new poolUtil.OpfsSAHPoolDb(DB_FILENAME) as SqliteDb;

  // Migration runner. Bootstrap the version table, then apply any unapplied
  // migrations in order.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const currentRaw = db.selectValue("SELECT COALESCE(MAX(version), 0) FROM _migrations");
  const current = Number(currentRaw ?? 0);

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec(migration.up);
    db.exec({
      sql: "INSERT INTO _migrations (version, name) VALUES (?, ?)",
      bind: [migration.version, migration.name]
    });
  }
}

function send(msg: WorkerToClient) {
  self.postMessage(msg);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function ensureInit() {
  if (!initPromise) initPromise = init();
  await initPromise;
  if (!db) throw new Error("Local DB not initialised");
  return db;
}

self.addEventListener("message", async (ev: MessageEvent<ClientToWorker>) => {
  const msg = ev.data;

  if (msg.kind === "init") {
    try {
      await ensureInit();
      send({ id: msg.id, kind: "ok", rows: [], changes: 0 });
    } catch (err) {
      send({ id: msg.id, kind: "error", error: errorMessage(err) });
    }
    return;
  }

  if (msg.kind === "exec") {
    try {
      const handle = await ensureInit();
      const rows = handle.selectObjects(msg.sql, msg.params ?? []);
      const changes = handle.changes();
      send({ id: msg.id, kind: "ok", rows, changes });
    } catch (err) {
      send({ id: msg.id, kind: "error", error: errorMessage(err) });
    }
    return;
  }
});

// Notify the main thread that the worker module has loaded. Init itself is
// lazy — first message triggers it — but having "ready" lets the client
// know the worker handle is alive.
send({ kind: "ready" });
