"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Pending Payment",
  awaiting_confirmation: "Awaiting Confirmation",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  cancelled: "Cancelled",
  no_show: "No Show",
  refunded: "Refunded"
};

const STATUS_STYLE: Record<BookingStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-800",
  awaiting_confirmation: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  checked_in: "bg-teal-100 text-teal-800",
  checked_out: "bg-stoneWarm-100 text-oliveMuted-600",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-orange-100 text-orange-800",
  refunded: "bg-stoneWarm-100 text-stoneWarm-500"
};

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short"
  }).format(new Date(year, month - 1, day));
}

function formatWeekday(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", { weekday: "short" }).format(
    new Date(year, month - 1, day)
  );
}

function formatUgx(value: number): string {
  return `${new Intl.NumberFormat("en-UG").format(value)} UGX`;
}

function nights(booking: CalendarBooking): number {
  const start = new Date(`${booking.checkIn}T00:00:00Z`);
  const end = new Date(`${booking.checkOut}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function cellTone(cell: CalendarCell, inventory: number): string {
  if (inventory <= 0) return "border-stoneWarm-200 bg-stoneWarm-100 text-oliveMuted-500";
  if (cell.occupied <= 0) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (cell.occupied >= inventory) return "border-red-200 bg-red-50 text-red-700";
  if (cell.occupied / inventory >= 0.75) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function cellLabel(cell: CalendarCell, inventory: number): string {
  if (inventory <= 0) return "Closed";
  if (cell.occupied <= 0) return "Open";
  if (cell.occupied >= inventory) return "Full";
  return `${inventory - cell.occupied} open`;
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

function CalendarCellButton({
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
  const tone = cellTone(cell, roomType.inventoryCount);
  const available = Math.max(0, roomType.inventoryCount - cell.occupied);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid h-20 min-w-28 content-between rounded-lg border p-2 text-left text-xs transition hover:ring-2 hover:ring-oliveMuted-200 ${
        selected ? "ring-2 ring-oliveMuted-400" : ""
      } ${tone}`}
    >
      <span className="font-semibold">{cellLabel(cell, roomType.inventoryCount)}</span>
      <span className="font-mono text-[11px]">
        {cell.occupied}/{roomType.inventoryCount}
      </span>
      {(cell.pending > 0 || cell.awaiting > 0) && (
        <span className="text-[10px] text-oliveMuted-600">
          {cell.pending > 0 ? `${cell.pending} hold${cell.pending === 1 ? "" : "s"}` : ""}
          {cell.pending > 0 && cell.awaiting > 0 ? " · " : ""}
          {cell.awaiting > 0 ? `${cell.awaiting} review` : ""}
        </span>
      )}
      {available > 0 && cell.occupied > 0 && (
        <span className="text-[10px] text-oliveMuted-600">{available} still available</span>
      )}
    </button>
  );
}

function BookingCard({ booking }: { booking: CalendarBooking }) {
  const guestCount =
    `${booking.guestsAdults} adult${booking.guestsAdults === 1 ? "" : "s"}` +
    (booking.guestsChildren > 0
      ? `, ${booking.guestsChildren} child${booking.guestsChildren === 1 ? "" : "ren"}`
      : "");

  return (
    <article className="rounded-2xl border border-stoneWarm-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLE[booking.status]}`}
            >
              {STATUS_LABEL[booking.status]}
            </span>
            <span className="font-mono text-xs text-oliveMuted-500">{booking.reference}</span>
          </div>
          <p className="mt-2 font-semibold">{booking.guestFullName}</p>
          <p className="mt-1 text-sm text-oliveMuted-600">
            {formatDate(booking.checkIn)} to {formatDate(booking.checkOut)} · {nights(booking)}{" "}
            {nights(booking) === 1 ? "night" : "nights"}
          </p>
          <p className="mt-1 text-sm text-oliveMuted-600">{guestCount}</p>
          {booking.guestPhone && <p className="mt-1 text-sm text-oliveMuted-600">{booking.guestPhone}</p>}
        </div>
        <p className="shrink-0 text-sm font-semibold">{formatUgx(booking.quotedTotalUgx)}</p>
      </div>
    </article>
  );
}

