"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  CalendarBooking,
  CalendarCell,
  CalendarRoomType,
  OccupancyCalendarData
} from "@/lib/calendar/data";
import type { BookingStatus } from "@/lib/bookings/types";

type Selection = {
  roomTypeId: string;
  date: string;
};

type InventoryFilter = "all" | "available" | "partial" | "full" | "out_of_order";

const FILTERS: { id: InventoryFilter; label: string }[] = [
  { id: "all", label: "All Room Types" },
  { id: "available", label: "Free Inventory" },
  { id: "partial", label: "Partially Occupied" },
  { id: "full", label: "Occupied" },
  { id: "out_of_order", label: "Out of Order" }
];

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Payment Pending",
  awaiting_confirmation: "Awaiting Review",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  cancelled: "Cancelled",
  no_show: "No Show",
  refunded: "Refunded"
};

const STATUS_STYLE: Record<BookingStatus, string> = {
  pending_payment: "border-bronze-400/30 bg-bronze-400/10 text-bronze-500",
  awaiting_confirmation: "border-[#9b8a6b]/30 bg-[#9b8a6b]/10 text-[#766448]",
  confirmed: "border-[#72805b]/30 bg-[#72805b]/10 text-[#53613f]",
  checked_in: "border-[#4f7770]/30 bg-[#4f7770]/10 text-[#365d57]",
  checked_out: "border-[#777086]/30 bg-[#777086]/10 text-[#5f586d]",
  cancelled: "border-[#a4635b]/30 bg-[#a4635b]/10 text-[#8b4d46]",
  no_show: "border-[#a27b58]/25 bg-[#a27b58]/10 text-[#815f42]",
  refunded: "border-stoneWarm-300/70 bg-stoneWarm-100/80 text-stoneWarm-500"
};

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: string, includeYear = false): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    ...(includeYear ? { year: "numeric" as const } : {})
  }).format(parseDate(value));
}

function formatWeekday(value: string): string {
  return new Intl.DateTimeFormat("en-UG", { weekday: "short" }).format(parseDate(value));
}

