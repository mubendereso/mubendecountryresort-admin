"use client";

import { useCallback, useEffect, useState } from "react";
import { getLocalDb } from "@/lib/local-db/client";
import { enqueueMutation, listOutbox, pullChanges, sync, type OutboxRow } from "@/lib/sync/engine";

type ContactRow = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  created_at: string;
};

export function SyncTester() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [outbox, setOutbox] = useState<OutboxRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const db = getLocalDb();
    const rows = await db.query<ContactRow>(
      "SELECT id, full_name, email, status, created_at FROM contact_submissions ORDER BY created_at DESC LIMIT 25"
    );
    setContacts(rows);
    setOutbox(await listOutbox());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await getLocalDb().init();
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [refresh]);

  const run = useCallback(
    async (label: string, fn: () => Promise<string | void>) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const result = await fn();
        if (typeof result === "string") setMessage(result);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh]
  );

  const onPull = () =>
    run("pull", async () => {
      const { applied } = await pullChanges();
      return `Pulled ${applied} change(s).`;
    });

  const onSync = () =>
    run("sync", async () => {
      const { pushed, failed, applied } = await sync();
      return `Pushed ${pushed}, failed ${failed}, pulled ${applied}.`;
    });

  const onMark = (id: string, status: "read" | "archived" | "new") =>
    run("mark", async () => {
      // Optimistic local update so the UI reflects it before sync.
      const db = getLocalDb();
      await db.exec("UPDATE contact_submissions SET status = ? WHERE id = ?", [status, id]);
      await enqueueMutation("contact.mark_status", { contactId: id, status });
      return `Queued mark-as-${status}.`;
    });

  return (
    <section className="surface-card flex flex-col gap-6 p-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPull}
          disabled={busy}
          className="rounded-full border border-stoneWarm-300 bg-white px-4 py-2 text-sm font-medium text-[#2a241a] transition hover:bg-stoneWarm-100 disabled:opacity-40"
        >
          Pull
        </button>
        <button
          type="button"
          onClick={onSync}
          disabled={busy}
          className="rounded-full bg-oliveMuted-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-oliveMuted-600 disabled:opacity-40"
        >
          Sync (push + pull)
        </button>
      </div>

      {message ? (
        <p className="rounded-2xl border border-oliveMuted-400/30 bg-oliveMuted-400/10 p-3 text-sm text-oliveMuted-600">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div>
        <h2 className="text-sm font-medium text-[#2a241a]">
          Contact submissions ({contacts.length})
        </h2>
        {contacts.length === 0 ? (
          <p className="mt-2 text-sm text-[#7a6d56]">
            None locally yet — hit Pull to fetch from the server.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-stoneWarm-100">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm text-[#2a241a]">{c.full_name}</div>
                  <div className="truncate text-xs text-[#7a6d56]">{c.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded-full bg-stoneWarm-100 px-2 py-1 text-xs">{c.status}</code>
                  <button
                    type="button"
                    onClick={() => onMark(c.id, c.status === "read" ? "new" : "read")}
                    disabled={busy}
                    className="rounded-full border border-stoneWarm-300 px-3 py-1 text-xs transition hover:bg-stoneWarm-100 disabled:opacity-40"
                  >
                    {c.status === "read" ? "Mark new" : "Mark read"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-[#2a241a]">Outbox ({outbox.length})</h2>
        {outbox.length === 0 ? (
          <p className="mt-2 text-sm text-[#7a6d56]">Empty — all changes synced.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stoneWarm-100">
            {outbox.map((row) => (
              <li key={row.idempotency_key} className="py-2 text-sm">
                <div className="text-[#2a241a]">{row.mutation_type}</div>
                <div className="text-xs text-[#7a6d56]">
                  {row.status} &middot; attempts {row.attempts}
                  {row.last_error ? ` · ${row.last_error}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
