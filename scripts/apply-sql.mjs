#!/usr/bin/env node
// Apply a .sql file to the Neon database in a single multi-statement query
// (so begin/commit blocks run atomically). Usage:
//
//   node --env-file=.env.local scripts/apply-sql.mjs db/0002_sync.sql
//
// Uses the WebSocket Pool (not the HTTP `neon()` tag) because the HTTP
// transport executes one statement per call and can't run a full migration
// file with its own transaction.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neonConfig, Pool } from "@neondatabase/serverless";

// Node 22+ ships a global WebSocket; the Neon Pool needs a constructor.
if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
} else {
  const { default: ws } = await import("ws");
  neonConfig.webSocketConstructor = ws;
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/apply-sql.mjs <path-to.sql>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("Missing DATABASE_URL.");
  process.exit(1);
}

const sql = await readFile(resolve(process.cwd(), file), "utf8");
const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query(sql);
  console.log(`Applied ${file}`);
} catch (err) {
  console.error(`Failed to apply ${file}:`);
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