function relativeDay(value: string, today: string): string {
  const difference = Math.round(
    (parseDate(value).getTime() - parseDate(today).getTime()) / 86400000
  );
  if (difference === 0) return "Today";
  if (difference === 1) return "Tomorrow";
  return formatWeekday(value);
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function stayNights(booking: CalendarBooking): number {
  const start = new Date(`${booking.checkIn}T00:00:00Z`);
  const end = new Date(`${booking.checkOut}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function cellState(cell: CalendarCell, roomType: CalendarRoomType) {
  if (roomType.sellableInventory <= 0) {
    return {
      label: "Out of order",
      shortLabel: "Out",
      tone: "border-[#655c72]/70 bg-[#d5cfdd] text-[#453e52]",
      labelText: "text-[#514a5e]",
      dot: "bg-[#655c72]"
    };
  }
  if (cell.occupied >= roomType.sellableInventory) {
    return {
      label: "Occupied",
      shortLabel: "Occupied",
      tone: "border-[#a44f48]/70 bg-[#ebc5bf] text-[#702f2b]",
      labelText: "text-[#7b3732]",
      dot: "bg-[#a44f48]"
    };
  }
  if (cell.occupied > 0) {
    return {
      label: "Partially occupied",
      shortLabel: `${cell.available} free`,
      tone: "border-[#39728d]/70 bg-[#c7dfe9] text-[#285468]",
      labelText: "text-[#315d70]",
      dot: "bg-[#39728d]"
    };
  }
  return {
    label: "Free",
    shortLabel: `${cell.available} free`,
    tone: "border-[#4f7139]/70 bg-[#cfe1bd] text-[#354d27]",
    labelText: "text-[#3f562f]",
    dot: "bg-[#4f7139]"
  };
}

function roomMatchesFilter(roomType: CalendarRoomType, filter: InventoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "out_of_order") return roomType.outOfOrderCount > 0;
  if (filter === "available") {
    return roomType.cells.some(
      (cell) => roomType.sellableInventory > 0 && cell.occupied < roomType.sellableInventory
    );
  }
  if (filter === "partial") {
    return roomType.cells.some(
      (cell) => cell.occupied > 0 && cell.occupied < roomType.sellableInventory
    );
  }
  return roomType.cells.some(
    (cell) => roomType.sellableInventory > 0 && cell.occupied >= roomType.sellableInventory
  );
}

function bookingsForSelection(
  bookings: CalendarBooking[],
  selection: Selection
): CalendarBooking[] {
  return bookings.filter(
    (booking) =>
      booking.roomTypeId === selection.roomTypeId &&
      booking.checkIn <= selection.date &&
      booking.checkOut > selection.date
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

function CalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path d="M8 3.5v4m8-4v4M3.5 10h17" strokeLinecap="round" />
    </svg>
  );
}

function ArrivalIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v3h14v-3" strokeLinecap="round" />
    </svg>
  );
}

function DepartureIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M12 15V4m0 0 4 4m-4-4L8 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v3h14v-3" strokeLinecap="round" />
    </svg>
  );
}

function InventoryIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M5 20V8.5L12 4l7 4.5V20M3.5 20.5h17" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11h2v2H8zm6 0h2v2h-2zM8 16h2v2H8zm6 0h2v2h-2z" />
    </svg>
  );
}

function PercentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="m7 17 10-10" strokeLinecap="round" />
      <circle cx="7.5" cy="7.5" r="2" />
      <circle cx="16.5" cy="16.5" r="2" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={`h-4 w-4 ${direction === "right" ? "rotate-180" : ""}`}
    >
      <path d="m12.5 4.5-5 5.5 5 5.5" strokeLinecap="round" strokeLinejoin="round" />
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
  value: string | number;
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

function RoomThumbnail({
  roomType,
  compact = false
}: {
  roomType: CalendarRoomType;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-gradient-to-br from-stoneWarm-100 to-stoneWarm-200 shadow-inner ${
        compact ? "h-14 w-14 rounded-[16px]" : "h-[72px] w-[84px] rounded-[18px]"
      }`}
    >
      <div className="absolute inset-0 grid place-items-center text-oliveMuted-500">
        <BedIcon className={compact ? "h-6 w-6" : "h-7 w-7"} />
      </div>
      {roomType.imageUrl && (
        <img
          src={roomType.imageUrl}
          alt={`${roomType.title} room`}
          className="relative h-full w-full object-cover"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
    </div>
  );
}

function MovementBadges({ cell }: { cell: CalendarCell }) {
  if (cell.arrivals === 0 && cell.departures === 0 && cell.pending === 0 && cell.awaiting === 0) {
    return null;
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      {cell.arrivals > 0 && (
        <span className="rounded-full bg-[#72805b]/10 px-1.5 py-0.5 text-[8px] font-semibold text-[#53613f]">
          A {cell.arrivals}
        </span>
      )}
      {cell.departures > 0 && (
        <span className="rounded-full bg-[#557a89]/10 px-1.5 py-0.5 text-[8px] font-semibold text-[#3d6575]">
          D {cell.departures}
        </span>
      )}
      {(cell.pending > 0 || cell.awaiting > 0) && (
        <span className="h-1.5 w-1.5 rounded-full bg-bronze-400" title="Payment hold or review pending" />
      )}
    </span>
  );
}

function InventoryCell({
  roomType,
  cell,
  selected,
  onSelect
}: {
  roomType: CalendarRoomType;
  cell: CalendarCell;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = cellState(cell, roomType);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${roomType.title}, ${formatDate(cell.date, true)}: ${cell.occupied} of ${roomType.sellableInventory} occupied, ${state.label}`}
      className={`flex h-[68px] min-w-[72px] flex-col items-center justify-center gap-1 rounded-[15px] border text-center transition hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-oliveMuted-400/30 ${
        selected ? "ring-2 ring-oliveMuted-500/50 shadow-sm" : ""
      } ${state.tone}`}
    >
      <span className="font-serif text-lg font-semibold leading-none">
        {cell.occupied}/{roomType.sellableInventory}
      </span>
      <MovementBadges cell={cell} />
    </button>
  );
}

function MobileAvailabilityRow({
  roomType,
  cell,
  today,
  selected,
  onSelect
}: {
  roomType: CalendarRoomType;
  cell: CalendarCell;
  today: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = cellState(cell, roomType);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-3 rounded-[16px] border px-3.5 py-3 text-left transition ${
        selected ? "border-oliveMuted-400 bg-oliveMuted-400/10 ring-2 ring-oliveMuted-400/10" : "border-stoneWarm-200/70 bg-white/60"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#2a241a]">
          {relativeDay(cell.date, today)}
          <span className="ml-2 font-normal text-oliveMuted-500">{formatDate(cell.date)}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${state.dot}`} />
          <span className={`text-xs font-medium ${state.labelText}`}>{state.shortLabel}</span>
          <MovementBadges cell={cell} />
        </span>
      </span>
      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${state.tone}`}>
        {cell.occupied}/{roomType.sellableInventory}
      </span>
    </button>
  );
}

function BookingCard({ booking }: { booking: CalendarBooking }) {
  const guests =
    `${booking.guestsAdults} adult${booking.guestsAdults === 1 ? "" : "s"}` +
    (booking.guestsChildren > 0
      ? `, ${booking.guestsChildren} child${booking.guestsChildren === 1 ? "" : "ren"}`
      : "");

  return (
    <article className="rounded-[20px] border border-stoneWarm-200/70 bg-white/65 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-serif text-lg font-semibold text-[#2a241a]">{booking.guestFullName}</p>
          <p className="mt-1 text-sm text-oliveMuted-600">
            {formatDate(booking.checkIn)} to {formatDate(booking.checkOut)} · {stayNights(booking)}{" "}
            {stayNights(booking) === 1 ? "night" : "nights"}
          </p>
          <p className="mt-1 text-xs text-oliveMuted-500">{guests}</p>
          {booking.guestPhone && <p className="mt-1 text-xs text-oliveMuted-500">{booking.guestPhone}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${STATUS_STYLE[booking.status]}`}>
            {STATUS_LABEL[booking.status]}
          </span>
          <p className="text-sm font-semibold text-[#2a241a]">{formatUgx(booking.quotedTotalUgx)}</p>
          <Link href={`/bookings/${booking.id}/edit`} className="text-xs font-semibold text-oliveMuted-600 underline decoration-stoneWarm-300 underline-offset-4">
            Edit {booking.reference}
          </Link>
        </div>
      </div>
    </article>
  );
}

