"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { attachBookingToGroupAction, detachBookingFromGroupAction } from "@/lib/groups/actions";
import type { BookingRow } from "@/lib/bookings/types";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(parsed);
}

function stayNights(booking: BookingRow): number {
  const start = new Date(`${booking.check_in}T00:00:00Z`);
  const end = new Date(`${booking.check_out}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function balanceDue(booking: BookingRow): number {
  return Math.max(0, booking.total_charges_ugx - booking.total_paid_ugx);
}

function GroupMemberCard({
  booking,
  onDetach,
  pending
}: {
  booking: BookingRow;
  onDetach: (bookingId: string) => void;
  pending: boolean;
}) {
  const nights = stayNights(booking);

  return (
    <article className="grid gap-4 rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-serif text-lg font-semibold text-[#2a241a]">
            {booking.guest_full_name}
          </h3>
          <p className="mt-1 text-sm font-semibold text-oliveMuted-700">{booking.room_type_title}</p>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-oliveMuted-500">
            {booking.reference}
          </p>
        </div>
        <span className="rounded-full border border-oliveMuted-200 bg-oliveMuted-50 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-oliveMuted-600">
          {booking.status.replaceAll("_", " ")}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[18px] border border-stoneWarm-200/70 bg-white/70 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
            Stay
          </p>
          <p className="mt-1 text-sm font-semibold text-[#2a241a]">
            {formatDate(booking.check_in)} to {formatDate(booking.check_out)}
          </p>
          <p className="mt-1 text-xs text-oliveMuted-500">
            {nights} {nights === 1 ? "night" : "nights"}
          </p>
        </div>
        <div className="rounded-[18px] border border-stoneWarm-200/70 bg-white/70 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
            Charges
          </p>
          <p className="mt-1 text-sm font-semibold text-[#2a241a]">
            {fmtUgx(booking.total_charges_ugx)}
          </p>
          <p className="mt-1 text-xs text-oliveMuted-500">
            Paid {fmtUgx(booking.total_paid_ugx)}
          </p>
        </div>
        <div className="rounded-[18px] border border-stoneWarm-200/70 bg-white/70 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
            Balance due
          </p>
          <p className="mt-1 text-sm font-semibold text-[#2a241a]">{fmtUgx(balanceDue(booking))}</p>
          <p className="mt-1 text-xs text-oliveMuted-500">
            {booking.room_unit_name ?? "No room assigned"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-stoneWarm-200/70 pt-3">
        <Link
          href={`/bookings/${booking.id}`}
          className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          History
        </Link>
        <Link
          href={`/bookings/${booking.id}/folio`}
          className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          Folio
        </Link>
        <Link
          href={`/bookings/${booking.id}/edit`}
          className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          Edit
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => onDetach(booking.id)}
          className="ml-auto rounded-full border border-[#9c6b63]/20 bg-[#9c6b63]/5 px-3 py-2 text-xs font-semibold text-[#83574f] transition hover:bg-[#9c6b63]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Detaching..." : "Detach"}
        </button>
      </div>
    </article>
  );
}

const SELECT_CLASS =
  "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";

export function GroupMembershipManager({
  groupId,
  attachableBookings,
  bookings
}: {
  groupId: string;
  attachableBookings: BookingRow[];
  bookings: BookingRow[];
}) {
  const router = useRouter();
  const [attachBookingId, setAttachBookingId] = useState(attachableBookings[0]?.id ?? "");
  const [pendingAttach, setPendingAttach] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const attachable = useMemo(() => attachableBookings, [attachableBookings]);

  function handleAttach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!attachBookingId) {
      setError("Please select a booking to attach.");
      return;
    }

    setPendingAttach(true);
    const formData = new FormData();
    formData.set("bookingId", attachBookingId);
    formData.set("groupId", groupId);

    startTransition(async () => {
      const result = await attachBookingToGroupAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setAttachBookingId("");
        router.refresh();
      }
      setPendingAttach(false);
    });
  }

  function handleDetach(bookingId: string) {
    setError(null);
    setPendingBookingId(bookingId);

    const formData = new FormData();
    formData.set("bookingId", bookingId);

    startTransition(async () => {
      const result = await detachBookingFromGroupAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
      setPendingBookingId(null);
    });
  }

  return (
    <div className="grid gap-5">
      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleAttach} className="grid gap-4 rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
        <div className="grid gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
            Attach existing booking
          </p>
          <p className="text-sm text-oliveMuted-600">
            Add an existing booking to this group without changing the booking&apos;s room, folio, or housekeeping flow.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select
            value={attachBookingId}
            onChange={(event) => setAttachBookingId(event.target.value)}
            className={SELECT_CLASS}
            disabled={attachable.length === 0}
          >
            <option value="">{attachable.length === 0 ? "No bookings available to attach" : "Select a booking"}</option>
            {attachable.map((booking) => (
              <option key={booking.id} value={booking.id}>
                {booking.reference} - {booking.guest_full_name} ({booking.room_type_title})
                {booking.group_name ? ` - ${booking.group_name}` : ""}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pendingAttach || attachable.length === 0}
            className="rounded-2xl bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingAttach ? "Attaching..." : "Attach booking"}
          </button>
        </div>
      </form>

      <div className="grid gap-4">
        <div className="flex items-end justify-between gap-4 px-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
              Member bookings
            </p>
            <h3 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
              Booking list
            </h3>
          </div>
          <p className="text-sm text-oliveMuted-500">
            {bookings.length} booking{bookings.length === 1 ? "" : "s"}
          </p>
        </div>

        {bookings.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-6 py-10 text-sm text-oliveMuted-600">
            No bookings have been attached to this group yet.
          </div>
        ) : (
          <div className="grid gap-3">
            {bookings.map((booking) => (
              <GroupMemberCard
                key={booking.id}
                booking={booking}
                pending={isPending && pendingBookingId === booking.id}
                onDetach={handleDetach}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
