"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateBookingStatusAction } from "@/lib/bookings/actions";
import type { AdminRole } from "@/lib/auth/session";
import type { BookingRow, BookingStatus } from "@/lib/bookings/types";
import { RoomAssignment } from "../front-desk/room-assignment";

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short"
  }).format(parseDate(value));
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(parseDate(value));
}

function operationalDate(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function stayNights(booking: BookingRow): number {
  const start = new Date(`${booking.check_in}T00:00:00Z`);
  const end = new Date(`${booking.check_out}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function formatUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function guestCount(booking: BookingRow): string {
  const adults = `${booking.guests_adults} adult${booking.guests_adults === 1 ? "" : "s"}`;
  if (booking.guests_children === 0) return adults;
  return `${adults}, ${booking.guests_children} child${booking.guests_children === 1 ? "" : "ren"}`;
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

function ClockIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Pending",
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

type PaymentState = {
  label: string;
  detail: string;
  style: string;
};

function paymentState(booking: BookingRow): PaymentState {
  const due = Math.max(0, booking.total_charges_ugx - booking.total_paid_ugx);

  if (booking.status === "refunded") {
    return {
      label: "Refunded",
      detail: "Reservation refunded",
      style: "bg-stoneWarm-100 text-stoneWarm-500"
    };
  }
  if (booking.status === "pending_payment") {
    return {
      label: "Payment Pending",
      detail: formatUgx(due || booking.total_charges_ugx),
      style: "bg-bronze-400/10 text-bronze-500"
    };
  }
  if (booking.total_paid_ugx <= 0) {
    return {
      label: "Unpaid",
      detail: `${formatUgx(due)} due`,
      style: "bg-[#9c6b63]/10 text-[#83574f]"
    };
  }
  if (due > 0) {
    return {
      label: "Part Paid",
      detail: `${formatUgx(due)} due`,
      style: "bg-bronze-400/10 text-bronze-500"
    };
  }
  return {
    label: "Paid",
    detail: "Balance settled",
    style: "bg-oliveMuted-400/10 text-oliveMuted-600"
  };
}

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

type Filter = "all" | "today" | "upcoming" | "in_house" | "pending" | "history";

function applyFilter(bookings: BookingRow[], filter: Filter, today: string): BookingRow[] {
  switch (filter) {
    case "today":
      return bookings.filter(
        (booking) =>
          booking.check_in === today ||
          booking.check_out === today ||
          booking.status === "checked_in"
      );
    case "upcoming":
      return bookings.filter(
        (booking) =>
          booking.check_in > today &&
          (booking.status === "confirmed" || booking.status === "awaiting_confirmation")
      );
    case "in_house":
      return bookings.filter((booking) => booking.status === "checked_in");
    case "pending":
      return bookings.filter(
        (booking) =>
          booking.status === "pending_payment" || booking.status === "awaiting_confirmation"
      );
    case "history":
      return bookings.filter((booking) =>
        (["checked_out", "no_show", "cancelled", "refunded"] as BookingStatus[]).includes(
          booking.status
        )
      );
    default:
      return bookings;
  }
}

function SummaryMetric({
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
    <div className="flex min-w-[142px] flex-1 items-center gap-3 px-4 py-3.5 sm:px-5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-stoneWarm-100 text-oliveMuted-600">
        {icon}
      </span>
      <span>
        <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
          {label}
        </span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className="font-serif text-2xl font-semibold text-[#2a241a]">{value}</span>
          <span className="text-[10px] text-oliveMuted-500">{detail}</span>
        </span>
      </span>
    </div>
  );
}

function RoomThumbnail({ booking }: { booking: BookingRow }) {
  return (
    <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[18px] bg-gradient-to-br from-stoneWarm-100 to-stoneWarm-200 shadow-inner sm:h-[88px] sm:w-[88px]">
      <div className="absolute inset-0 grid place-items-center text-oliveMuted-500">
        <BedIcon className="h-7 w-7" />
      </div>
      {booking.room_image_url && (
        // Room images are admin-managed R2 URLs and may use different preview hosts.
        // A plain image keeps every configured host usable while retaining a quiet fallback.
        <img
          src={booking.room_image_url}
          alt={`${booking.room_type_title} room`}
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

function StatusPill({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-flex w-fit rounded-full border px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function BookingCard({
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
  const nights = stayNights(booking);
  const payment = paymentState(booking);
  const transitions = TRANSITIONS[booking.status] ?? [];
  const visibleTransitions = transitions.filter((transition) => !transition.adminOnly || role !== "staff");
  const primaryTransition = visibleTransitions.find(
    (transition) => transition.status === "checked_in" || transition.status === "checked_out"
  );
  const secondaryTransitions = visibleTransitions.filter(
    (transition) => transition !== primaryTransition
  );

  return (
    <article className="group overflow-hidden rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.07)] transition-all duration-200 hover:border-stoneWarm-300 hover:shadow-[0_18px_40px_rgba(55,43,30,0.1)]">
      <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(210px,0.75fr)_minmax(190px,0.6fr)] xl:items-center">
        <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
          <RoomThumbnail booking={booking} />
          <div className="min-w-0 pt-0.5">
            <h2 className="truncate font-serif text-[22px] font-semibold tracking-[-0.02em] text-[#2a241a] sm:text-2xl">
              {booking.guest_full_name}
            </h2>
            <p className="mt-1.5 truncate text-sm font-semibold text-oliveMuted-700">
              {booking.room_type_title}
            </p>
            <p className="mt-1 text-xs text-oliveMuted-500">
              {booking.room_unit_name ?? "Room not assigned"}
            </p>
            <div className="mt-3">
              <StatusPill status={booking.status} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-[20px] bg-stoneWarm-100/45 p-3.5 md:self-stretch xl:self-auto">
          <div className="col-span-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
              Stay dates
            </p>
            <p className="mt-1.5 text-sm font-semibold text-[#2a241a]">
              {formatShortDate(booking.check_in)} <span className="px-1 text-oliveMuted-400">to</span>{" "}
              {formatShortDate(booking.check_out)}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-oliveMuted-500">
              Duration
            </p>
            <p className="mt-1 text-xs font-medium text-oliveMuted-700">
              {nights} {nights === 1 ? "night" : "nights"}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-oliveMuted-500">
              Guests
            </p>
            <p className="mt-1 text-xs font-medium text-oliveMuted-700">{guestCount(booking)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-stoneWarm-200/70 pt-4 md:col-span-2 xl:col-span-1 xl:block xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0 xl:text-right">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
              Reservation total
            </p>
            <p className="mt-1.5 font-serif text-xl font-semibold text-[#2a241a]">
              {formatUgx(booking.total_charges_ugx)}
            </p>
          </div>
          <div className="text-right xl:mt-3">
            <span className={`inline-flex rounded-full px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] ${payment.style}`}>
              {payment.label}
            </span>
            <p className="mt-1 text-[10px] text-oliveMuted-500">{payment.detail}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-stoneWarm-200/70 bg-stoneWarm-100/20 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          {isExpanded ? "Hide details" : "View details"}
          <ChevronIcon open={isExpanded} />
        </button>
        {(booking.status === "confirmed" || booking.status === "checked_in") && (
          <Link
            href={`/bookings/${booking.id}/edit`}
            className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
          >
            Edit
          </Link>
        )}
        <Link
          href={`/bookings/${booking.id}/folio`}
          className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          View folio
        </Link>
        <Link
          href={`/bookings/${booking.id}`}
          className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          View history
        </Link>
        {primaryTransition && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => onStatus(primaryTransition.status)}
            className="ml-auto rounded-full bg-oliveMuted-600 px-4 py-2 text-xs font-semibold text-canvas-light shadow-[0_8px_20px_rgba(82,88,69,0.18)] transition hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Updating..." : primaryTransition.label}
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="grid gap-5 border-t border-stoneWarm-200/70 px-4 py-5 sm:px-5 lg:grid-cols-2">
          <div className="grid gap-4">
            <DetailPanel icon={<GuestIcon className="h-4 w-4" />} label="Guest contact">
              <p className="font-medium text-[#2a241a]">{booking.guest_full_name}</p>
              {booking.guest_email && (
                <a href={`mailto:${booking.guest_email}`} className="truncate text-oliveMuted-600 hover:text-[#2a241a]">
                  {booking.guest_email}
                </a>
              )}
              {booking.guest_phone && (
                <a href={`tel:${booking.guest_phone}`} className="text-oliveMuted-600 hover:text-[#2a241a]">
                  {booking.guest_phone}
                </a>
              )}
              {!booking.guest_email && !booking.guest_phone && (
                <p className="text-oliveMuted-500">No contact details recorded.</p>
              )}
            </DetailPanel>

            <DetailPanel icon={<CalendarIcon className="h-4 w-4" />} label="Stay details">
              <p className="font-medium text-[#2a241a]">
                {formatLongDate(booking.check_in)} to {formatLongDate(booking.check_out)}
              </p>
              <p className="text-oliveMuted-600">
                {nights} {nights === 1 ? "night" : "nights"} · {guestCount(booking)}
              </p>
              <p className="font-mono text-[11px] tracking-wide text-oliveMuted-500">
                {booking.reference}
              </p>
            </DetailPanel>
          </div>

          <div className="grid content-start gap-4">
            {booking.status === "confirmed" || booking.status === "checked_in" ? (
              <RoomAssignment bookingId={booking.id} assignedUnitName={booking.room_unit_name} />
            ) : (
              booking.room_unit_name && (
                <DetailPanel icon={<BedIcon className="h-4 w-4" />} label="Assigned room">
                  <p className="font-medium text-[#2a241a]">{booking.room_unit_name}</p>
                </DetailPanel>
              )
            )}

            {(booking.special_requests || booking.notes) && (
              <div className="grid gap-3">
                {booking.special_requests && (
                  <NotePanel label="Guest preference" tone="bronze">
                    {booking.special_requests}
                  </NotePanel>
                )}
                {booking.notes && <NotePanel label="Internal note">{booking.notes}</NotePanel>}
              </div>
            )}

            {secondaryTransitions.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/35 p-3.5">
                <p className="mr-auto text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                  Reservation actions
                </p>
                {secondaryTransitions.map((transition) => (
                  <button
                    key={transition.status}
                    type="button"
                    disabled={isPending}
                    onClick={() => onStatus(transition.status)}
                    className="rounded-full border border-[#9c6b63]/20 bg-[#9c6b63]/5 px-3 py-2 text-xs font-semibold text-[#83574f] transition hover:bg-[#9c6b63]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? "Updating..." : transition.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function DetailPanel({
  icon,
  label,
  children
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-stoneWarm-200/70 bg-white/55 p-4">
      <div className="flex items-center gap-2 text-oliveMuted-500">
        {icon}
        <p className="text-[9px] font-semibold uppercase tracking-[0.17em]">{label}</p>
      </div>
      <div className="mt-2 grid gap-1 text-sm">{children}</div>
    </div>
  );
}

function NotePanel({
  label,
  tone = "neutral",
  children
}: {
  label: string;
  tone?: "neutral" | "bronze";
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-[18px] border p-4 text-sm ${
      tone === "bronze"
        ? "border-bronze-400/20 bg-bronze-400/5 text-oliveMuted-700"
        : "border-stoneWarm-200/70 bg-stoneWarm-100/40 text-oliveMuted-700"
    }`}>
      <p className={`text-[9px] font-semibold uppercase tracking-[0.17em] ${
        tone === "bronze" ? "text-bronze-500" : "text-oliveMuted-500"
      }`}>
        {label}
      </p>
      <p className="mt-2 leading-6">{children}</p>
    </div>
  );
}

