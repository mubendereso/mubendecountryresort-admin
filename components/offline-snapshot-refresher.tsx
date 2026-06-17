"use client";

import { useEffect, useState } from "react";
import {
  getOfflineLastSyncedAt,
  refreshOfflineSnapshots
} from "@/lib/offline-snapshots/client";

function formatSyncTime(value: string | null): string {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala"
  }).format(date);
}

export function OfflineSnapshotRefresher() {
  const [online, setOnline] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLastSync() {
      try {
        const value = await getOfflineLastSyncedAt();
        if (!cancelled) setLastSyncedAt(value);
      } catch {
        if (!cancelled) setLastSyncedAt(null);
      }
    }

    async function refresh() {
      setOnline(navigator.onLine);
      await loadLastSync();
      if (!navigator.onLine) return;

      try {
        const syncedAt = await refreshOfflineSnapshots();
        if (!cancelled) setLastSyncedAt(syncedAt);
      } catch {
        // Snapshot refresh is a convenience cache; live admin pages keep using
        // server data and should not be blocked by cache refresh failures.
      }
    }

    void refresh();

    const onOnline = () => void refresh();
    const onOffline = () => {
      setOnline(false);
      void loadLastSync();
    };
    const onFocus = () => void refresh();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (online) return null;

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-2">
        <strong className="font-semibold">Offline Mode</strong>
        <span>Last Sync: {formatSyncTime(lastSyncedAt)}. Data may be outdated.</span>
      </div>
    </div>
  );
}
