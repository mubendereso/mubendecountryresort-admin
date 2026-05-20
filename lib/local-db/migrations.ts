// Versioned schema migrations applied to the browser-side SQLite database.
//
// Conventions:
//   - Migrations are append-only. Never edit a shipped migration; add a new
//     one. Existing devices have already applied old versions and won't
//     re-run them.
//   - Each migration's `up` may contain multiple statements separated by
//     semicolons; SQLite's exec() handles that.
//   - Postgres types map to SQLite as follows (mirror this in any DDL that
//     reflects the Neon schema):
//       uuid          -> TEXT
//       jsonb         -> TEXT (JSON-encoded)
//       text[]        -> TEXT (JSON-encoded array)
//       timestamptz   -> TEXT (ISO 8601)
//       bigint        -> INTEGER (SQLite stores as 64-bit signed)
//       boolean       -> INTEGER (0 / 1)
//   - PMS module tables land here one phase at a time alongside the matching
//     server schema in `db/`. For now there's only the metadata table that
//     the migration runner itself uses.

export interface Migration {
  version: number;
  name: string;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "init_meta",
    up: `
      CREATE TABLE IF NOT EXISTS _meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `
  },
  {
    version: 2,
    name: "outbox",
    up: `
      -- Pending mutations made while offline (or just not yet confirmed by
      -- the server). Drained by the sync engine against /api/sync/push.
      -- The idempotency_key is a client-generated UUID that the server uses
      -- to dedupe, so a retry after a flaky reconnect never double-applies.
      CREATE TABLE IF NOT EXISTS _outbox (
        idempotency_key TEXT PRIMARY KEY,
        mutation_type   TEXT NOT NULL,
        payload         TEXT NOT NULL,            -- JSON-encoded args
        status          TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'syncing', 'failed')),
        attempts        INTEGER NOT NULL DEFAULT 0,
        last_error      TEXT,
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_attempt_at TEXT
      );

      CREATE INDEX IF NOT EXISTS _outbox_status_idx
        ON _outbox(status, created_at);

      -- The pull cursor (last sync_changes.seq we've applied) lives in _meta
      -- under key 'sync_cursor'. Seed it to 0 so the first pull fetches
      -- everything.
      INSERT OR IGNORE INTO _meta(key, value) VALUES ('sync_cursor', '0');
    `
  },
  {
    version: 3,
    name: "mirror_contact_submissions",
    up: `
      -- Mirror of public.contact_submissions (Neon). Column set must match
      -- the Neon row exactly (to_jsonb(new) sends every column) — keep this
      -- in lockstep with db/0001_init.sql. uuid->TEXT, timestamptz->TEXT.
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id         TEXT PRIMARY KEY,
        full_name  TEXT,
        email      TEXT,
        phone      TEXT,
        subject    TEXT,
        message    TEXT,
        status     TEXT,
        notes      TEXT,
        created_at TEXT
      );

      CREATE INDEX IF NOT EXISTS contact_submissions_status_idx
        ON contact_submissions(status, created_at DESC);
    `
  },
  {
    version: 4,
    name: "mirror_room_units",
    up: `
      -- Mirror of public.room_units (Neon). Used by the housekeeping board
      -- so room-readiness work can continue on weak WiFi.
      CREATE TABLE IF NOT EXISTS room_units (
        id                   TEXT PRIMARY KEY,
        room_type_id         TEXT,
        unit_name            TEXT,
        floor                INTEGER,
        housekeeping_status  TEXT,
        notes                TEXT,
        created_at           TEXT,
        updated_at           TEXT
      );

      CREATE INDEX IF NOT EXISTS room_units_status_idx
        ON room_units(housekeeping_status, updated_at DESC);

      CREATE INDEX IF NOT EXISTS room_units_room_type_idx
        ON room_units(room_type_id, unit_name);
    `
  }
];

// Tables the sync engine is allowed to write to when applying pulled changes.
// Guards against a malformed change feed naming an arbitrary table (the table
// name can't be parameterized in SQL, so it's interpolated — whitelist it).
export const SYNCED_TABLES = new Set<string>(["contact_submissions", "room_units"]);
