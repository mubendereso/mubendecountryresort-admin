"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  duplicateRoomTypeAction,
  setRoomArchivedAction,
  setRoomPublicationAction
} from "@/lib/rooms/actions";
import { formatUgx } from "@/lib/rooms/format";
import type { RoomManagementRow, RoomManagementSummary } from "@/lib/rooms/types";

type StatusFilter = "all" | "published" | "draft" | "archived";
type InventoryFilter = "all" | "available" | "occupied" | "out_of_order";

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" strokeLinecap="round" />
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

function InventoryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path d="M5 20V8.5L12 4l7 4.5V20M3.5 20.5h17" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11h2v2H8zm6 0h2v2h-2zM8 16h2v2H8zm6 0h2v2h-2z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path d="M3.5 12s3.2-5 8.5-5 8.5 5 8.5 5-3.2 5-8.5 5-8.5-5-8.5-5Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <circle cx="4" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="16" cy="10" r="1.4" />
    </svg>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-4 sm:px-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-stoneWarm-100 text-oliveMuted-600">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[9px] font-semibold uppercase tracking-[0.15em] text-oliveMuted-500">
          {label}
        </span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className="font-serif text-2xl font-semibold text-[#2a241a]">{value}</span>
          <span className="truncate text-[10px] text-oliveMuted-500">{detail}</span>
        </span>
      </span>
    </div>
  );
}

function roomStatus(room: RoomManagementRow) {
  if (room.archived_at) {
    return {
      label: "Archived",
      style: "border-[#777086]/35 bg-[#777086]/12 text-[#5f586d]"
    };
  }
  if (room.is_published) {
    return {
      label: "Published",
      style: "border-[#72805b]/35 bg-[#72805b]/12 text-[#53613f]"
    };
  }
  return {
    label: "Draft",
    style: "border-[#9b8a6b]/35 bg-[#9b8a6b]/12 text-[#766448]"
  };
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function RoomImage({ room }: { room: RoomManagementRow }) {
  return (
    <div className="relative h-[84px] w-[96px] shrink-0 overflow-hidden rounded-[18px] bg-gradient-to-br from-stoneWarm-100 to-stoneWarm-200 shadow-inner sm:h-[96px] sm:w-[112px]">
      <div className="absolute inset-0 grid place-items-center text-oliveMuted-500">
        <BedIcon className="h-7 w-7" />
      </div>
      {room.image_url && (
        <img
          src={room.image_url}
          alt={`${room.title} room`}
          className="relative h-full w-full object-cover"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
      <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#fffdf8]/90 px-2 py-0.5 text-[8px] font-semibold text-[#2a241a] shadow-sm backdrop-blur">
        {room.gallery.length}
      </span>
    </div>
  );
}

function InventoryMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-[16px] bg-stoneWarm-100/55 px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-oliveMuted-500">{label}</p>
      <p className={`mt-1 font-serif text-xl font-semibold ${tone ?? "text-[#2a241a]"}`}>{value}</p>
    </div>
  );
}

function ActionForm({
  action,
  fields,
  children,
  danger = false
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  children: ReactNode;
  danger?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await action(formData);
        });
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        disabled={pending}
        className={`w-full rounded-xl px-3 py-2 text-left text-xs font-semibold transition disabled:opacity-50 ${
          danger ? "text-[#8b4d46] hover:bg-[#a4635b]/10" : "text-oliveMuted-600 hover:bg-stoneWarm-100"
        }`}
      >
        {pending ? "Working..." : children}
      </button>
    </form>
  );
}

