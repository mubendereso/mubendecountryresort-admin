"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createStaffBookingAction } from "@/lib/bookings/actions";

type RoomOption = { slug: string; title: string; priceUgx: number };

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG").format(n) + " UGX";
}

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut || checkIn >= checkOut) return 0;
  const a = new Date(checkIn + "T00:00:00Z");
  const b = new Date(checkOut + "T00:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function NewBookingForm({ rooms }: { rooms: RoomOption[] }) {
  const router = useRouter();
  const today = todayISO();

  const [roomSlug, setRoomSlug] = useState(rooms[0]?.slug ?? "");
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(addDays(today, 1));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.slug === roomSlug) ?? null,
    [rooms, roomSlug]
  );
  const nights = nightsBetween(checkIn, checkOut);
  const total = selectedRoom ? selectedRoom.priceUgx * nights : 0;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createStaffBookingAction(formData);
      if (result.ok) {
        router.push(`/bookings/${result.bookingId}/folio`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const fieldClass =
    "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";
  const labelClass =
    "text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500";

  if (rooms.length === 0) {
    return (
      <section className="grid gap-6">
        <h1 className="text-3xl font-semibold">New Booking</h1>
        <div className="surface-card px-5 py-6 text-sm text-oliveMuted-600">
          No published room types are available. Publish a room first.
        </div>
      </section>
    );
  }

  return (
    <section className="grid max-w-3xl gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">New Booking</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">
            Create a walk-in or phone reservation. Confirmed immediately; settle payment at the desk via the folio.
          </p>
        </div>
        <Link
          href="/front-desk"
          className="rounded-2xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          ← Front Desk
        </Link>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-5">
        {/* Room + dates */}
        <div className="surface-card grid gap-4 p-5">
          <div className="grid gap-1.5">
            <label htmlFor="roomTypeSlug" className={labelClass}>Room Type</label>
            <select
              id="roomTypeSlug"
              name="roomTypeSlug"
              value={roomSlug}
              onChange={(e) => setRoomSlug(e.target.value)}
              className={fieldClass}
              required
            >
              {rooms.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.title} — {fmtUgx(r.priceUgx)}/night
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="checkIn" className={labelClass}>Check-in</label>
              <input
                id="checkIn"
                name="checkIn"
                type="date"
                value={checkIn}
                min={today}
                onChange={(e) => {
                  const v = e.target.value;
                  setCheckIn(v);
                  if (v >= checkOut) setCheckOut(addDays(v, 1));
                }}
                className={fieldClass}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="checkOut" className={labelClass}>Check-out</label>
              <input
                id="checkOut"
                name="checkOut"
                type="date"
                value={checkOut}
                min={addDays(checkIn, 1)}
                onChange={(e) => setCheckOut(e.target.value)}
                className={fieldClass}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="guestsAdults" className={labelClass}>Adults</label>
              <input
                id="guestsAdults"
                name="guestsAdults"
                type="number"
                min={1}
                value={adults}
                onChange={(e) => setAdults(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={fieldClass}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="guestsChildren" className={labelClass}>Children</label>
              <input
                id="guestsChildren"
                name="guestsChildren"
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className={fieldClass}
              />
            </div>
          </div>
        </div>

        {/* Guest details */}
        <div className="surface-card grid gap-4 p-5">
          <div className="grid gap-1.5">
            <label htmlFor="guestFullName" className={labelClass}>Guest Full Name</label>
            <input
              id="guestFullName"
              name="guestFullName"
              type="text"
              autoComplete="off"
              className={fieldClass}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="guestPhone" className={labelClass}>Phone (required)</label>
              <input
                id="guestPhone"
                name="guestPhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                className={fieldClass}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="guestEmail" className={labelClass}>Email (optional)</label>
              <input
                id="guestEmail"
                name="guestEmail"
                type="email"
                autoComplete="off"
                className={fieldClass}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="specialRequests" className={labelClass}>Special Requests</label>
            <textarea
              id="specialRequests"
              name="specialRequests"
              rows={2}
              className={fieldClass}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="notes" className={labelClass}>Internal Notes</label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              className={fieldClass}
            />
          </div>
        </div>

        {/* Quote + submit */}
        <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className={labelClass}>Total</p>
            <p className="mt-1 text-2xl font-semibold">{fmtUgx(total)}</p>
            <p className="text-xs text-oliveMuted-500">
              {nights} {nights === 1 ? "night" : "nights"}
              {selectedRoom ? ` × ${fmtUgx(selectedRoom.priceUgx)}` : ""}
            </p>
          </div>
          <button
            type="submit"
            disabled={isPending || nights <= 0}
            className="rounded-2xl bg-oliveMuted-600 px-6 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create Booking"}
          </button>
        </div>
      </form>
    </section>
  );
}