function Legend() {
  const items = [
    { label: "Free", dot: "bg-[#4f7139] ring-[#cfe1bd]" },
    { label: "Partially Occupied", dot: "bg-[#39728d] ring-[#c7dfe9]" },
    { label: "Occupied", dot: "bg-[#a44f48] ring-[#ebc5bf]" },
    { label: "Out of Order", dot: "bg-[#655c72] ring-[#ddd9e3]" }
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-oliveMuted-600">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-offset-1 ring-offset-[#fffdf8] ${item.dot}`} />
          {item.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-bronze-400" />
        Hold / review
      </span>
      <span>A = Arrival</span>
      <span>D = Departure</span>
    </div>
  );
}

function OccupancyInsights({ data }: { data: OccupancyCalendarData }) {
  const trend = data.dates.slice(0, 7).map((date) => {
    const occupied = data.roomTypes.reduce(
      (sum, roomType) => sum + (roomType.cells.find((cell) => cell.date === date)?.occupied ?? 0),
      0
    );
    const sellable = data.roomTypes.reduce((sum, roomType) => sum + roomType.sellableInventory, 0);
    return {
      date,
      occupied,
      percent: sellable > 0 ? Math.round((occupied / sellable) * 100) : 0
    };
  });

  return (
    <aside className="rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_16px_38px_rgba(55,43,30,0.07)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Today</p>
      <h2 className="mt-1 font-serif text-xl font-semibold text-[#2a241a]">Occupancy Insights</h2>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {[
          ["Occupancy", `${data.summary.occupancyPercent}%`],
          ["Available", data.summary.available],
          ["Occupied", data.summary.occupied],
          ["Out of Order", data.summary.outOfOrder]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[17px] bg-stoneWarm-100/50 p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-oliveMuted-500">{label}</p>
            <p className="mt-1 font-serif text-xl font-semibold text-[#2a241a]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[#2a241a]">7-day occupancy</p>
          <p className="text-[10px] text-oliveMuted-500">Room nights</p>
        </div>
        <div className="mt-3 flex h-28 items-end gap-2 rounded-[18px] bg-stoneWarm-100/45 px-3 pb-2 pt-4">
          {trend.map((day) => (
            <div key={day.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[8px] font-semibold text-oliveMuted-500">{day.percent}%</span>
              <span
                className="w-full min-h-[4px] rounded-t-lg bg-oliveMuted-500/75"
                style={{ height: `${Math.max(day.percent, 4)}%` }}
                title={`${day.occupied} occupied`}
              />
              <span className="text-[8px] text-oliveMuted-500">{formatWeekday(day.date).slice(0, 1)}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function CalendarClient({ initialData }: { initialData: OccupancyCalendarData }) {
  const router = useRouter();
  const firstRoomType = initialData.roomTypes[0];
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [jumpDate, setJumpDate] = useState(initialData.startDate);
  const [selection, setSelection] = useState<Selection | null>(
    firstRoomType ? { roomTypeId: firstRoomType.id, date: initialData.startDate } : null
  );

  const visibleRoomTypes = useMemo(
    () => initialData.roomTypes.filter((roomType) => roomMatchesFilter(roomType, filter)),
    [filter, initialData.roomTypes]
  );
  const selectedRoomType = useMemo(
    () => initialData.roomTypes.find((roomType) => roomType.id === selection?.roomTypeId) ?? null,
    [initialData.roomTypes, selection]
  );
  const selectedCell = useMemo(
    () => selectedRoomType?.cells.find((cell) => cell.date === selection?.date) ?? null,
    [selectedRoomType, selection]
  );
  const selectedBookings = useMemo(
    () => (selection ? bookingsForSelection(initialData.bookings, selection) : []),
    [initialData.bookings, selection]
  );

  function jumpToDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (jumpDate) router.push(`/calendar?start=${jumpDate}`);
  }

  return (
    <section className="grid gap-6">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full border border-oliveMuted-400/10 bg-oliveMuted-400/5" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-oliveMuted-500">Room inventory</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-[#2a241a] sm:text-4xl">Availability Calendar</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600">
              See what can be sold now, where inventory is tightening, and today&apos;s guest movement.
            </p>
          </div>
          <Link
            href="/bookings"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-[17px] border border-stoneWarm-200 bg-[#fffdf8]/80 px-4 py-2.5 text-sm font-semibold text-oliveMuted-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          >
            View Bookings
          </Link>
        </div>
      </header>

      <section className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-stoneWarm-200/70 sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
          <SummaryMetric icon={<InventoryIcon />} label="Total Rooms" value={initialData.summary.totalRooms} detail="units" />
          <SummaryMetric icon={<BedIcon />} label="Occupied" value={initialData.summary.occupied} detail="today" />
          <SummaryMetric icon={<InventoryIcon />} label="Available" value={initialData.summary.available} detail="sellable" />
          <SummaryMetric icon={<PercentIcon />} label="Occupancy" value={`${initialData.summary.occupancyPercent}%`} detail="today" />
          <SummaryMetric icon={<ArrivalIcon />} label="Arrivals Today" value={initialData.summary.arrivals} detail="expected" />
          <SummaryMetric icon={<DepartureIcon />} label="Departures Today" value={initialData.summary.departures} detail="expected" />
        </div>
      </section>

      <section className="rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8]/85 p-3 shadow-[0_12px_30px_rgba(55,43,30,0.05)] sm:p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-[14px] px-3.5 py-2.5 text-xs font-semibold transition ${
                  filter === item.id
                    ? "bg-oliveMuted-600 text-canvas-light shadow-[0_8px_18px_rgba(82,88,69,0.2)]"
                    : "border border-stoneWarm-200 bg-white/60 text-oliveMuted-600 hover:bg-stoneWarm-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/calendar?start=${addDays(initialData.startDate, -14)}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-[14px] border border-stoneWarm-200 bg-white/70 px-3 py-2.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
              >
                <ChevronIcon direction="left" />
                Previous
              </Link>
              <Link
                href={`/calendar?start=${addDays(initialData.startDate, 14)}`}
                className="inline-flex items-center justify-center gap-1.5 rounded-[14px] border border-stoneWarm-200 bg-white/70 px-3 py-2.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
              >
                Next
                <ChevronIcon direction="right" />
              </Link>
            </div>
            <form onSubmit={jumpToDate} className="flex min-w-0 items-center gap-2">
              <label className="relative min-w-0 flex-1 sm:w-40 sm:flex-none">
                <span className="sr-only">Jump to date</span>
                <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-oliveMuted-500" />
                <input
                  type="date"
                  value={jumpDate}
                  onChange={(event) => setJumpDate(event.target.value)}
                  className="w-full rounded-[14px] border border-stoneWarm-200 bg-white/70 py-2.5 pl-9 pr-2 text-xs text-[#2a241a] outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-400/10"
                />
              </label>
              <button type="submit" className="rounded-[14px] bg-stoneWarm-100 px-3.5 py-2.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-200">
                Go
              </button>
            </form>
          </div>
        </div>
        <div className="mt-4 border-t border-stoneWarm-200/70 pt-3">
          <Legend />
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          {visibleRoomTypes.length === 0 ? (
            <div className="rounded-[26px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-6 py-12 text-center shadow-[0_12px_30px_rgba(55,43,30,0.04)]">
              <h2 className="font-serif text-xl font-semibold text-[#2a241a]">No matching room inventory</h2>
              <p className="mt-2 text-sm text-oliveMuted-600">Try another filter to review the current selling window.</p>
            </div>
          ) : (
            <>
              <section className="hidden overflow-hidden rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_16px_38px_rgba(55,43,30,0.07)] md:block">
                <div className="border-b border-stoneWarm-200/70 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-serif text-xl font-semibold text-[#2a241a]">Sellable Inventory</h2>
                      <p className="mt-1 text-xs text-oliveMuted-500">
                        {formatDate(initialData.startDate, true)} to {formatDate(initialData.endDate, true)}
                      </p>
                    </div>
                    <p className="text-[10px] text-oliveMuted-500">Swipe horizontally on tablet</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div
                    className="grid min-w-max gap-px bg-stoneWarm-200/70 p-px"
                    style={{
                      gridTemplateColumns: `minmax(230px, 250px) repeat(${initialData.dates.length}, minmax(78px, 1fr))`
                    }}
                  >
                    <div className="sticky left-0 z-20 bg-[#fffdf8] px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                      Room type
                    </div>
                    {initialData.dates.map((date) => (
                      <div key={date} className={`px-2 py-3 text-center ${date === initialData.today ? "bg-oliveMuted-400/10" : "bg-[#fffdf8]"}`}>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-oliveMuted-500">
                          {date === initialData.today ? "Today" : formatWeekday(date)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#2a241a]">{formatDate(date)}</p>
                      </div>
                    ))}

                    {visibleRoomTypes.map((roomType) => (
                      <div key={roomType.id} className="contents">
                        <div className="sticky left-0 z-10 flex items-center gap-3 bg-[#fffdf8] p-3">
                          <RoomThumbnail roomType={roomType} compact />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-[#2a241a]">{roomType.title}</span>
                            <span className="mt-1 block text-[10px] text-oliveMuted-500">
                              {roomType.sellableInventory} sellable of {roomType.inventoryCount}
                            </span>
                            {roomType.outOfOrderCount > 0 && (
                              <span className="mt-1 inline-flex rounded-full border border-[#777086]/35 bg-[#ddd9e3] px-2 py-0.5 text-[8px] font-semibold text-[#514a5e]">
                                {roomType.outOfOrderCount} out of order
                              </span>
                            )}
                          </span>
                        </div>
                        {roomType.cells.map((cell) => (
                          <div key={`${roomType.id}-${cell.date}`} className={`p-1.5 ${cell.date === initialData.today ? "bg-oliveMuted-400/5" : "bg-[#fffdf8]"}`}>
                            <InventoryCell
                              roomType={roomType}
                              cell={cell}
                              selected={selection?.roomTypeId === roomType.id && selection.date === cell.date}
                              onSelect={() => setSelection({ roomTypeId: roomType.id, date: cell.date })}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <div className="grid gap-4 md:hidden">
                {visibleRoomTypes.map((roomType) => (
                  <article key={roomType.id} className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.07)]">
                    <div className="flex items-center gap-3 border-b border-stoneWarm-200/70 p-4">
                      <RoomThumbnail roomType={roomType} />
                      <div className="min-w-0">
                        <h2 className="truncate font-serif text-lg font-semibold text-[#2a241a]">{roomType.title}</h2>
                        <p className="mt-1 text-xs text-oliveMuted-500">
                          {roomType.sellableInventory} sellable of {roomType.inventoryCount} units
                        </p>
                        {roomType.outOfOrderCount > 0 && (
                          <p className="mt-1 text-[10px] font-semibold text-[#5f586d]">
                            {roomType.outOfOrderCount} out of order
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-2 p-3">
                      {roomType.cells.map((cell) => (
                        <MobileAvailabilityRow
                          key={`${roomType.id}-${cell.date}`}
                          roomType={roomType}
                          cell={cell}
                          today={initialData.today}
                          selected={selection?.roomTypeId === roomType.id && selection.date === cell.date}
                          onSelect={() => setSelection({ roomTypeId: roomType.id, date: cell.date })}
                        />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        <OccupancyInsights data={initialData} />
      </div>

      <section className="overflow-hidden rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_16px_38px_rgba(55,43,30,0.07)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stoneWarm-200/70 px-5 py-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Inventory detail</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-[#2a241a]">
              {selectedRoomType && selection
                ? `${selectedRoomType.title} · ${formatDate(selection.date, true)}`
                : "Select a room date"}
            </h2>
            <p className="mt-1 text-sm text-oliveMuted-600">
              {selectedCell && selectedRoomType
                ? `${selectedCell.occupied} of ${selectedRoomType.sellableInventory} sellable units occupied`
                : "Choose an availability count to inspect the reservations behind it."}
            </p>
          </div>
          {selectedCell && selectedRoomType && (
            <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${cellState(selectedCell, selectedRoomType).tone}`}>
              {cellState(selectedCell, selectedRoomType).label}
            </span>
          )}
        </div>

        {selectedBookings.length === 0 ? (
          <div className="px-5 py-7">
            <p className="text-sm font-semibold text-[#2a241a]">No active reservations for this selection.</p>
            <p className="mt-1 text-sm text-oliveMuted-600">The remaining sellable units are clear for new bookings.</p>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:p-5">
            {selectedBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
