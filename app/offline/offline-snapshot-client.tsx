"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getOfflineSnapshotData,
  refreshOfflineSnapshots
} from "@/lib/offline-snapshots/client";
import { SecureSignOutButton } from "@/components/secure-sign-out-button";
import { OfflineAccessLockedError } from "@/lib/local-db/security";
import {
  OFFLINE_ACCESS_LOCKED_VALUE,
  OFFLINE_ACCESS_STORAGE_KEY
} from "@/lib/local-db/security-policy";
import type {
  BookingSnapshot,
  OfflineSnapshotData,
  PaymentReceiptSnapshot,
  ReservationGroupSnapshot,
  RoomUnitSnapshot
} from "@/lib/offline-snapshots/types";
import { OfflineMaintenance } from "./offline-maintenance";

type Tab = "front-desk" | "bookings" | "folios" | "groups" | "rooms" | "maintenance";

const ACTION_MESSAGE = "This action requires an internet connection.";

function todayIsoKampala(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-UG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala"
  }).format(date);
}

function formatUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function DisabledAction({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      title={ACTION_MESSAGE}
      className="rounded-md border border-stoneWarm-200 bg-stoneWarm-100 px-3 py-2 text-xs font-semibold text-oliveMuted-500 opacity-70"
    >
      {label}
    </button>
  );
}

function SnapshotShell({
  title,
  lastSyncedAt,
  children
}: {
  title: string;
  lastSyncedAt: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stoneWarm-200 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bronze-500">
            Offline Snapshot
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-[#2a241a]">{title}</h2>
        </div>
        <p className="text-xs text-oliveMuted-600">Last Sync: {formatDateTime(lastSyncedAt)}</p>
      </div>
      {children}
    </section>
  );
}

function BookingLine({ booking }: { booking: BookingSnapshot }) {
  return (
    <article className="grid gap-3 rounded-md border border-stoneWarm-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold text-oliveMuted-500">
            {booking.booking_reference}
          </p>
          <h3 className="mt-1 font-semibold text-[#2a241a]">{booking.guest_name}</h3>
          <p className="mt-1 text-sm text-oliveMuted-600">
            {booking.room_type_name}
            {booking.room_unit_name ? ` - ${booking.room_unit_name}` : ""}
          </p>
          {booking.group_name && (
            <p className="mt-1 text-xs text-oliveMuted-500">Group: {booking.group_name}</p>
          )}
        </div>
        <span className="rounded-md bg-stoneWarm-100 px-2.5 py-1 text-xs font-semibold capitalize text-oliveMuted-600">
          {statusLabel(booking.status)}
        </span>
      </div>
      <div className="grid gap-2 text-sm text-oliveMuted-700 sm:grid-cols-3">
        <span>{formatDate(booking.check_in)} to {formatDate(booking.check_out)}</span>
        <span>{booking.guest_phone ?? booking.guest_email ?? "No contact saved"}</span>
        <span>Balance: {formatUgx(booking.balance_due)}</span>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-stoneWarm-100 pt-3">
        <DisabledAction label="Check in" />
        <DisabledAction label="Check out" />
        <DisabledAction label="No-show" />
        <DisabledAction label="Assign room" />
      </div>
      <p className="text-xs text-amber-800">{ACTION_MESSAGE}</p>
    </article>
  );
}

function FrontDeskSnapshot({
  data,
  today
}: {
  data: OfflineSnapshotData;
  today: string;
}) {
  const arrivals = data.bookings.filter((booking) => booking.check_in === today && booking.status === "confirmed");
  const departures = data.bookings.filter((booking) => booking.check_out === today && booking.status === "checked_in");
  const inHouse = data.bookings.filter((booking) => booking.status === "checked_in");

  return (
    <SnapshotShell title="Front Desk" lastSyncedAt={data.last_synced_at}>
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Arrivals" value={arrivals.length} />
        <SummaryTile label="Departures" value={departures.length} />
        <SummaryTile label="In-house" value={inHouse.length} />
      </div>
      <SnapshotList title="Arrivals" items={arrivals} />
      <SnapshotList title="Departures" items={departures} />
      <SnapshotList title="In-house Guests" items={inHouse} />
    </SnapshotShell>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-stoneWarm-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#2a241a]">{value}</p>
    </div>
  );
}

function SnapshotList({ title, items }: { title: string; items: BookingSnapshot[] }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-oliveMuted-600">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-stoneWarm-300 p-4 text-sm text-oliveMuted-600">
          No cached records in this section.
        </p>
      ) : (
        items.map((booking) => <BookingLine key={`${title}-${booking.id}`} booking={booking} />)
      )}
    </section>
  );
}

