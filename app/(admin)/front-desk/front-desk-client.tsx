"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateBookingStatusAction } from "@/lib/bookings/actions";
import type { BookingStatus } from "@/lib/bookings/types";
import type { FrontDeskBooking, FrontDeskData } from "@/lib/front-desk/data";

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatUgx(value: number): string {
  return `${new Intl.NumberFormat("en-UG").format(value)} UGX`;
}

function guestCount(booking: FrontDeskBooking): string {
  const adults = `${booking.guests_adults} adult${booking.guests_adults === 1 ? "" : "s"}`;
  if (booking.guests_children === 0) return adults;
  return `${adults}, ${booking.guests_children} child${booking.guests_children === 1 ? "" : "ren"}`;
}

function stayNights(booking: FrontDeskBooking): number {
  const start = new Date(`${booking.check_in}T00:00:00Z`);
  const end = new Date(`${booking.check_out}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function BookingCard({
  booking,
  actionLabel,
  nextStatus,
  pending,
  onAction
}: {
  booking: FrontDeskBooking;
  actionLabel: string;
  nextStatus: BookingStatus;
  pending: boolean;
  onAction: (bookingId: string, status: BookingStatus) => void;
}) {
  const nights = stayNights(booking);

  return (
    <article className="surface-card overflow-hidden">
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{booking.guest_full_name}</h3>
              <span className="font-mono text-xs text-oliveMuted-500">{booking.reference}</span>
            </div>
            <p className="mt-1 text-sm text-oliveMuted-600">
              {booking.room_type_title} · {nights} {nights === 1 ? "night" : "nights"} ·{" "}
              {guestCount(booking)}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold">{formatUgx(booking.quoted_total_ugx)}</p>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
              Guest Contact
            </p>
            <a href={`mailto:${booking.guest_email}`} className="mt-1 block text-oliveMuted-700 hover:underline">
              {booking.guest_email}
            </a>
            {booking.guest_phone && (
              <a href={`tel:${booking.guest_phone}`} className="mt-1 block text-oliveMuted-700 hover:underline">
                {booking.guest_phone}
              </a>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
              Stay Window
            </p>
            <p className="mt-1 text-oliveMuted-700">
              {formatDate(booking.check_in)} to {formatDate(booking.check_out)}
            </p>
          </div>
        </div>

        {booking.special_requests && (
          <div className="rounded-2xl bg-stoneWarm-50 p-3 text-sm text-oliveMuted-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
              Special Requests
            </p>
            <p className="mt-1">{booking.special_requests}</p>
          </div>
        )}

        {booking.notes && (
          <div className="rounded-2xl bg-stoneWarm-50 p-3 text-sm text-oliveMuted-700">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
              Notes
            </p>
            <p className="mt-1">{booking.notes}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/bookings/${booking.id}/folio`}
            className="rounded-2xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
          >
            Folio →
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() => onAction(booking.id, nextStatus)}
            className="rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:opacity-50"
          >
            {pending ? "Updating..." : actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

function DeskPanel({
  title,
  count,
  empty,
  children
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="rounded-full bg-stoneWarm-100 px-3 py-1 text-xs font-semibold text-oliveMuted-600">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <div className="surface-card px-5 py-6 text-sm text-oliveMuted-600">{empty}</div>
      ) : (
        <div className="grid gap-3">{children}</div>
      )}
    </section>
  );
}

export function FrontDeskClient({ initialData }: { initialData: FrontDeskData }) {
  const router = useRouter();
  const [arrivals, setArrivals] = useState(initialData.arrivals);
  const [departures, setDepartures] = useState(initialData.departures);
  const [inHouseCount, setInHouseCount] = useState(initialData.inHouseCount);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalActions = useMemo(() => arrivals.length + departures.length, [arrivals, departures]);

  function handleStatus(bookingId: string, newStatus: BookingStatus) {
    setError(null);
    setPendingId(bookingId);
    const formData = new FormData();
    formData.set("id", bookingId);
    formData.set("status", newStatus);

    startTransition(async () => {
      try {
        await updateBookingStatusAction(formData);
        if (newStatus === "checked_in") {
          setArrivals((current) => current.filter((booking) => booking.id !== bookingId));
          setInHouseCount((count) => count + 1);
        }
        if (newStatus === "checked_out") {
          setDepartures((current) => current.filter((booking) => booking.id !== bookingId));
          setInHouseCount((count) => Math.max(0, count - 1));
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update booking.");
      }
      setPendingId(null);
    });
  }

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Front Desk</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">
            Arrivals and departures for {formatDate(initialData.today)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="surface-card px-4 py-2 text-sm">
            <span className="font-semibold">{inHouseCount}</span>{" "}
            <span className="text-oliveMuted-600">in house</span>
          </div>
          <div className="surface-card px-4 py-2 text-sm">
            <span className="font-semibold">{totalActions}</span>{" "}
            <span className="text-oliveMuted-600">actions today</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <DeskPanel
          title="Arrivals Today"
          count={arrivals.length}
          empty="No confirmed arrivals waiting for check-in."
        >
          {arrivals.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              actionLabel="Check In"
              nextStatus="checked_in"
              pending={isPending && pendingId === booking.id}
              onAction={handleStatus}
            />
          ))}
        </DeskPanel>

        <DeskPanel
          title="Departures Today"
          count={departures.length}
          empty="No checked-in guests due for checkout."
        >
          {departures.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              actionLabel="Check Out"
              nextStatus="checked_out"
              pending={isPending && pendingId === booking.id}
              onAction={handleStatus}
            />
          ))}
        </DeskPanel>
      </div>
    </section>
  );
}