const EMPTY_STATES: Record<Filter, { title: string; description: string }> = {
  all: {
    title: "No bookings yet.",
    description: "New guest reservations will appear here as soon as they are created."
  },
  today: {
    title: "No bookings need attention today.",
    description: "There are no arrivals, departures, or in-house stays scheduled for today."
  },
  upcoming: {
    title: "No upcoming bookings.",
    description: "Future confirmed reservations will appear here automatically."
  },
  in_house: {
    title: "No guests are currently in house.",
    description: "Checked-in stays will remain here until reception completes check-out."
  },
  pending: {
    title: "No pending reservations.",
    description: "There are no payments or booking confirmations waiting for review."
  },
  history: {
    title: "No booking history yet.",
    description: "Completed, cancelled, refunded, and no-show reservations will appear here."
  }
};

function EmptyState({ filter }: { filter: Filter }) {
  const copy = EMPTY_STATES[filter];
  return (
    <div className="relative overflow-hidden rounded-[26px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-6 py-12 text-center shadow-[0_12px_30px_rgba(55,43,30,0.04)]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-stoneWarm-100/55 to-transparent" />
      <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-full border border-stoneWarm-200 bg-stoneWarm-100/70 text-oliveMuted-600 shadow-inner">
        <CalendarIcon className="h-7 w-7" />
      </span>
      <h2 className="relative mt-5 font-serif text-xl font-semibold text-[#2a241a]">{copy.title}</h2>
      <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-oliveMuted-600">
        {copy.description}
      </p>
    </div>
  );
}

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
  const today = operationalDate();

  function handleStatus(bookingId: string, newStatus: BookingStatus) {
    setError(null);
    setPendingId(bookingId);
    const formData = new FormData();
    formData.set("id", bookingId);
    formData.set("status", newStatus);

    startTransition(async () => {
      try {
        await updateBookingStatusAction(formData);
        setBookings((current) =>
          current.map((booking) =>
            booking.id === bookingId ? { ...booking, status: newStatus } : booking
          )
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update booking.");
      }
      setPendingId(null);
    });
  }

  const metrics = useMemo(() => {
    const arrivals = bookings.filter(
      (booking) => booking.check_in === today && booking.status === "confirmed"
    ).length;
    const inHouse = bookings.filter((booking) => booking.status === "checked_in").length;
    const departures = bookings.filter(
      (booking) => booking.check_out === today && booking.status === "checked_in"
    ).length;
    const upcoming = bookings.filter(
      (booking) =>
        booking.check_in > today &&
        (booking.status === "confirmed" || booking.status === "awaiting_confirmation")
    ).length;
    const pending = bookings.filter(
      (booking) =>
        booking.status === "pending_payment" || booking.status === "awaiting_confirmation"
    ).length;

    return { arrivals, inHouse, departures, upcoming, pending };
  }, [bookings, today]);

  const tabs: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: bookings.length },
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming", count: metrics.upcoming },
    { key: "in_house", label: "In House", count: metrics.inHouse },
    { key: "pending", label: "Pending", count: metrics.pending },
    { key: "history", label: "History" }
  ];

  const displayed = applyFilter(bookings, filter, today);

  return (
    <section className="grid gap-7 lg:gap-9">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-bronze-400/15" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-44 w-44 rounded-full border border-oliveMuted-400/10" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
              Reservations
            </p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
              Bookings
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
              Guest stays, payment position, room assignments, and front desk actions in one composed view.
            </p>
          </div>
          <Link
            href="/bookings/new"
            className="group inline-flex min-h-[52px] w-fit items-center gap-3 rounded-[18px] bg-oliveMuted-600 px-5 py-3 text-canvas-light shadow-[0_14px_30px_rgba(82,88,69,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-lg font-light transition-transform group-hover:rotate-90">
              +
            </span>
            <span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-canvas-light/70">
                Reservation
              </span>
              <span className="block text-sm font-semibold">New booking</span>
            </span>
          </Link>
        </div>
      </header>

      <section className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
        <div className="flex flex-wrap divide-y divide-stoneWarm-200/70 sm:divide-x sm:divide-y-0">
          <SummaryMetric icon={<ArrivalIcon />} label="Arrivals Today" value={metrics.arrivals} detail="expected" />
          <SummaryMetric icon={<BedIcon />} label="In House" value={metrics.inHouse} detail="stays" />
          <SummaryMetric icon={<DepartureIcon />} label="Departures Today" value={metrics.departures} detail="due" />
          <SummaryMetric icon={<CalendarIcon />} label="Upcoming" value={metrics.upcoming} detail="future" />
          <SummaryMetric icon={<ClockIcon />} label="Pending" value={metrics.pending} detail="review" />
        </div>
      </section>

      {error && (
        <div className="rounded-[20px] border border-[#9c6b63]/25 bg-[#9c6b63]/10 px-5 py-4 text-sm text-[#83574f] shadow-sm">
          {error}
        </div>
      )}

      <div className="grid gap-5">
        <div className="flex flex-wrap gap-2 rounded-[22px] border border-stoneWarm-200/70 bg-[#fffdf8]/80 p-2 shadow-[0_10px_26px_rgba(55,43,30,0.05)]">
          {tabs.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-[15px] px-3.5 py-2.5 text-xs font-semibold transition sm:px-4 ${
                  active
                    ? "bg-oliveMuted-600 text-canvas-light shadow-[0_8px_20px_rgba(82,88,69,0.2)]"
                    : "text-oliveMuted-600 hover:bg-stoneWarm-100"
                }`}
              >
                {tab.label}
                {typeof tab.count === "number" && tab.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                    active ? "bg-white/10 text-canvas-light" : "bg-stoneWarm-100 text-oliveMuted-500"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-4 px-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-bronze-500">
              {tabs.find((tab) => tab.key === filter)?.label} reservations
            </p>
            <p className="mt-1 text-sm text-oliveMuted-600">
              {displayed.length} {displayed.length === 1 ? "booking" : "bookings"} in this view
            </p>
          </div>
        </div>

        {displayed.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="grid gap-3.5">
            {displayed.map((booking) => (
              <BookingCard
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
      </div>
    </section>
  );
}
