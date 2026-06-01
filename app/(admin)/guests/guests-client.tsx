"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GuestSummary } from "@/lib/guests/types";

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG").format(n) + " UGX";
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(y, m - 1, day));
}

// ─── Guest card ───────────────────────────────────────────────────────────────

function GuestCard({ guest }: { guest: GuestSummary }) {
  return (
    <Link
      href={`/guests/${encodeURIComponent(guest.guest_key)}`}
      className="surface-card block p-5 transition hover:bg-stoneWarm-50"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1">
          <p className="font-semibold">{guest.guest_full_name}</p>
          {guest.guest_email && (
            <p className="text-sm text-oliveMuted-600">{guest.guest_email}</p>
          )}
          {guest.guest_phone && (
            <p className="text-sm text-oliveMuted-500">{guest.guest_phone}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-6 text-right text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">Stays</p>
            <p className="mt-0.5 font-semibold">{guest.total_stays}</p>
          </div>
          {guest.total_spend_ugx > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">Spend</p>
              <p className="mt-0.5 font-semibold">{fmtUgx(guest.total_spend_ugx)}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">Last Visit</p>
            <p className="mt-0.5 font-semibold">
              {guest.last_visit ? fmtDate(guest.last_visit) : "—"}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = "recent" | "stays" | "spend";

function sortGuests(guests: GuestSummary[], sort: SortKey): GuestSummary[] {
  const copy = [...guests];
  if (sort === "stays") return copy.sort((a, b) => b.total_stays - a.total_stays);
  if (sort === "spend") return copy.sort((a, b) => b.total_spend_ugx - a.total_spend_ugx);
  return copy; // "recent" — server already orders by most recent booking
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GuestsClient({ guests }: { guests: GuestSummary[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? guests.filter(
          (g) =>
            g.guest_full_name.toLowerCase().includes(q) ||
            (g.guest_email ?? "").toLowerCase().includes(q) ||
            (g.guest_phone ?? "").includes(q)
        )
      : guests;
    return sortGuests(filtered, sort);
  }, [guests, search, sort]);

  const sortTabs: { key: SortKey; label: string }[] = [
    { key: "recent", label: "Most Recent" },
    { key: "stays", label: "Most Stays" },
    { key: "spend", label: "Highest Spend" }
  ];

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Guests</h1>
          <p className="mt-1 text-sm text-oliveMuted-600">
            {guests.length} guest{guests.length !== 1 ? "s" : ""} on record
          </p>
        </div>
      </header>

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-4">
        <input
          type="search"
          placeholder="Search by name, email, or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm"
        />
        <div className="flex gap-1 border-b border-stoneWarm-200">
          {sortTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSort(tab.key)}
              className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-semibold transition ${
                sort === tab.key
                  ? "border-b-2 border-oliveMuted-600 text-oliveMuted-700"
                  : "text-oliveMuted-500 hover:text-oliveMuted-600"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Guest list */}
      {displayed.length === 0 ? (
        <p className="text-sm text-oliveMuted-600">
          {search ? "No guests match your search." : "No guest records yet."}
        </p>
      ) : (
        <div className="grid gap-2">
          {displayed.map((guest) => (
            <GuestCard key={guest.guest_key} guest={guest} />
          ))}
        </div>
      )}
    </section>
  );
}