function BookingLookup({ data, search }: { data: OfflineSnapshotData; search: string }) {
  const needle = search.trim().toLowerCase();
  const bookings = data.bookings.filter((booking) => {
    if (!needle) return true;
    return [
      booking.booking_reference,
      booking.guest_name,
      booking.guest_phone,
      booking.guest_email,
      booking.room_type_name,
      booking.group_name
    ].some((value) => value?.toLowerCase().includes(needle));
  });

  return (
    <SnapshotShell title="Booking Lookup" lastSyncedAt={data.last_synced_at}>
      <SnapshotList title={`${bookings.length} Cached Bookings`} items={bookings.slice(0, 80)} />
    </SnapshotShell>
  );
}

function FolioSnapshotView({ data, search }: { data: OfflineSnapshotData; search: string }) {
  const bookingById = new Map(data.bookings.map((booking) => [booking.id, booking]));
  const receiptByBooking = data.payment_receipts.reduce((map, receipt) => {
    const list = map.get(receipt.booking_id) ?? [];
    list.push(receipt);
    map.set(receipt.booking_id, list);
    return map;
  }, new Map<string, PaymentReceiptSnapshot[]>());
  const needle = search.trim().toLowerCase();
  const folios = data.folios.filter((folio) => {
    const booking = bookingById.get(folio.booking_id);
    if (!needle) return true;
    return [booking?.booking_reference, booking?.guest_name].some((value) =>
      value?.toLowerCase().includes(needle)
    );
  });

  return (
    <SnapshotShell title="Folios and Receipts" lastSyncedAt={data.last_synced_at}>
      <div className="grid gap-3">
        {folios.length === 0 ? (
          <p className="rounded-md border border-dashed border-stoneWarm-300 p-4 text-sm text-oliveMuted-600">
            No cached folio summaries match this search.
          </p>
        ) : (
          folios.slice(0, 80).map((folio) => {
            const booking = bookingById.get(folio.booking_id);
            const receipts = receiptByBooking.get(folio.booking_id) ?? [];
            return (
              <article key={folio.booking_id} className="grid gap-3 rounded-md border border-stoneWarm-200 bg-white p-4">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-semibold text-oliveMuted-500">
                      {booking?.booking_reference ?? folio.booking_id}
                    </p>
                    <h3 className="mt-1 font-semibold">{booking?.guest_name ?? "Cached booking"}</h3>
                  </div>
                  <p className="text-sm font-semibold text-[#2a241a]">
                    Balance {formatUgx(folio.balance_due)}
                  </p>
                </div>
                <div className="grid gap-2 text-sm text-oliveMuted-700 sm:grid-cols-3">
                  <span>Charges: {formatUgx(folio.total_charges)}</span>
                  <span>Paid: {formatUgx(folio.total_paid)}</span>
                  <span>Receipts: {receipts.length}</span>
                </div>
                {receipts.length > 0 && (
                  <div className="grid gap-1 border-t border-stoneWarm-100 pt-3 text-xs text-oliveMuted-600">
                    {receipts.slice(0, 3).map((receipt) => (
                      <span key={receipt.id}>
                        {receipt.receipt_number} - {formatUgx(receipt.amount)} - {receipt.payment_method}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <DisabledAction label="Add charge" />
                  <DisabledAction label="Record payment" />
                  <DisabledAction label="Issue receipt" />
                </div>
                <p className="text-xs text-amber-800">{ACTION_MESSAGE}</p>
              </article>
            );
          })
        )}
      </div>
    </SnapshotShell>
  );
}

function GroupsSnapshot({ data, search }: { data: OfflineSnapshotData; search: string }) {
  const needle = search.trim().toLowerCase();
  const groups = data.reservation_groups.filter((group) =>
    !needle ? true : group.name.toLowerCase().includes(needle)
  );

  return (
    <SnapshotShell title="Groups" lastSyncedAt={data.last_synced_at}>
      <div className="grid gap-3">
        {groups.length === 0 ? (
          <p className="rounded-md border border-dashed border-stoneWarm-300 p-4 text-sm text-oliveMuted-600">
            No cached groups match this search.
          </p>
        ) : (
          groups.map((group) => <GroupLine key={group.id} group={group} />)
        )}
      </div>
    </SnapshotShell>
  );
}

function GroupLine({ group }: { group: ReservationGroupSnapshot }) {
  return (
    <article className="grid gap-3 rounded-md border border-stoneWarm-200 bg-white p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-semibold">{group.name}</h3>
          <p className="mt-1 text-sm text-oliveMuted-600">
            {formatDate(group.check_in)} to {formatDate(group.check_out)}
          </p>
        </div>
        <span className="rounded-md bg-stoneWarm-100 px-2.5 py-1 text-xs font-semibold capitalize text-oliveMuted-600">
          {group.status}
        </span>
      </div>
      <div className="grid gap-2 text-sm text-oliveMuted-700 sm:grid-cols-2">
        <span>{group.member_booking_count} member bookings</span>
        <span>Balance: {formatUgx(group.balance_due)}</span>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-stoneWarm-100 pt-3">
        <DisabledAction label="Edit group" />
        <DisabledAction label="Create room block" />
        <DisabledAction label="Release room block" />
      </div>
      <p className="text-xs text-amber-800">{ACTION_MESSAGE}</p>
    </article>
  );
}

function RoomsSnapshot({ data }: { data: OfflineSnapshotData }) {
  const typeById = new Map(data.room_types.map((roomType) => [roomType.id, roomType]));
  const grouped = data.room_units.reduce((map, unit) => {
    const roomType = typeById.get(unit.room_type_id)?.name ?? "Unassigned room type";
    const list = map.get(roomType) ?? [];
    list.push(unit);
    map.set(roomType, list);
    return map;
  }, new Map<string, RoomUnitSnapshot[]>());

  return (
    <SnapshotShell title="Rooms" lastSyncedAt={data.last_synced_at}>
      <div className="grid gap-3">
        {Array.from(grouped.entries()).map(([roomType, units]) => (
          <section key={roomType} className="rounded-md border border-stoneWarm-200 bg-white p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <h3 className="font-semibold">{roomType}</h3>
              <span className="text-sm text-oliveMuted-600">{units.length} rooms</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {units.map((unit) => (
                <span key={unit.id} className="rounded-md border border-stoneWarm-200 px-3 py-2 text-xs capitalize text-oliveMuted-700">
                  {unit.room_name}: {statusLabel(unit.housekeeping_status)}
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <DisabledAction label="Assign room" />
              <DisabledAction label="Edit inventory" />
            </div>
          </section>
        ))}
      </div>
    </SnapshotShell>
  );
}

export function OfflineSnapshotClient() {
  const [data, setData] = useState<OfflineSnapshotData | null>(null);
  const [accessLocked, setAccessLocked] = useState(false);
  const [tab, setTab] = useState<Tab>("front-desk");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const today = useMemo(todayIsoKampala, []);

  async function loadCachedData(): Promise<boolean> {
    try {
      const cached = await getOfflineSnapshotData();
      setData(cached);
      setAccessLocked(false);
      return true;
    } catch (error) {
      if (error instanceof OfflineAccessLockedError) {
        setData(null);
        setAccessLocked(true);
        return false;
      }
      throw error;
    }
  }

  async function refresh() {
    setMessage(null);
    if (!navigator.onLine) {
      const available = await loadCachedData();
      setMessage(
        available
          ? "Offline Mode: using the last cached snapshot. Data may be outdated."
          : "Offline data is locked. Sign in while online to enable it."
      );
      return;
    }
    try {
      await refreshOfflineSnapshots();
      await loadCachedData();
      setMessage("Snapshot refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to refresh snapshot.");
      await loadCachedData();
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (new URLSearchParams(window.location.search).get("tab") === "maintenance") {
      setTab("maintenance");
    }
    if (new URLSearchParams(window.location.search).get("signedOut") === "1") {
      setMessage("Signed out on this device. Offline data was erased.");
    }
    (async () => {
      try {
        await loadCachedData();
      } catch {
        if (!cancelled) setMessage("No offline snapshot is available on this device yet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === OFFLINE_ACCESS_STORAGE_KEY &&
        event.newValue === OFFLINE_ACCESS_LOCKED_VALUE
      ) {
        setData(null);
        setAccessLocked(true);
        setMessage("Signed out on this device. Offline data was erased.");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "front-desk", label: "Front Desk" },
    { key: "bookings", label: "Bookings" },
    { key: "folios", label: "Folios" },
    { key: "groups", label: "Groups" },
    { key: "rooms", label: "Rooms" },
    { key: "maintenance", label: "Maintenance" }
  ];

  if (accessLocked) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas-light px-4 py-10 text-[#2a241a]">
        <section className="surface-card w-full max-w-lg rounded-[32px] px-6 py-8 text-center sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-bronze-500">
            Mubende Country Resort
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Offline data is locked</h1>
          <p className="mt-4 text-sm leading-6 text-oliveMuted-600">
            No guest, payment, or maintenance records are available after sign-out.
            Sign in while online, then refresh to prepare this device for offline use.
          </p>
          {message ? <p className="mt-4 text-sm text-oliveMuted-700">{message}</p> : null}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-oliveMuted-500"
            >
              Enable after sign-in
            </button>
            <a
              href="/login"
              className="rounded-md border border-stoneWarm-300 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-700 transition hover:bg-stoneWarm-100"
            >
              Go to sign in
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas-light px-4 py-6 text-[#2a241a] sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6">
        <header className="grid gap-4 border-b border-stoneWarm-200 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-bronze-500">
                Mubende Country Resort
              </p>
              <h1 className="mt-2 text-3xl font-semibold">Offline Mode</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-oliveMuted-600">
                Cached front-desk data is read-only. Maintenance work can be saved offline and queued for sync.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-md border border-stoneWarm-300 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-700 transition hover:bg-stoneWarm-100"
              >
                Refresh snapshot
              </button>
              <SecureSignOutButton
                label="Sign out and clear device"
                onLocalSignedOut={() => {
                  setData(null);
                  setAccessLocked(true);
                  setMessage("Signed out on this device. Offline data was erased.");
                }}
                className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
              />
            </div>
          </div>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>Offline Snapshot</strong>
            <span className="ml-2">Last Sync: {formatDateTime(data?.last_synced_at ?? null)}.</span>
          </div>
          {message && <p className="text-sm text-oliveMuted-700">{message}</p>}
        </header>

        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                tab === item.key
                  ? "border-oliveMuted-500 bg-oliveMuted-500 text-white"
                  : "border-stoneWarm-200 bg-white text-oliveMuted-700 hover:bg-stoneWarm-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab !== "front-desk" && tab !== "rooms" && tab !== "maintenance" && (
          <label className="grid gap-1 text-sm font-semibold text-oliveMuted-700">
            Search cached records
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-md border border-stoneWarm-200 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-400/20"
              placeholder="Reference, guest, group, or phone"
            />
          </label>
        )}

        {loading && <p className="text-sm text-oliveMuted-600">Loading cached snapshot...</p>}
        {!loading && !data && (
          <p className="rounded-md border border-dashed border-stoneWarm-300 p-4 text-sm text-oliveMuted-600">
            No offline snapshot is available on this device yet. Open the admin while online to populate it.
          </p>
        )}
        {data && tab === "front-desk" && <FrontDeskSnapshot data={data} today={today} />}
        {data && tab === "bookings" && <BookingLookup data={data} search={search} />}
        {data && tab === "folios" && <FolioSnapshotView data={data} search={search} />}
        {data && tab === "groups" && <GroupsSnapshot data={data} search={search} />}
        {data && tab === "rooms" && <RoomsSnapshot data={data} />}
        {tab === "maintenance" && <OfflineMaintenance />}
      </div>
    </main>
  );
}
