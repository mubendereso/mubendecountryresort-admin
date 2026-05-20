"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLocalDb } from "@/lib/local-db/client";
import { sync, enqueueMutation, pushOutbox } from "@/lib/sync/engine";
import type { ContactStatus, ContactSubmission } from "@/lib/contacts/types";

type Filter = "all" | ContactStatus;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

async function queryAllLocal(): Promise<ContactSubmission[]> {
  const db = getLocalDb();
  return db.query<ContactSubmission>(
    `SELECT id, full_name, email, phone, subject, message, status, notes, created_at
     FROM contact_submissions
     ORDER BY created_at DESC
     LIMIT 200`
  );
}

// ─── Contact row ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<ContactStatus, string> = {
  new: "bg-amber-100 text-amber-800",
  read: "bg-stoneWarm-100 text-oliveMuted-600",
  archived: "bg-stoneWarm-50 text-stoneWarm-400"
};

function ContactRow({
  contact,
  isExpanded,
  onToggle,
  onMark
}: {
  contact: ContactSubmission;
  isExpanded: boolean;
  onToggle: () => void;
  onMark: (status: ContactStatus) => void;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 text-left transition hover:bg-stoneWarm-50"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLE[contact.status]}`}
              >
                {contact.status}
              </span>
              <span
                className={`text-sm font-semibold ${contact.status === "new" ? "text-[#2a241a]" : "text-oliveMuted-700"}`}
              >
                {contact.full_name}
              </span>
              <span className="text-xs text-oliveMuted-500">{contact.email}</span>
            </div>
            {contact.subject && (
              <p className="text-sm font-medium text-oliveMuted-800">{contact.subject}</p>
            )}
            {!isExpanded && (
              <p className="line-clamp-1 text-sm text-oliveMuted-500">{contact.message}</p>
            )}
          </div>
          <p className="shrink-0 text-xs text-oliveMuted-500">{formatDate(contact.created_at)}</p>
        </div>
      </button>

      {isExpanded && (
        <div className="grid gap-4 border-t border-stoneWarm-100 px-5 py-4">
          <div className="grid gap-1.5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Message</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{contact.message}</p>
          </div>

          {contact.phone && (
            <div className="grid gap-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Phone</p>
              <a
                href={`tel:${contact.phone}`}
                className="text-sm text-oliveMuted-700 hover:underline"
              >
                {contact.phone}
              </a>
            </div>
          )}

          {contact.notes && (
            <div className="grid gap-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Notes</p>
              <p className="text-sm">{contact.notes}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {contact.status !== "read" && (
              <button
                type="button"
                onClick={() => onMark("read")}
                className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
              >
                Mark read
              </button>
            )}
            {contact.status !== "new" && (
              <button
                type="button"
                onClick={() => onMark("new")}
                className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
              >
                Mark new
              </button>
            )}
            {contact.status !== "archived" && (
              <button
                type="button"
                onClick={() => onMark("archived")}
                className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm text-oliveMuted-500 transition hover:text-oliveMuted-700"
              >
                Archive
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main inbox component ────────────────────────────────────────────────────

export function InboxClient({ initialContacts }: { initialContacts: ContactSubmission[] }) {
  const [contacts, setContacts] = useState<ContactSubmission[]>(initialContacts);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Tracks whether we've completed at least one successful sync; prevents
  // overwriting the SSR-provided initialContacts with an empty SQLite table.
  const hasSyncedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await queryAllLocal();
      if (rows.length > 0 || hasSyncedRef.current) {
        setContacts(rows);
      }
    } catch {
      // SQLite not available (e.g. OPFS blocked) — keep existing contacts
    }
  }, []);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      await sync();
      hasSyncedRef.current = true;
      await refresh();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    }
    setSyncing(false);
  }, [refresh]);

  useEffect(() => {
    void runSync();
    const onFocus = () => void runSync();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [runSync]);

  async function markStatus(contactId: string, status: ContactStatus) {
    // Optimistic: update local SQLite immediately so the UI responds instantly
    const db = getLocalDb();
    await db.exec("UPDATE contact_submissions SET status = ? WHERE id = ?", [status, contactId]);
    await refresh();

    // Enqueue then attempt an immediate push (best effort — outbox retries if offline)
    await enqueueMutation("contact.mark_status", { contactId, status });
    try {
      await pushOutbox();
    } catch {}
  }

  function handleToggle(contactId: string, currentStatus: ContactStatus) {
    if (expanded === contactId) {
      setExpanded(null);
    } else {
      setExpanded(contactId);
      // Auto-mark as read when opening a new submission
      if (currentStatus === "new") {
        void markStatus(contactId, "read");
      }
    }
  }

  const newCount = contacts.filter((c) => c.status === "new").length;
  const displayed = filter === "all" ? contacts : contacts.filter((c) => c.status === filter);

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "new", label: newCount > 0 ? `New (${newCount})` : "New" },
    { key: "read", label: "Read" },
    { key: "archived", label: "Archived" }
  ];

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Inbox</h1>
        <div className="flex items-center gap-3">
          {syncError && <p className="text-xs text-red-500">{syncError}</p>}
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={syncing}
            className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </header>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 border-b border-stoneWarm-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
              filter === tab.key
                ? "border-b-2 border-oliveMuted-600 text-oliveMuted-700"
                : "text-oliveMuted-500 hover:text-oliveMuted-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contact list */}
      {displayed.length === 0 ? (
        <p className="text-sm text-oliveMuted-600">
          {syncing
            ? "Syncing…"
            : filter === "all"
              ? "No contacts yet."
              : `No ${filter} contacts.`}
        </p>
      ) : (
        <div className="grid gap-2">
          {displayed.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              isExpanded={expanded === contact.id}
              onToggle={() => handleToggle(contact.id, contact.status)}
              onMark={(status) => void markStatus(contact.id, status)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
