#!/usr/bin/env node
// Copy the SQLite WASM binary out of node_modules into public/ so the
// browser worker can fetch it from a stable path served by OpenNext's
// ASSETS binding (or `next dev`). Runs as `postinstall` so CI gets the
// file without needing a separate build step.

import { mkdir, copyFile, access, readdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const srcDir = resolve(repoRoot, "node_modules/@sqlite.org/sqlite-wasm/dist");
const destDir = resolve(repoRoot, "public/sqlite-wasm");

try {
  await access(srcDir);
} catch {
  console.warn(
    "[copy-sqlite-wasm] source not found at " +
      srcDir +
      " — skipping (likely a CI install before deps are present)."
  );
  process.exit(0);
}

await mkdir(destDir, { recursive: true });

// Copy every file in dist/ so sqlite-wasm's own dynamic imports
// (sqlite3-worker1.mjs, sqlite3-opfs-async-proxy.js, etc.) all resolve
// relative to /sqlite-wasm/. We load sqlite-wasm entirely outside the
// Next.js bundle to dodge Turbopack's static-Worker-URL analysis.
const entries = await readdir(srcDir, { withFileTypes: true });
let copied = 0;
for (const entry of entries) {
  if (!entry.isFile()) continue;
  await copyFile(join(srcDir, entry.name), join(destDir, entry.name));
  copied += 1;
}

console.log(`[copy-sqlite-wasm] copied ${copied} files: ${srcDir} -> ${destDir}`);