export function CalendarClient({ initialData }: { initialData: OccupancyCalendarData }) {
  const firstRoomType = initialData.roomTypes[0];
  const [selection, setSelection] = useState<Selection | null>(
    firstRoomType ? { roomTypeId: firstRoomType.id, date: initialData.startDate } : null
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
  const totalInventory = initialData.roomTypes.reduce(
    (sum, roomType) => sum + roomType.inventoryCount,
    0
  );
  const peakOccupied = Math.max(
    0,
    ...initialData.dates.map((date) =>
      initialData.roomTypes.reduce((sum, roomType) => {
        const cell = roomType.cells.find((item) => item.date === date);
        return sum + (cell?.occupied ?? 0);
      }, 0)
    )
  );

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Occupancy Calendar</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">
            {formatDate(initialData.startDate)} to {formatDate(initialData.endDate)} by room type.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="surface-card px-4 py-2 text-sm">
            <span className="font-semibold">{totalInventory}</span>{" "}
            <span className="text-oliveMuted-600">units</span>
          </div>
          <div className="surface-card px-4 py-2 text-sm">
            <span className="font-semibold">{peakOccupied}</span>{" "}
            <span className="text-oliveMuted-600">peak occupied</span>
          </div>
          <Link
            href="/bookings"
            className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-50"
          >
            Bookings
          </Link>
        </div>
      </header>

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <div
            className="grid min-w-max gap-px bg-stoneWarm-100 p-px"
            style={{
              gridTemplateColumns: `minmax(190px, 220px) repeat(${initialData.dates.length}, minmax(112px, 1fr))`
            }}
          >
            <div className="sticky left-0 z-20 bg-white p-3 text-xs font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
              Room type
            </div>
            {initialData.dates.map((date) => (
              <div key={date} className="bg-white p-3 text-center">
                <p className="text-xs font-semibold">{formatWeekday(date)}</p>
                <p className="mt-1 text-xs text-oliveMuted-600">{formatDate(date)}</p>
              </div>
            ))}

            {initialData.roomTypes.map((roomType) => (
              <div key={roomType.id} className="contents">
                <div className="sticky left-0 z-10 grid bg-white p-3">
                  <p className="text-sm font-semibold">{roomType.title}</p>
                  <p className="mt-1 text-xs text-oliveMuted-600">
                    {roomType.inventoryCount} unit{roomType.inventoryCount === 1 ? "" : "s"}
                  </p>
                </div>
                {roomType.cells.map((cell) => (
                  <div key={`${roomType.id}-${cell.date}`} className="bg-white p-2">
                    <CalendarCellButton
                      roomType={roomType}
                      cell={cell}
                      selected={
                        selection?.roomTypeId === roomType.id && selection.date === cell.date
                      }
                      onSelect={() => setSelection({ roomTypeId: roomType.id, date: cell.date })}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stoneWarm-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {selectedRoomType && selection
                ? `${selectedRoomType.title} · ${formatDate(selection.date)}`
                : "Selected Date"}
            </h2>
            <p className="mt-1 text-sm text-oliveMuted-600">
              {selectedCell
                ? `${selectedCell.occupied} of ${selectedRoomType?.inventoryCount ?? 0} units occupied`
                : "Choose a calendar cell to inspect the bookings behind it."}
            </p>
          </div>
          {selectedCell && (
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                selectedRoomType ? cellTone(selectedCell, selectedRoomType.inventoryCount) : ""
              }`}
            >
              {selectedRoomType ? cellLabel(selectedCell, selectedRoomType.inventoryCount) : ""}
            </span>
          )}
        </div>

        {selectedBookings.length === 0 ? (
          <p className="px-5 py-5 text-sm text-oliveMuted-600">
            No live bookings or active payment holds for this room type on the selected date.
          </p>
        ) : (
          <div className="grid gap-3 p-5">
            {selectedBookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
