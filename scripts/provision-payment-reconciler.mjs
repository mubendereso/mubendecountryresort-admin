#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { neonConfig, Pool } from "@neondatabase/serverless";

if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

const storefrontPath = resolve(
  process.cwd(),
  process.argv[2] ?? "../mubende_country_resort"
);
const ownerDatabaseUrl = process.env.DATABASE_URL?.trim();
if (!ownerDatabaseUrl) throw new Error("Missing owner DATABASE_URL.");

function parseEnvFile(raw) {
  const parsed = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

async function loadStorefrontSecrets() {
  const merged = {};
  for (const filename of [".env.local", ".dev.vars"]) {
    try {
      Object.assign(
        merged,
        parseEnvFile(await readFile(resolve(storefrontPath, filename), "utf8"))
      );
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const name of ["PESAPAL_CONSUMER_KEY", "PESAPAL_CONSUMER_SECRET"]) {
    if (!merged[name]?.trim()) throw new Error(`Missing storefront ${name}.`);
  }
  return merged;
}

function runSecretBulk(secrets) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      executable,
      ["wrangler", "secret", "bulk", "--config", "wrangler.reconciler.jsonc"],
      {
        cwd: storefrontPath,
        stdio: ["pipe", "inherit", "inherit"],
        windowsHide: true,
        shell: process.platform === "win32"
      }
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`wrangler secret bulk exited with code ${code}.`));
    });
    child.stdin.end(JSON.stringify(secrets));
  });
}

const storefrontSecrets = await loadStorefrontSecrets();
const password = randomBytes(32).toString("base64url");
const ownerPool = new Pool({ connectionString: ownerDatabaseUrl });

try {
  await ownerPool.query(
    `alter role mcr_payment_reconciler with login password '${password}'`
  );
} finally {
  await ownerPool.end();
}

const reconcilerUrl = new URL(ownerDatabaseUrl);
reconcilerUrl.username = "mcr_payment_reconciler";
reconcilerUrl.password = password;

const reconcilerPool = new Pool({ connectionString: reconcilerUrl.toString() });
try {
  const result = await reconcilerPool.query("select current_user");
  if (result.rows[0]?.current_user !== "mcr_payment_reconciler") {
    throw new Error("Reconciler database login verification failed.");
  }
} finally {
  await reconcilerPool.end();
}

await runSecretBulk({
  DATABASE_URL: reconcilerUrl.toString(),
  PESAPAL_CONSUMER_KEY: storefrontSecrets.PESAPAL_CONSUMER_KEY,
  PESAPAL_CONSUMER_SECRET: storefrontSecrets.PESAPAL_CONSUMER_SECRET
});

console.log("Provisioned the reconciler database login and Cloudflare secrets.");
