"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import { createStaffBookingAction, modifyBookingAction } from "@/lib/bookings/actions";

export type RoomOption = { slug: string; title: string; priceUgx: number };

export type BookingFormInitial = {
  roomSlug: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  fullName: string;
  phone: string;
  email: string;
  specialRequests: string;
  notes: string;
};

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

const FIELD_CLASS =
  "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500";

export function BookingForm({
  mode,
  rooms,
  bookingId,
  status,
  initial
}: {
  mode: "create" | "edit";
  rooms: RoomOption[];
  bookingId?: string;
  status?: "confirmed" | "checked_in";
  initial?: BookingFormInitial;
}) {
  const router = useRouter();
  const today = todayISO();
  const isEdit = mode === "edit";
  const isCheckedIn = status === "checked_in";

  const [roomSlug, setRoomSlug] = useState(initial?.roomSlug ?? rooms[0]?.slug ?? "");
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? today);
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? addDays(today, 1));
  const [adults, setAdults] = useState(initial?.adults ?? 1);
  const [children, setChildren] = useState(initial?.children ?? 0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.slug === roomSlug) ?? null,
    [rooms, roomSlug]
  );
  const nights = nightsBetween(checkIn, checkOut);
  const total = selectedRoom ? selectedRoom.priceUgx * nights : 0;
  const balanceDue = Math.max(0, total - depositAmount);

  // A checked-in guest may keep a past check-in date; otherwise no past dates.
  const checkInMin = isCheckedIn ? undefined : today;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = isEdit
        ? await modifyBookingAction(formData)
        : await createStaffBookingAction(formData);
      if (result.ok) {
        router.push(`/bookings/${result.bookingId}/folio`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (rooms.length === 0) {
    return (
      <section className="grid gap-6">
        <h1 className="text-3xl font-semibold">{isEdit ? "Edit Booking" : "New Booking"}</h1>
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
          <h1 className="text-3xl font-semibold">{isEdit ? "Edit Booking" : "New Booking"}</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">
            {isEdit
              ? "Update room, dates, guest count, or contact details."
              : "Create a walk-in or phone reservation, record any deposit, and send the balance to the folio."}
          </p>
        </div>
        <Link
          href={isEdit && bookingId ? `/bookings/${bookingId}/folio` : "/front-desk"}
          className="rounded-2xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          ← Cancel
        </Link>
      </header>

      {isCheckedIn && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This guest is checked in. Changing the room or dates will update the
          accommodation charge already posted to the folio.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-5">
        {isEdit && bookingId && <input type="hidden" name="bookingId" value={bookingId} />}

        {/* Room + dates */}
        <div className="surface-card grid gap-4 p-5">
          <div className="grid gap-1.5">
            <label htmlFor="roomTypeSlug" className={LABEL_CLASS}>Room Type</label>
            <select
              id="roomTypeSlug"
              name="roomTypeSlug"
              value={roomSlug}
              onChange={(e) => setRoomSlug(e.target.value)}
              className={FIELD_CLASS}
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
              <label htmlFor="checkIn" className={LABEL_CLASS}>Check-in</label>
              <input
                id="checkIn"
                name="checkIn"
                type="date"
                value={checkIn}
                min={checkInMin}
                onChange={(e) => {
                  const v = e.target.value;
                  setCheckIn(v);
                  if (v >= checkOut) setCheckOut(addDays(v, 1));
                }}
                className={FIELD_CLASS}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="checkOut" className={LABEL_CLASS}>Check-out</label>
              <input
                id="checkOut"
                name="checkOut"
                type="date"
                value={checkOut}
                min={addDays(checkIn, 1)}
                onChange={(e) => setCheckOut(e.target.value)}
                className={FIELD_CLASS}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="guestsAdults" className={LABEL_CLASS}>Adults</label>
              <input
                id="guestsAdults"
                name="guestsAdults"
                type="number"
                min={1}
                value={adults}
                onChange={(e) => setAdults(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className={FIELD_CLASS}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="guestsChildren" className={LABEL_CLASS}>Children</label>
              <input
                id="guestsChildren"
                name="guestsChildren"
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className={FIELD_CLASS}
              />
            </div>
          </div>
        </div>

        {/* Guest details */}
        <div className="surface-card grid gap-4 p-5">
          <div className="grid gap-1.5">
            <label htmlFor="guestFullName" className={LABEL_CLASS}>Guest Full Name</label>
            <input
              id="guestFullName"
              name="guestFullName"
              type="text"
              autoComplete="off"
              defaultValue={initial?.fullName ?? ""}
              className={FIELD_CLASS}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="guestPhone" className={LABEL_CLASS}>Phone (required)</label>
              <input
                id="guestPhone"
                name="guestPhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                defaultValue={initial?.phone ?? ""}
                className={FIELD_CLASS}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="guestEmail" className={LABEL_CLASS}>Email (optional)</label>
              <input
                id="guestEmail"
                name="guestEmail"
                type="email"
                autoComplete="off"
                defaultValue={initial?.email ?? ""}
                className={FIELD_CLASS}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="specialRequests" className={LABEL_CLASS}>Special Requests</label>
            <textarea
              id="specialRequests"
              name="specialRequests"
              rows={2}
              defaultValue={initial?.specialRequests ?? ""}
              className={FIELD_CLASS}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="notes" className={LABEL_CLASS}>Internal Notes</label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={initial?.notes ?? ""}
              className={FIELD_CLASS}
            />
          </div>
        </div>

        {!isEdit && (
          <div className="surface-card grid gap-4 p-5">
            <div>
              <p className={LABEL_CLASS}>Deposit Received</p>
              <p className="mt-1 text-sm text-oliveMuted-600">
                Optional. When entered, the room charge is posted to the folio now and this payment reduces the balance due.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="depositAmountUgx" className={LABEL_CLASS}>Amount (UGX)</label>
                <UgxAmountInput
                  id="depositAmountUgx"
                  name="depositAmountUgx"
                  value={depositAmount}
                  onValueChange={setDepositAmount}
                  className={FIELD_CLASS}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="depositMethod" className={LABEL_CLASS}>Method</label>
                <select
                  id="depositMethod"
                  name="depositMethod"
                  className={FIELD_CLASS}
                  disabled={depositAmount <= 0}
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">Mobile Money</option>
                  <option value="card">Card</option>
                  <option value="transfer">Bank Transfer</option>
                </select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="depositReference" className={LABEL_CLASS}>Payment Reference</label>
              <input
                id="depositReference"
                name="depositReference"
                type="text"
                autoComplete="off"
                placeholder="Receipt, mobile money ID, or note"
                className={FIELD_CLASS}
                disabled={depositAmount <= 0}
              />
            </div>
          </div>
        )}

        {/* Quote + submit */}
        <div className="surface-card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className={LABEL_CLASS}>Total</p>
            <p className="mt-1 text-2xl font-semibold">{fmtUgx(total)}</p>
            <p className="text-xs text-oliveMuted-500">
              {nights} {nights === 1 ? "night" : "nights"}
              {selectedRoom ? ` × ${fmtUgx(selectedRoom.priceUgx)}` : ""}
            </p>
            {!isEdit && depositAmount > 0 && (
              <p className="mt-2 text-sm font-semibold text-oliveMuted-700">
                Deposit {fmtUgx(depositAmount)} - balance {fmtUgx(balanceDue)}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isPending || nights <= 0}
            className="rounded-2xl bg-oliveMuted-600 px-6 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:opacity-50"
          >
            {isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Booking"}
          </button>
        </div>
      </form>
    </section>
  );
}
