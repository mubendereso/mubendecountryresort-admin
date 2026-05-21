"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateBookingStatusAction } from "@/lib/bookings/actions";
import type { AdminRole } from "@/lib/auth/session";
import type { BookingRow, BookingStatus } from "@/lib/bookings/types";

// ─── Formatting helpers ──────────────────────────────────────────────────────

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(y, m - 1, day));
}

function nights(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn + "T00:00:00Z");
  const b = new Date(checkOut + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG").format(n) + " UGX";
}

// ─── Status display ──────────────────────────────────────────────────────────

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

type Transition = {
  label: string;
  status: BookingStatus;
  adminOnly?: boolean;
};

const TRANSITIONS: Partial<Record<BookingStatus, Transition[]>> = {
  confirmed: [
    { label: "Check In", status: "checked_in" },
    { label: "No Show", status: "no_show" },
    { label: "Cancel", status: "cancelled", adminOnly: true }
  ],
  checked_in: [
    { label: "Check Out", status: "checked_out" },
    { label: "Cancel", status: "cancelled", adminOnly: true }
  ]
};

// ─── Filter logic ────────────────────────────────────────────────────────────

type Filter = "all" | "upcoming" | "active" | "pending" | "history";

function applyFilter(bookings: BookingRow[], filter: Filter): BookingRow[] {
  const today = new Date().toISOString().split("T")[0];
  switch (filter) {
    case "upcoming":
      return bookings.filter((b) => b.status === "confirmed" && b.check_in >= today);
    case "active":
      return bookings.filter((b) => b.status === "checked_in");
    case "pending":
      return bookings.filter(
        (b) => b.status === "pending_payment" || b.status === "awaiting_confirmation"
      );
    case "history":
      return bookings.filter((b) =>
        (["checked_out", "no_show", "cancelled", "refunded"] as BookingStatus[]).includes(b.status)
      );
    default:
      return bookings;
  }
}

// ─── Booking row ─────────────────────────────────────────────────────────────

function BookingRow({
  booking,
  role,
  isExpanded,
  isPending,
  onToggle,
  onStatus
}: {
  booking: BookingRow;
  role: AdminRole;
  isExpanded: boolean;
  isPending: boolean;
  onToggle: () => void;
  onStatus: (status: BookingStatus) => void;
}) {
  const n = nights(booking.check_in, booking.check_out);
  const transitions = TRANSITIONS[booking.status] ?? [];
  const visibleTransitions = transitions.filter((t) => !t.adminOnly || role !== "staff");

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
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLE[booking.status]}`}
              >
                {STATUS_LABEL[booking.status]}
              </span>
              <span className="font-mono text-xs text-oliveMuted-500">{booking.reference}</span>
            </div>
            <p className="text-sm font-semibold">{booking.guest_full_name}</p>
            <p className="text-sm text-oliveMuted-600">
              {booking.room_type_title} &middot; {fmtDate(booking.check_in)} → {fmtDate(booking.check_out)}{" "}
              <span className="text-oliveMuted-400">({n} {n === 1 ? "night" : "nights"})</span>
            </p>
          </div>
          <div className="grid shrink-0 gap-0.5 text-right">
            <p className="text-sm font-semibold">{fmtUgx(booking.quoted_total_ugx)}</p>
            <p className="text-xs text-oliveMuted-500">
              {booking.guests_adults} adult{booking.guests_adults !== 1 ? "s" : ""}
              {booking.guests_children > 0 ? `, ${booking.guests_children} child${booking.guests_children !== 1 ? "ren" : ""}` : ""}
            </p>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="grid gap-4 border-t border-stoneWarm-100 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Guest</p>
              <p className="text-sm font-medium">{booking.guest_full_name}</p>
              <a href={`mailto:${booking.guest_email}`} className="text-sm text-oliveMuted-600 hover:underline">
                {booking.guest_email}
              </a>
              {booking.guest_phone && (
                <a href={`tel:${booking.guest_phone}`} className="text-sm text-oliveMuted-600 hover:underline">
                  {booking.guest_phone}
                </a>
              )}
            </div>
            <div className="grid gap-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Stay</p>
              <p className="text-sm">
                {fmtDate(booking.check_in)} → {fmtDate(booking.check_out)}
              </p>
              <p className="text-sm text-oliveMuted-600">
                {n} {n === 1 ? "night" : "nights"} &middot; {booking.room_type_title}
              </p>
              <p className="text-sm text-oliveMuted-600">
                {booking.guests_adults} adult{booking.guests_adults !== 1 ? "s" : ""}
                {booking.guests_children > 0
                  ? `, ${booking.guests_children} child${booking.guests_children !== 1 ? "ren" : ""}`
                  : ""}
              </p>
            </div>
          </div>

          {booking.special_requests && (
            <div className="grid gap-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">
                Special Requests
              </p>
              <p className="text-sm">{booking.special_requests}</p>
            </div>
          )}

          {booking.notes && (
            <div className="grid gap-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Notes</p>
              <p className="text-sm">{booking.notes}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-semibold">{fmtUgx(booking.quoted_total_ugx)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/bookings/${booking.id}/folio`}
                className="rounded-2xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
              >
                Folio →
              </Link>
              {visibleTransitions.map((t) => (
                <button
                  key={t.status}
                  type="button"
                  disabled={isPending}
                  onClick={() => onStatus(t.status)}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                    t.status === "cancelled" || t.status === "no_show"
                      ? "border border-stoneWarm-200 bg-white text-red-600 hover:bg-red-50"
                      : "bg-oliveMuted-600 text-canvas-light hover:bg-oliveMuted-500"
                  }`}
                >
                  {isPending ? "Updating…" : t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function BookingsClient({
  initialBookings,
  role
}: {
  initialBookings: BookingRow[];
  role: AdminRole;
}) {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingRow[]>(initialBookings);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStatus(bookingId: string, newStatus: BookingStatus) {
    setError(null);
    setPendingId(bookingId);
    const fd = new FormData();
    fd.set("id", bookingId);
    fd.set("status", newStatus);

    startTransition(async () => {
      try {
        await updateBookingStatusAction(fd);
        setBookings((prev) =>
          prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update booking.");
      }
      setPendingId(null);
    });
  }

  const checkedInCount = bookings.filter((b) => b.status === "checked_in").length;
  const upcomingCount = bookings.filter(
    (b) => b.status === "confirmed" && b.check_in >= new Date().toISOString().split("T")[0]
  ).length;

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    {
      key: "upcoming",
      label: upcomingCount > 0 ? `Upcoming (${upcomingCount})` : "Upcoming"
    },
    { key: "active", label: checkedInCount > 0 ? `Active (${checkedInCount})` : "Active" },
    { key: "pending", label: "Pending" },
    { key: "history", label: "History" }
  ];

  const displayed = applyFilter(bookings, filter);

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Bookings</h1>
        {error && <p className="text-sm text-red-500">{error}</p>}
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

      {displayed.length === 0 ? (
        <p className="text-sm text-oliveMuted-600">
          {filter === "all" ? "No bookings yet." : `No ${filter} bookings.`}
        </p>
      ) : (
        <div className="grid gap-2">
          {displayed.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              role={role}
              isExpanded={expanded === booking.id}
              isPending={isPending && pendingId === booking.id}
              onToggle={() => setExpanded(expanded === booking.id ? null : booking.id)}
              onStatus={(status) => handleStatus(booking.id, status)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
