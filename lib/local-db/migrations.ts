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
  }
];
