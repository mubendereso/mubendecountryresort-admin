"use client";

import { useCallback, useEffect, useState } from "react";
import { getLocalDb } from "@/lib/local-db/client";

type PingRow = {
  id: number;
  note: string;
  created_at: string;
};

const ENSURE_TABLE = `
  CREATE TABLE IF NOT EXISTS test_pings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;

export function LocalDbTester() {
  const [status, setStatus] = useState<"booting" | "ready" | "error">("booting");
  const [error, setError] = useState<string | null>(null);
  const [pings, setPings] = useState<PingRow[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const db = getLocalDb();
    const rows = await db.query<PingRow>(
      "SELECT id, note, created_at FROM test_pings ORDER BY id DESC LIMIT 20"
    );
    setPings(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getLocalDb();
        await db.exec(ENSURE_TABLE);
        if (cancelled) return;
        await refresh();
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const onInsert = useCallback(async () => {
    if (!note.trim() || busy) return;
    setBusy(true);
    try {
      const db = getLocalDb();
      await db.exec("INSERT INTO test_pings (note) VALUES (?)", [note.trim()]);
      setNote("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [note, busy, refresh]);

  const onClear = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const db = getLocalDb();
      await db.exec("DELETE FROM test_pings");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  return (
    <section className="surface-card flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-[0.2em] text-oliveMuted-500">
          Status
        </span>
        <code className="rounded-full bg-stoneWarm-100 px-3 py-1 text-xs text-[#2a241a]">
          {status}
        </code>
      </div>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onInsert();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Type a note and press Insert"
          className="flex-1 rounded-full border border-stoneWarm-200 bg-white px-4 py-2 text-sm outline-none focus:border-oliveMuted-500"
          disabled={status !== "ready" || busy}
        />
        <button
          type="submit"
          disabled={status !== "ready" || busy || !note.trim()}
          className="rounded-full bg-oliveMuted-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-oliveMuted-600 disabled:opacity-40"
        >
          Insert
        </button>
        <button
          type="button"
          onClick={() => void onClear()}
          disabled={status !== "ready" || busy || pings.length === 0}
          className="rounded-full border border-stoneWarm-300 bg-white px-4 py-2 text-sm font-medium text-[#2a241a] transition hover:bg-stoneWarm-100 disabled:opacity-40"
        >
          Clear
        </button>
      </form>

      <div>
        <h2 className="text-sm font-medium text-[#2a241a]">
          Recent ({pings.length})
        </h2>
        {pings.length === 0 ? (
          <p className="mt-2 text-sm text-[#7a6d56]">No rows yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stoneWarm-100">
            {pings.map((row) => (
              <li key={row.id} className="py-2 text-sm">
                <div className="text-[#2a241a]">{row.note}</div>
                <div className="text-xs text-[#7a6d56]">
                  #{row.id} &middot; {row.created_at}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
