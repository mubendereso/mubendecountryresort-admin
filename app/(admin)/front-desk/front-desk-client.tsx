"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateBookingStatusAction } from "@/lib/bookings/actions";
import type { BookingStatus } from "@/lib/bookings/types";
import type { FrontDeskBooking, FrontDeskData } from "@/lib/front-desk/data";
import { RoomAssignment } from "./room-assignment";

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatShortDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short"
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

function BedIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M4 18v-7m16 7v-5a3 3 0 0 0-3-3H9a5 5 0 0 0-5 5v3" />
      <path d="M4 14h16M7 10V7h5a3 3 0 0 1 3 3" />
      <path d="M6 18v2m12-2v2" strokeLinecap="round" />
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

function DepartureIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M12 15V4m0 0 4 4m-4-4L8 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v3h14v-3" strokeLinecap="round" strokeLinejoin="round" />
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

function GuestIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
    </svg>
  );
}

function QuickStat({
  icon,
  label,
  value,
  detail
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="group flex min-w-[168px] items-center gap-3 rounded-[20px] border border-stoneWarm-200/80 bg-[#fffdf8]/80 px-4 py-3 shadow-[0_10px_24px_rgba(55,43,30,0.06)] backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(55,43,30,0.1)]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-stoneWarm-100 text-oliveMuted-600 transition-colors duration-200 group-hover:bg-oliveMuted-600 group-hover:text-canvas-light">
        {icon}
      </span>
      <span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">{label}</span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className="font-serif text-2xl font-semibold text-[#2a241a]">{value}</span>
          <span className="text-[11px] text-oliveMuted-500">{detail}</span>
        </span>
      </span>
    </div>
  );
}

function OccupancySummary({
  occupancyPercent,
  occupiedRooms,
  availableRooms,
  arrivals,
  departures
}: {
  occupancyPercent: number;
  occupiedRooms: number;
  availableRooms: number;
  arrivals: number;
  departures: number;
}) {
  const ringStyle = {
    background: `conic-gradient(#646b54 ${occupancyPercent * 3.6}deg, #efe8d8 0deg)`
  };
  const details = [
    { label: "Rooms occupied", value: occupiedRooms, icon: <BedIcon className="h-4 w-4" /> },
    { label: "Rooms available", value: availableRooms, icon: <BedIcon className="h-4 w-4" /> },
    { label: "Arrivals today", value: arrivals, icon: <ArrivalIcon className="h-4 w-4" /> },
    { label: "Departures today", value: departures, icon: <DepartureIcon className="h-4 w-4" /> }
  ];

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_18px_45px_rgba(55,43,30,0.09)] sm:p-6">
      <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-bronze-400/10 blur-3xl" />
      <div className="relative grid items-center gap-7 lg:grid-cols-[1.05fr_2fr]">
        <div className="flex items-center gap-5 border-b border-stoneWarm-200/70 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
          <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full p-[9px] shadow-inner" style={ringStyle}>
            <div className="grid h-full w-full place-items-center rounded-full bg-[#fffdf8] text-center">
              <div>
                <p className="font-serif text-3xl font-semibold leading-none text-[#2a241a]">{occupancyPercent}%</p>
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">Occupancy</p>
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">Live room picture</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">Today at the resort</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-oliveMuted-600">
              A quiet overview of guest movement and rooms currently in service.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {details.map((detail, index) => (
            <div key={detail.label} className="rounded-[20px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 px-4 py-4 transition-colors duration-200 hover:bg-stoneWarm-100/75">
              <div className="flex items-center justify-between gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#fffdf8] text-oliveMuted-600 shadow-sm">{detail.icon}</span>
                <span className={index === 1 ? "text-bronze-500" : "text-oliveMuted-600"}>
                  <span className="font-serif text-2xl font-semibold">{detail.value}</span>
                </span>
              </div>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">{detail.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BookingCard({
  booking,
  actionLabel,
  nextStatus,
  pending,
  kind,
  onAction
}: {
  booking: FrontDeskBooking;
  actionLabel: string;
  nextStatus: BookingStatus;
  pending: boolean;
  kind: "arrival" | "departure";
  onAction: (bookingId: string, status: BookingStatus) => void;
}) {
  const nights = stayNights(booking);
  const isArrival = kind === "arrival";

  return (
    <article className="group relative overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-stoneWarm-300 hover:shadow-[0_20px_45px_rgba(55,43,30,0.12)]">
      <div className={`absolute inset-y-0 left-0 w-1 ${isArrival ? "bg-oliveMuted-500" : "bg-bronze-400"}`} />
      <div className="grid gap-5 p-5 pl-6 sm:p-6 sm:pl-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isArrival ? "bg-oliveMuted-600 text-canvas-light" : "bg-stoneWarm-100 text-bronze-500"}`}>
              {isArrival ? <ArrivalIcon /> : <DepartureIcon />}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-oliveMuted-500">{isArrival ? "Expected arrival" : "Due to depart"}</p>
              <h3 className="mt-1 truncate font-serif text-[22px] font-semibold tracking-[-0.01em] text-[#2a241a]">{booking.guest_full_name}</h3>
              <p className="mt-1 font-mono text-[11px] tracking-wide text-oliveMuted-500">{booking.reference}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Stay value</p>
            <p className="mt-1 text-sm font-semibold text-[#2a241a]">{formatUgx(booking.quoted_total_ugx)}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StayDetail icon={<BedIcon className="h-4 w-4" />} label="Room" value={booking.room_type_title} detail={`${nights} ${nights === 1 ? "night" : "nights"}`} />
          <StayDetail icon={<CalendarIcon className="h-4 w-4" />} label="Stay" value={`${formatShortDate(booking.check_in)} - ${formatShortDate(booking.check_out)}`} detail="Current reservation" />
          <StayDetail icon={<GuestIcon className="h-4 w-4" />} label="Party" value={guestCount(booking)} detail="Registered guests" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[18px] border border-stoneWarm-200/70 bg-white/55 p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Guest contact</p>
            <div className="mt-2 grid gap-1 text-sm">
              {booking.guest_email && <a href={`mailto:${booking.guest_email}`} className="truncate text-oliveMuted-700 transition-colors hover:text-[#2a241a]">{booking.guest_email}</a>}
              {booking.guest_phone && <a href={`tel:${booking.guest_phone}`} className="text-oliveMuted-700 transition-colors hover:text-[#2a241a]">{booking.guest_phone}</a>}
              {!booking.guest_email && !booking.guest_phone && <span className="text-oliveMuted-500">No contact details</span>}
            </div>
          </div>
          <RoomAssignment bookingId={booking.id} assignedUnitName={booking.room_unit_name} />
        </div>

        {(booking.special_requests || booking.notes) && (
          <div className="grid gap-3">
            {booking.special_requests && (
              <div className="rounded-[18px] border border-bronze-400/20 bg-bronze-400/5 p-4 text-sm text-oliveMuted-700">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-bronze-500">Guest preference</p>
                <p className="mt-2 leading-6">{booking.special_requests}</p>
              </div>
            )}
            {booking.notes && (
              <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/40 p-4 text-sm text-oliveMuted-700">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Front desk note</p>
                <p className="mt-2 leading-6">{booking.notes}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stoneWarm-200/70 pt-4">
          <div className="flex items-center gap-2">
            <Link href={`/bookings/${booking.id}/edit`} className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition-all duration-200 hover:bg-stoneWarm-100">Edit stay</Link>
            <Link href={`/bookings/${booking.id}/folio`} className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition-all duration-200 hover:bg-stoneWarm-100">View folio</Link>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => onAction(booking.id, nextStatus)}
            className="rounded-full bg-oliveMuted-600 px-5 py-2.5 text-xs font-semibold text-canvas-light shadow-[0_10px_24px_rgba(82,88,69,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500 hover:shadow-[0_14px_30px_rgba(82,88,69,0.26)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Updating..." : actionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

function StayDetail({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[18px] bg-stoneWarm-100/55 p-3.5">
      <div className="flex items-center gap-2 text-oliveMuted-500">
        {icon}
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em]">{label}</p>
      </div>
      <p className="mt-2 text-sm font-semibold text-[#2a241a]">{value}</p>
      <p className="mt-0.5 text-xs text-oliveMuted-500">{detail}</p>
    </div>
  );
}

function EmptyDeskState({ kind, title, description }: { kind: "arrival" | "departure"; title: string; description: string }) {
  const isArrival = kind === "arrival";
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-6 py-10 text-center shadow-[0_12px_30px_rgba(55,43,30,0.04)]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-stoneWarm-100/50 to-transparent" />
      <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-full border border-stoneWarm-200 bg-stoneWarm-100/70 text-oliveMuted-600 shadow-inner">
        <div className="absolute h-12 w-12 rounded-full border border-bronze-400/20" />
        {isArrival ? <ArrivalIcon className="h-8 w-8" /> : <DepartureIcon className="h-8 w-8" />}
      </div>
      <p className="relative mt-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">{isArrival ? "Arrival lounge is clear" : "Departure lounge is clear"}</p>
      <h3 className="relative mt-2 font-serif text-xl font-semibold text-[#2a241a]">{title}</h3>
      <p className="relative mx-auto mt-2 max-w-sm text-sm leading-6 text-oliveMuted-600">{description}</p>
    </div>
  );
}

function DeskPanel({ title, subtitle, count, kind, children }: { title: string; subtitle: string; count: number; kind: "arrival" | "departure"; children: React.ReactNode }) {
  const isArrival = kind === "arrival";
  return (
    <section className="grid content-start gap-4">
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">{isArrival ? "Welcoming" : "Farewell"}</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">{title}</h2>
          <p className="mt-1 text-sm text-oliveMuted-600">{subtitle}</p>
        </div>
        <span className={`grid h-11 min-w-11 place-items-center rounded-full border px-3 font-serif text-lg font-semibold ${isArrival ? "border-oliveMuted-400/30 bg-oliveMuted-600 text-canvas-light" : "border-bronze-400/30 bg-bronze-400/10 text-bronze-500"}`}>{count}</span>
      </div>
      {count === 0 ? (
        <EmptyDeskState
          kind={kind}
          title={isArrival ? "No arrivals waiting" : "No departures due"}
          description={isArrival ? "Every expected guest has been welcomed, or the day is beautifully quiet." : "There are no checked-in guests scheduled to leave today."}
        />
      ) : (
        <div className="grid gap-4">{children}</div>
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
  const availableRooms = Math.max(0, initialData.totalUnits - inHouseCount);
  const occupancyPercent = initialData.totalUnits === 0 ? 0 : Math.min(100, Math.round((inHouseCount / initialData.totalUnits) * 100));

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
    <section className="grid gap-8 lg:gap-10">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-bronze-400/15" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-44 w-44 rounded-full border border-oliveMuted-400/10" />
        <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">Guest operations</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">Front Desk</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
              A composed view of today&apos;s arrivals, departures and the guests currently in our care.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-stoneWarm-100/70 px-3 py-1.5 text-xs font-semibold text-oliveMuted-600">
              <CalendarIcon className="h-4 w-4" />
              {formatDate(initialData.today)}
            </p>
          </div>

          <div className="flex flex-wrap items-stretch gap-3">
            <QuickStat icon={<BedIcon />} label="In house" value={inHouseCount} detail="guests" />
            <QuickStat icon={<CalendarIcon />} label="Actions today" value={totalActions} detail="remaining" />
            <Link href="/bookings/new" className="group flex min-h-[68px] items-center gap-3 rounded-[20px] bg-oliveMuted-600 px-5 py-3 text-canvas-light shadow-[0_14px_30px_rgba(82,88,69,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500 hover:shadow-[0_18px_36px_rgba(82,88,69,0.3)] active:translate-y-0">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xl font-light transition-transform duration-200 group-hover:rotate-90">+</span>
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-canvas-light/70">Reservation</span>
                <span className="mt-0.5 block text-sm font-semibold">New booking</span>
              </span>
            </Link>
          </div>
        </div>
      </header>

      <OccupancySummary occupancyPercent={occupancyPercent} occupiedRooms={inHouseCount} availableRooms={availableRooms} arrivals={arrivals.length} departures={departures.length} />

      {error && <div className="rounded-[20px] border border-red-200 bg-red-50/90 px-5 py-4 text-sm text-red-700 shadow-sm">{error}</div>}

      <div className="grid items-start gap-8 xl:grid-cols-2 xl:gap-7">
        <DeskPanel title="Arrivals Today" subtitle="Guests to welcome and settle in." count={arrivals.length} kind="arrival">
          {arrivals.map((booking) => (
            <BookingCard key={booking.id} booking={booking} actionLabel="Welcome and check in" nextStatus="checked_in" pending={isPending && pendingId === booking.id} kind="arrival" onAction={handleStatus} />
          ))}
        </DeskPanel>

        <DeskPanel title="Departures Today" subtitle="Stays to close with care." count={departures.length} kind="departure">
          {departures.map((booking) => (
            <BookingCard key={booking.id} booking={booking} actionLabel="Complete check out" nextStatus="checked_out" pending={isPending && pendingId === booking.id} kind="departure" onAction={handleStatus} />
          ))}
        </DeskPanel>
      </div>
    </section>
  );
}
