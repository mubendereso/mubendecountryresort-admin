"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { GuestSummary } from "@/lib/guests/types";

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(parseDate(value));
}

function formatUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "G";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function GuestIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
    </svg>
  );
}

function BedIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M4 18v-7m16 7v-5a3 3 0 0 0-3-3H9a5 5 0 0 0-5 5v3" />
      <path d="M4 14h16M7 10V7h5a3 3 0 0 1 3 3" />
      <path d="M6 18v2m12-2v2" strokeLinecap="round" />
    </svg>
  );
}

function PaymentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <rect x="3.5" y="6" width="17" height="12" rx="3" />
      <path d="M3.5 10h17M7 14h3" strokeLinecap="round" />
    </svg>
  );
}

function ArrivalIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v3h14v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M4 10h11m-4-4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  detail
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="flex min-w-[155px] flex-1 items-center gap-3 px-4 py-3.5 sm:px-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-stoneWarm-100 text-oliveMuted-600">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
          {label}
        </span>
        <span className="mt-0.5 block truncate font-serif text-xl font-semibold text-[#2a241a]">
          {value}
        </span>
        <span className="block text-[10px] text-oliveMuted-500">{detail}</span>
      </span>
    </div>
  );
}

function GuestMetric({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-[17px] bg-stoneWarm-100/45 px-3.5 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-oliveMuted-500">
        {label}
      </p>
      <p className="mt-1.5 truncate text-sm font-semibold text-[#2a241a]">{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-oliveMuted-500">{detail}</p>}
    </div>
  );
}

function GuestCard({ guest }: { guest: GuestSummary }) {
  return (
    <Link
      href={`/guests/${encodeURIComponent(guest.guest_key)}`}
      className="group overflow-hidden rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:border-stoneWarm-300 hover:shadow-[0_18px_42px_rgba(55,43,30,0.11)]"
    >
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(240px,0.85fr)_minmax(0,1.5fr)_minmax(220px,0.75fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-oliveMuted-400/20 bg-gradient-to-br from-oliveMuted-600 to-oliveMuted-500 font-serif text-xl font-semibold text-canvas-light shadow-[0_10px_24px_rgba(82,88,69,0.2)]">
            {initials(guest.guest_full_name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-serif text-[22px] font-semibold tracking-[-0.02em] text-[#2a241a]">
              {guest.guest_full_name}
            </h2>
            {guest.guest_email && (
              <p className="mt-1.5 truncate text-sm text-oliveMuted-600">{guest.guest_email}</p>
            )}
            {guest.guest_phone && (
              <p className="mt-1 truncate text-xs text-oliveMuted-500">{guest.guest_phone}</p>
            )}
            {!guest.guest_email && !guest.guest_phone && (
              <p className="mt-1.5 text-sm text-oliveMuted-500">No contact details recorded</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <GuestMetric
            label="Stays"
            value={String(guest.total_stays)}
            detail="recorded visits"
          />
          <GuestMetric
            label="Lifetime Spend"
            value={formatUgx(guest.total_spend_ugx)}
            detail="payments recorded"
          />
          <div className="col-span-2 sm:col-span-1">
            <GuestMetric
              label="Last Visit"
              value={guest.last_visit ? formatDate(guest.last_visit) : "No completed stay"}
            />
          </div>
        </div>

        <div className={`rounded-[20px] border p-4 ${
          guest.next_arrival
            ? "border-oliveMuted-400/20 bg-oliveMuted-400/10"
            : "border-stoneWarm-200/70 bg-stoneWarm-100/35"
        }`}>
          <div className="flex items-start gap-3">
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl ${
              guest.next_arrival
                ? "bg-oliveMuted-600 text-canvas-light"
                : "bg-[#fffdf8] text-oliveMuted-500 shadow-sm"
            }`}>
              <ArrivalIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                Next Arrival
              </p>
              {guest.next_arrival ? (
                <>
                  <p className="mt-1.5 font-serif text-lg font-semibold text-[#2a241a]">
                    {formatDate(guest.next_arrival)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-oliveMuted-600">
                    {guest.next_room_type_title}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-sm font-medium leading-5 text-oliveMuted-600">
                  No upcoming reservations
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-stoneWarm-200/70 bg-stoneWarm-100/20 px-4 py-3 sm:px-5">
        <p className="text-[10px] text-oliveMuted-500">
          {guest.total_bookings} total {guest.total_bookings === 1 ? "reservation" : "reservations"} on record
        </p>
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-oliveMuted-600 transition-colors group-hover:text-[#2a241a]">
          View guest history
          <ArrowIcon className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

type SortKey = "recent" | "stays" | "spend" | "upcoming";

function sortGuests(guests: GuestSummary[], sort: SortKey): GuestSummary[] {
  const copy = [...guests];
  if (sort === "stays") {
    return copy.sort((a, b) => b.total_stays - a.total_stays);
  }
  if (sort === "spend") {
    return copy.sort((a, b) => b.total_spend_ugx - a.total_spend_ugx);
  }
  if (sort === "upcoming") {
    return copy.sort((a, b) => {
      if (!a.next_arrival && !b.next_arrival) return 0;
      if (!a.next_arrival) return 1;
      if (!b.next_arrival) return -1;
      return a.next_arrival.localeCompare(b.next_arrival);
    });
  }
  return copy;
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="relative overflow-hidden rounded-[26px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-6 py-12 text-center shadow-[0_12px_30px_rgba(55,43,30,0.04)]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-stoneWarm-100/55 to-transparent" />
      <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-full border border-stoneWarm-200 bg-stoneWarm-100/70 text-oliveMuted-600 shadow-inner">
        <GuestIcon className="h-7 w-7" />
      </span>
      <h2 className="relative mt-5 font-serif text-xl font-semibold text-[#2a241a]">
        {search ? "No guests match your search." : "No guest records yet."}
      </h2>
      <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-oliveMuted-600">
        {search
          ? "Try another name, email address, or phone number."
          : "Guest history will appear here as reservations are created."}
      </p>
    </div>
  );
}

export function GuestsClient({ guests }: { guests: GuestSummary[] }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const summary = useMemo(
    () => ({
      totalGuests: guests.length,
      totalStays: guests.reduce((total, guest) => total + guest.total_stays, 0),
      lifetimeSpend: guests.reduce((total, guest) => total + guest.total_spend_ugx, 0),
      upcomingArrivals: guests.filter((guest) => guest.next_arrival !== null).length
    }),
    [guests]
  );

  const displayed = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? guests.filter(
          (guest) =>
            guest.guest_full_name.toLowerCase().includes(query) ||
            (guest.guest_email ?? "").toLowerCase().includes(query) ||
            (guest.guest_phone ?? "").includes(query)
        )
      : guests;
    return sortGuests(filtered, sort);
  }, [guests, search, sort]);

  const sortTabs: { key: SortKey; label: string }[] = [
    { key: "recent", label: "Most Recent" },
    { key: "stays", label: "Most Stays" },
    { key: "spend", label: "Highest Spend" },
    { key: "upcoming", label: "Upcoming Arrivals" }
  ];

  return (
    <section className="grid gap-7 lg:gap-9">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-bronze-400/15" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-44 w-44 rounded-full border border-oliveMuted-400/10" />
        <div className="relative max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
            Guest history
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
            Guests
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
            A factual view of every guest&apos;s recorded stays, payments, last visit, and next arrival.
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
        <div className="flex flex-wrap divide-y divide-stoneWarm-200/70 sm:divide-x sm:divide-y-0">
          <SummaryMetric icon={<GuestIcon />} label="Total Guests" value={summary.totalGuests} detail="on record" />
          <SummaryMetric icon={<BedIcon />} label="Recorded Stays" value={summary.totalStays} detail="actual visits" />
          <SummaryMetric icon={<PaymentIcon />} label="Lifetime Spend" value={formatUgx(summary.lifetimeSpend)} detail="payments recorded" />
          <SummaryMetric icon={<ArrivalIcon />} label="Upcoming Arrivals" value={summary.upcomingArrivals} detail="future guests" />
        </div>
      </section>

      <div className="grid gap-5">
        <div className="grid gap-3 rounded-[22px] border border-stoneWarm-200/70 bg-[#fffdf8]/80 p-2 shadow-[0_10px_26px_rgba(55,43,30,0.05)] lg:grid-cols-[minmax(240px,0.75fr)_minmax(0,1.5fr)] lg:items-center">
          <label className="relative block">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-oliveMuted-500">
              <SearchIcon className="h-4 w-4" />
            </span>
            <input
              type="search"
              placeholder="Search name, email, or phone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-[15px] border border-stoneWarm-200/80 bg-white/70 py-2.5 pl-10 pr-4 text-sm text-[#2a241a] outline-none transition placeholder:text-oliveMuted-400 focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-400/15"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {sortTabs.map((tab) => {
              const active = sort === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSort(tab.key)}
                  aria-pressed={active}
                  className={`rounded-[15px] px-3.5 py-2.5 text-xs font-semibold transition sm:px-4 ${
                    active
                      ? "bg-oliveMuted-600 text-canvas-light shadow-[0_8px_20px_rgba(82,88,69,0.2)]"
                      : "text-oliveMuted-600 hover:bg-stoneWarm-100"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 px-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bronze-500">
              Guest directory
            </p>
            <p className="mt-1 text-sm text-oliveMuted-600">
              {displayed.length} {displayed.length === 1 ? "guest" : "guests"} in this view
            </p>
          </div>
        </div>

        {displayed.length === 0 ? (
          <EmptyState search={search} />
        ) : (
          <div className="grid gap-3.5">
            {displayed.map((guest) => (
              <GuestCard key={guest.guest_key} guest={guest} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
