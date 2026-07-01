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
  },
  {
    version: 5,
    name: "housekeeping_inspection_pending",
    up: `
      -- Schema marker migration. room_units.housekeeping_status is TEXT in
      -- SQLite, so no table rebuild is needed for the new server-side value.
      INSERT OR REPLACE INTO _meta(key, value)
      VALUES ('housekeeping_status_schema', 'inspection_pending');
    `
  },
  {
    version: 6,
    name: "offline_front_desk_snapshots",
    up: `
      -- Read-only operational snapshots. These tables are refreshed from
      -- /api/sync/snapshots and are never used as inventory or accounting truth.
      CREATE TABLE IF NOT EXISTS offline_snapshot_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS bookings_snapshot (
        id TEXT PRIMARY KEY,
        booking_reference TEXT NOT NULL,
        guest_name TEXT NOT NULL,
        guest_phone TEXT,
        guest_email TEXT,
        room_type_name TEXT NOT NULL,
        room_unit_name TEXT,
        check_in TEXT NOT NULL,
        check_out TEXT NOT NULL,
        status TEXT NOT NULL,
        group_id TEXT,
        group_name TEXT,
        balance_due INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS bookings_snapshot_dates_idx
        ON bookings_snapshot(check_in, check_out, status);
      CREATE INDEX IF NOT EXISTS bookings_snapshot_search_idx
        ON bookings_snapshot(booking_reference, guest_name);

      CREATE TABLE IF NOT EXISTS room_types_snapshot (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        inventory_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS folios_snapshot (
        booking_id TEXT PRIMARY KEY,
        total_charges INTEGER NOT NULL DEFAULT 0,
        total_paid INTEGER NOT NULL DEFAULT 0,
        balance_due INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_receipts_snapshot (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL,
        receipt_number TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL,
        issued_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS payment_receipts_snapshot_booking_idx
        ON payment_receipts_snapshot(booking_id, issued_at DESC);

      CREATE TABLE IF NOT EXISTS reservation_groups_snapshot (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        check_in TEXT,
        check_out TEXT,
        member_booking_count INTEGER NOT NULL DEFAULT 0,
        balance_due INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS room_units_snapshot (
        id TEXT PRIMARY KEY,
        room_name TEXT NOT NULL,
        housekeeping_status TEXT NOT NULL,
        room_type_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS room_units_snapshot_status_idx
        ON room_units_snapshot(housekeeping_status, updated_at DESC);
    `
  },
  {
    version: 7,
    name: "maintenance_work_orders_v1",
    up: `
      CREATE TABLE IF NOT EXISTS maintenance_work_orders (
        id TEXT PRIMARY KEY, work_order_number TEXT NOT NULL, room_unit_id TEXT, room_type_id TEXT,
        reported_by TEXT, assigned_to TEXT, external_vendor_name TEXT, category TEXT NOT NULL,
        priority TEXT NOT NULL, status TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
        reported_at TEXT NOT NULL, scheduled_for TEXT, expected_return_at TEXT, started_at TEXT,
        completed_at TEXT, estimated_cost_ugx INTEGER, actual_cost_ugx INTEGER,
        resolution_notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS maintenance_work_orders_status_idx ON maintenance_work_orders(status, priority, reported_at DESC);
      CREATE INDEX IF NOT EXISTS maintenance_work_orders_assignee_idx ON maintenance_work_orders(assigned_to, status);

      CREATE TABLE IF NOT EXISTS maintenance_activity (
        id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL, actor TEXT, action TEXT NOT NULL,
        previous_status TEXT, new_status TEXT, notes TEXT, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS maintenance_activity_order_idx ON maintenance_activity(work_order_id, created_at, id);

      CREATE TABLE IF NOT EXISTS maintenance_photos (
        id TEXT PRIMARY KEY, work_order_id TEXT NOT NULL, filename TEXT NOT NULL,
        storage_path TEXT NOT NULL, uploaded_by TEXT, uploaded_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS maintenance_photos_order_idx ON maintenance_photos(work_order_id, uploaded_at, id);

      CREATE TABLE IF NOT EXISTS maintenance_staff (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS maintenance_rooms (
        id TEXT PRIMARY KEY, unit_name TEXT NOT NULL, room_type_id TEXT NOT NULL,
        room_type_title TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `
  },
  {
    version: 8,
    name: "maintenance_rooms_repair",
    up: `
      -- Some development devices applied v7 before maintenance_rooms was
      -- included. Keep this repair append-only so those databases converge.
      CREATE TABLE IF NOT EXISTS maintenance_rooms (
        id TEXT PRIMARY KEY,
        unit_name TEXT NOT NULL,
        room_type_id TEXT NOT NULL,
        room_type_title TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS maintenance_rooms_type_idx
        ON maintenance_rooms(room_type_id, unit_name);
    `
  },
  {
    version: 9,
    name: "outbox_claim_tokens",
    up: `
      -- Track which browser tab currently owns a sync drain batch so multiple
      -- tabs do not drain the same rows at once.
      ALTER TABLE _outbox ADD COLUMN claim_token TEXT;
      ALTER TABLE _outbox ADD COLUMN claimed_at TEXT;

      CREATE INDEX IF NOT EXISTS _outbox_claim_idx
        ON _outbox(status, claimed_at, created_at);
    `
  }
];

// Tables the sync engine is allowed to write to when applying pulled changes.
// Guards against a malformed change feed naming an arbitrary table (the table
// name can't be parameterized in SQL, so it's interpolated — whitelist it).
export const SYNCED_TABLES = new Set<string>([
  "contact_submissions", "room_units", "maintenance_work_orders", "maintenance_activity", "maintenance_photos"
]);