function RoomActions({ room, canManage }: { room: RoomManagementRow; canManage: boolean }) {
  return (
    <details className="relative">
      <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-[14px] border border-stoneWarm-200 bg-white/70 text-oliveMuted-600 transition hover:bg-stoneWarm-100 [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Room actions</span>
        <MoreIcon />
      </summary>
      <div className="absolute right-0 top-12 z-30 w-52 rounded-[18px] border border-stoneWarm-200 bg-[#fffdf8] p-2 shadow-[0_18px_40px_rgba(55,43,30,0.16)]">
        <Link href={`/rooms/${room.slug}`} className="block rounded-xl px-3 py-2 text-xs font-semibold text-oliveMuted-600 hover:bg-stoneWarm-100">
          Edit Room
        </Link>
        <Link href={`/rooms/${room.slug}#amenities`} className="block rounded-xl px-3 py-2 text-xs font-semibold text-oliveMuted-600 hover:bg-stoneWarm-100">
          Manage Amenities
        </Link>
        <Link href={`/rooms/${room.slug}#photos`} className="block rounded-xl px-3 py-2 text-xs font-semibold text-oliveMuted-600 hover:bg-stoneWarm-100">
          Manage Photos
        </Link>
        <Link href="/calendar" className="block rounded-xl px-3 py-2 text-xs font-semibold text-oliveMuted-600 hover:bg-stoneWarm-100">
          View Calendar
        </Link>
        {canManage && (
          <>
            <div className="my-1 border-t border-stoneWarm-200/70" />
            <ActionForm
              action={duplicateRoomTypeAction}
              fields={{ id: room.id, slug: room.slug }}
            >
              Duplicate Room Type
            </ActionForm>
            {!room.archived_at && (
              <ActionForm
                action={setRoomPublicationAction}
                fields={{ id: room.id, slug: room.slug, published: String(!room.is_published) }}
              >
                {room.is_published ? "Move to Draft" : "Publish Room Type"}
              </ActionForm>
            )}
            <ActionForm
              action={setRoomArchivedAction}
              fields={{ id: room.id, slug: room.slug, archived: String(!room.archived_at) }}
              danger={!room.archived_at}
            >
              {room.archived_at ? "Restore Room Type" : "Archive Room Type"}
            </ActionForm>
          </>
        )}
      </div>
    </details>
  );
}

function RoomCard({ room, canManage }: { room: RoomManagementRow; canManage: boolean }) {
  const status = roomStatus(room);
  const amenities = room.amenities.slice(0, 4);

  return (
    <article className={`overflow-hidden rounded-[26px] border bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(55,43,30,0.11)] ${
      room.archived_at ? "border-[#777086]/25 opacity-85" : "border-stoneWarm-200/80"
    }`}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3 sm:gap-4">
          <RoomImage room={room} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.13em] ${status.style}`}>
                  {status.label}
                </span>
                <span className="truncate font-mono text-[10px] text-oliveMuted-500">/{room.slug}</span>
              </div>
              <h2 className="mt-3 font-serif text-2xl font-semibold text-[#2a241a]">{room.title}</h2>
              <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-oliveMuted-600">
                {room.description ?? "No room description has been added yet."}
              </p>
              </div>
              <RoomActions room={room} canManage={canManage} />
            </div>
          </div>
        </div>

        {amenities.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {amenities.map((amenity) => (
                <span key={amenity} className="rounded-full border border-stoneWarm-200/80 bg-stoneWarm-100/55 px-2.5 py-1 text-[10px] font-medium text-oliveMuted-600">
                  {amenity}
                </span>
              ))}
              {room.amenities.length > amenities.length && (
                <span className="rounded-full px-2 py-1 text-[10px] text-oliveMuted-500">
                  +{room.amenities.length - amenities.length} more
                </span>
              )}
            </div>
          ) : (
            <p className="mt-4 text-xs text-oliveMuted-500">No amenities listed.</p>
          )}

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            <div className="col-span-2 rounded-[16px] border border-stoneWarm-200/70 bg-white/55 px-3 py-3 sm:col-span-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-oliveMuted-500">Base Rate</p>
              <p className="mt-1 text-sm font-semibold text-[#2a241a]">{formatUgx(room.price_ugx)}</p>
            </div>
            <InventoryMetric label="Total" value={room.inventory_count} />
            <InventoryMetric label="Available" value={room.available_count} tone="text-[#3f562f]" />
            <InventoryMetric label="Occupied" value={room.occupied_count} tone="text-[#7b3732]" />
            <InventoryMetric label="Out of Order" value={room.out_of_order_count} tone="text-[#5f586d]" />
          </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stoneWarm-200/70 pt-4">
            <p className="text-[10px] text-oliveMuted-500">Updated {formatUpdated(room.updated_at)}</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/calendar"
                className="rounded-[14px] border border-stoneWarm-200 bg-white/65 px-3.5 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
              >
                Calendar
              </Link>
              <Link
                href={`/rooms/${room.slug}`}
                className="rounded-[14px] bg-oliveMuted-600 px-4 py-2 text-xs font-semibold text-canvas-light shadow-[0_8px_18px_rgba(82,88,69,0.2)] transition hover:bg-oliveMuted-500"
              >
                Edit Room
              </Link>
            </div>
        </div>
      </div>
    </article>
  );
}

function InventoryInsights({ summary }: { summary: RoomManagementSummary }) {
  const sellable = Math.max(summary.totalRooms - summary.outOfOrderRooms, 0);
  const occupiedPercent = sellable > 0 ? Math.min(Math.round((summary.occupiedRooms / sellable) * 100), 100) : 0;

  return (
    <aside className="rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_16px_38px_rgba(55,43,30,0.07)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Portfolio</p>
      <h2 className="mt-1 font-serif text-xl font-semibold text-[#2a241a]">Inventory Overview</h2>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {[
          ["Total Rooms", summary.totalRooms],
          ["Available", summary.availableRooms],
          ["Occupied", summary.occupiedRooms],
          ["Out of Order", summary.outOfOrderRooms]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[17px] bg-stoneWarm-100/55 p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-oliveMuted-500">{label}</p>
            <p className="mt-1 font-serif text-xl font-semibold text-[#2a241a]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-[18px] border border-stoneWarm-200/70 bg-white/55 p-4">
        <div className="flex items-end justify-between">
          <span className="text-xs font-semibold text-[#2a241a]">Occupied today</span>
          <span className="font-serif text-xl font-semibold text-[#2a241a]">{occupiedPercent}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stoneWarm-200/70">
          <div className="h-full rounded-full bg-oliveMuted-500" style={{ width: `${occupiedPercent}%` }} />
        </div>
      </div>
      <div className="mt-6">
        <p className="text-xs font-semibold text-[#2a241a]">Room Type Status</p>
        <div className="mt-3 grid gap-2">
          {[
            ["Published", summary.publishedRoomTypes, "bg-[#72805b]"],
            ["Draft", summary.draftRoomTypes, "bg-[#9b8a6b]"],
            ["Archived", summary.archivedRoomTypes, "bg-[#777086]"]
          ].map(([label, value, dot]) => (
            <div key={label} className="flex items-center justify-between rounded-[14px] bg-stoneWarm-100/45 px-3 py-2.5">
              <span className="inline-flex items-center gap-2 text-xs text-oliveMuted-600">
                <span className={`h-2 w-2 rounded-full ${dot}`} />
                {label}
              </span>
              <span className="text-sm font-semibold text-[#2a241a]">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function RoomsManagementClient({
  initialRooms,
  summary,
  canManage,
  message
}: {
  initialRooms: RoomManagementRow[];
  summary: RoomManagementSummary;
  canManage: boolean;
  message?: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>("all");

  const visibleRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return initialRooms.filter((room) => {
      const matchesSearch =
        !normalizedQuery ||
        room.title.toLowerCase().includes(normalizedQuery) ||
        room.slug.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "published" && room.is_published && !room.archived_at) ||
        (statusFilter === "draft" && !room.is_published && !room.archived_at) ||
        (statusFilter === "archived" && Boolean(room.archived_at));
      const matchesInventory =
        inventoryFilter === "all" ||
        (inventoryFilter === "available" && room.available_count > 0) ||
        (inventoryFilter === "occupied" &&
          room.inventory_count - room.out_of_order_count > 0 &&
          room.occupied_count >= room.inventory_count - room.out_of_order_count) ||
        (inventoryFilter === "out_of_order" && room.out_of_order_count > 0);
      return matchesSearch && matchesStatus && matchesInventory;
    });
  }, [initialRooms, inventoryFilter, query, statusFilter]);

  return (
    <section className="grid gap-6">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full border border-oliveMuted-400/10 bg-oliveMuted-400/5" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-oliveMuted-500">Hospitality products</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-[#2a241a] sm:text-4xl">Rooms Management</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600">
              Manage the room experiences guests can book, from rates and inventory to amenities, photography, and publication.
            </p>
          </div>
          {canManage && (
            <Link
              href="/rooms/new"
              className="inline-flex min-h-[50px] items-center gap-2 rounded-[17px] bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light shadow-[0_14px_30px_rgba(82,88,69,0.24)] transition hover:-translate-y-0.5 hover:bg-oliveMuted-500"
            >
              <PlusIcon />
              Add Room Type
            </Link>
          )}
        </div>
      </header>

      {message && (
        <div className="rounded-[18px] border border-[#72805b]/25 bg-[#72805b]/10 px-4 py-3 text-sm text-[#53613f]">
          {message}
        </div>
      )}

      <section className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-stoneWarm-200/70 sm:grid-cols-3 xl:grid-cols-5 xl:divide-y-0">
          <SummaryMetric icon={<BedIcon />} label="Room Types" value={summary.roomTypes} detail="active" />
          <SummaryMetric icon={<InventoryIcon />} label="Total Rooms" value={summary.totalRooms} detail="units" />
          <SummaryMetric icon={<InventoryIcon />} label="Available Rooms" value={summary.availableRooms} detail="today" />
          <SummaryMetric icon={<BedIcon />} label="Occupied Rooms" value={summary.occupiedRooms} detail="today" />
          <SummaryMetric icon={<EyeIcon />} label="Published" value={summary.publishedRoomTypes} detail="room types" />
        </div>
      </section>

      {canManage && (
        <section className="flex flex-wrap gap-2 rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8]/80 p-3 shadow-[0_10px_26px_rgba(55,43,30,0.05)]">
          <Link href="/rooms/import" className="rounded-[14px] border border-stoneWarm-200 bg-white/65 px-4 py-2.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100">
            Import Rooms
          </Link>
          <Link href="/rooms/bulk-rates" className="rounded-[14px] border border-stoneWarm-200 bg-white/65 px-4 py-2.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100">
            Bulk Update Rates
          </Link>
          <Link href="/rooms/amenities" className="rounded-[14px] border border-stoneWarm-200 bg-white/65 px-4 py-2.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100">
            Manage Amenities
          </Link>
        </section>
      )}

      <section className="rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8]/85 p-3 shadow-[0_12px_30px_rgba(55,43,30,0.05)] sm:p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(230px,0.65fr)_minmax(0,1fr)_minmax(0,0.8fr)] xl:items-center">
          <label className="relative min-w-0">
            <span className="sr-only">Search room name or slug</span>
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-oliveMuted-500">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search room name or slug"
              className="w-full rounded-[15px] border border-stoneWarm-200 bg-white/70 py-2.5 pl-10 pr-4 text-sm text-[#2a241a] outline-none transition placeholder:text-oliveMuted-400 focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-400/10"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All Room Types"],
              ["published", "Published"],
              ["draft", "Draft"],
              ["archived", "Archived"]
            ] as [StatusFilter, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`rounded-[14px] px-3.5 py-2.5 text-xs font-semibold transition ${
                  statusFilter === id
                    ? "bg-oliveMuted-600 text-canvas-light shadow-[0_8px_18px_rgba(82,88,69,0.2)]"
                    : "border border-stoneWarm-200 bg-white/60 text-oliveMuted-600 hover:bg-stoneWarm-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={inventoryFilter}
            onChange={(event) => setInventoryFilter(event.target.value as InventoryFilter)}
            className="w-full rounded-[15px] border border-stoneWarm-200 bg-white/70 px-3.5 py-2.5 text-xs font-semibold text-oliveMuted-600 outline-none focus:border-oliveMuted-400"
          >
            <option value="all">All Inventory</option>
            <option value="available">Available Inventory</option>
            <option value="occupied">Fully Occupied</option>
            <option value="out_of_order">Out of Order</option>
          </select>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid min-w-0 gap-4">
          {visibleRooms.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-6 py-12 text-center shadow-[0_12px_30px_rgba(55,43,30,0.04)]">
              <h2 className="font-serif text-xl font-semibold text-[#2a241a]">No room types match</h2>
              <p className="mt-2 text-sm text-oliveMuted-600">Try a different search or inventory filter.</p>
            </div>
          ) : (
            visibleRooms.map((room) => <RoomCard key={room.id} room={room} canManage={canManage} />)
          )}
        </div>
        <InventoryInsights summary={summary} />
      </div>
    </section>
  );
}
