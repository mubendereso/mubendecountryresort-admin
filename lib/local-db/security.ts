"use client";

import { ADMIN_LOGOUT_PENDING_COOKIE_NAME } from "@/lib/auth/constants";
import { getLocalDb } from "@/lib/local-db/client";
import {
  isOfflineAccessAuthorized,
  LOCAL_ADMIN_DATA_TABLES,
  OFFLINE_ACCESS_LOCKED_VALUE,
  OFFLINE_ACCESS_STORAGE_KEY,
  OFFLINE_OWNER_META_KEY,
  OFFLINE_SESSION_META_KEY,
  shouldReplaceOfflineSession,
  type OfflineIdentity
} from "@/lib/local-db/security-policy";

export class OfflineAccessLockedError extends Error {
  constructor() {
    super("Offline data is locked. Sign in while online to enable offline access.");
    this.name = "OfflineAccessLockedError";
  }
}

function browserSessionEpoch(): string | null {
  try {
    return window.localStorage.getItem(OFFLINE_ACCESS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function lockOfflineAccess(): void {
  try {
    window.localStorage.setItem(
      OFFLINE_ACCESS_STORAGE_KEY,
      OFFLINE_ACCESS_LOCKED_VALUE
    );
  } catch {
    // The database wipe remains the primary control. Storage can be disabled
    // by browser policy, so callers must not rely on this marker alone.
  }
}

export function markServerLogoutPending(): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ADMIN_LOGOUT_PENDING_COOKIE_NAME}=1; Path=/; Max-Age=1209600; SameSite=Lax${secure}`;
}

async function readStoredIdentity(): Promise<{
  ownerId: string | null;
  sessionEpoch: string | null;
}> {
  const rows = await getLocalDb().query<{ key: string; value: string }>(
    "SELECT key, value FROM _meta WHERE key IN (?, ?)",
    [OFFLINE_OWNER_META_KEY, OFFLINE_SESSION_META_KEY]
  );
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    ownerId: values.get(OFFLINE_OWNER_META_KEY) ?? null,
    sessionEpoch: values.get(OFFLINE_SESSION_META_KEY) ?? null
  };
}

export async function clearLocalAdminData(): Promise<void> {
  const db = getLocalDb();
  await db.exec("BEGIN");
  try {
    for (const table of LOCAL_ADMIN_DATA_TABLES) {
      await db.exec(`DELETE FROM ${table}`);
    }
    await db.exec("DELETE FROM _meta");
    await db.exec("INSERT INTO _meta(key, value) VALUES ('sync_cursor', '0')");
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function countPendingOfflineMutations(): Promise<number> {
  const rows = await getLocalDb().query<{ count: number }>(
    "SELECT count(*) AS count FROM _outbox"
  );
  return Number(rows[0]?.count ?? 0);
}

export async function prepareOfflineSnapshotSession(
  incoming: OfflineIdentity
): Promise<void> {
  const existing = await readStoredIdentity();
  if (
    shouldReplaceOfflineSession(
      existing.ownerId,
      existing.sessionEpoch,
      incoming
    )
  ) {
    await clearLocalAdminData();
    lockOfflineAccess();
  }
}

export async function writeOfflineIdentity(
  incoming: OfflineIdentity
): Promise<void> {
  const db = getLocalDb();
  await db.exec(
    "INSERT OR REPLACE INTO _meta(key, value) VALUES (?, ?)",
    [OFFLINE_OWNER_META_KEY, incoming.user_id]
  );
  await db.exec(
    "INSERT OR REPLACE INTO _meta(key, value) VALUES (?, ?)",
    [OFFLINE_SESSION_META_KEY, incoming.session_epoch]
  );
}

export function unlockOfflineAccess(incoming: OfflineIdentity): void {
  window.localStorage.setItem(
    OFFLINE_ACCESS_STORAGE_KEY,
    incoming.session_epoch
  );
}

export async function assertOfflineAccess(): Promise<void> {
  const stored = await readStoredIdentity();
  if (
    !isOfflineAccessAuthorized(
      browserSessionEpoch(),
      stored.ownerId,
      stored.sessionEpoch
    )
  ) {
    throw new OfflineAccessLockedError();
  }
}
