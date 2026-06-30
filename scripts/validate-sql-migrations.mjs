#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neonConfig, Pool } from "@neondatabase/serverless";

if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  throw new Error("Usage: validate-sql-migrations.mjs <migration.sql> [...]");
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL.");
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query("begin");
  for (const file of files) {
    const original = await readFile(resolve(process.cwd(), file), "utf8");
    const sql = original
      .replace(/^\s*begin\s*;\s*/i, "")
      .replace(/\s*commit\s*;\s*$/i, "");
    await pool.query(sql);
    console.log(`Validated ${file}`);
  }
  await pool.query("rollback");
  console.log("Rolled back validation transaction.");
} catch (error) {
  await pool.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await pool.end();
}
