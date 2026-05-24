"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postChargeAction, voidChargeAction, recordPaymentAction } from "@/lib/folios/actions";
import type { AdminRole } from "@/lib/auth/session";
import type { BookingRow, BookingStatus } from "@/lib/bookings/types";
import type { FolioCategory, FolioCharge, FolioData, FolioPayment, PaymentMethod } from "@/lib/folios/types";

// ─── Formatting ──────────────────────────────────────────────────────────────

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG").format(n) + " UGX";
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(iso));
}

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function nights(checkIn: string, checkOut: string): number {
  return Math.round(
    (new Date(checkOut + "T00:00:00Z").getTime() - new Date(checkIn + "T00:00:00Z").getTime()) /
      86400000
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

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

// ─── Category badges ──────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<FolioCategory, string> = {
  accommodation: "Accommodation",
  food: "Food",
  beverage: "Beverage",
  other: "Other",
  tax: "Tax",
  discount: "Discount"
};

const CATEGORY_STYLE: Record<FolioCategory, string> = {
  accommodation: "bg-blue-100 text-blue-800",
  food: "bg-amber-100 text-amber-800",
  beverage: "bg-purple-100 text-purple-800",
  other: "bg-stoneWarm-100 text-oliveMuted-600",
  tax: "bg-red-100 text-red-700",
  discount: "bg-green-100 text-green-800"
};

// ─── Payment method badges ────────────────────────────────────────────────────

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pesapal: "Pesapal",
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  transfer: "Transfer"
};

const METHOD_STYLE: Record<PaymentMethod, string> = {
  pesapal: "bg-indigo-100 text-indigo-800",
  cash: "bg-green-100 text-green-800",
  mpesa: "bg-green-100 text-green-800",
  card: "bg-blue-100 text-blue-800",
  transfer: "bg-stoneWarm-100 text-oliveMuted-600"
};

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-oliveMuted-500">
      {children}
    </p>
  );
}

// ─── Charges list ─────────────────────────────────────────────────────────────

function ChargesList({
  charges,
  bookingId,
  role,
  isPending,
  onVoid
}: {
  charges: FolioCharge[];
  bookingId: string;
  role: AdminRole;
  isPending: boolean;
  onVoid: (chargeId: string) => void;
}) {
  if (charges.length === 0) {
    return <p className="text-sm text-oliveMuted-500">No charges posted yet.</p>;
  }

  return (
    <div className="grid gap-2">
      {charges.map((charge) => (
        <div
          key={charge.id}
          className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-stoneWarm-100 bg-white px-4 py-3 ${
            charge.voided_at ? "opacity-50" : ""
          }`}
        >
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_STYLE[charge.category]}`}
              >
                {CATEGORY_LABEL[charge.category]}
              </span>
              {charge.voided_at && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-700">
                  Voided
                </span>
              )}
            </div>
            <p className={`text-sm font-medium ${charge.voided_at ? "line-through" : ""}`}>
              {charge.description}
            </p>
            <p className="text-xs text-oliveMuted-500">
              {fmtDateTime(charge.posted_at)}
              {charge.posted_by_name ? ` · ${charge.posted_by_name}` : ""}
              {charge.voided_at ? ` · Voided ${fmtDateTime(charge.voided_at)}` : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <p className={`text-sm font-semibold ${charge.voided_at ? "line-through text-oliveMuted-400" : ""}`}>
              {fmtUgx(charge.amount_ugx)}
            </p>
            {!charge.voided_at && role !== "staff" && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => onVoid(charge.id)}
                className="print:hidden rounded-xl border border-stoneWarm-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                Void
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Payments list ────────────────────────────────────────────────────────────

function PaymentsList({ payments }: { payments: FolioPayment[] }) {
  if (payments.length === 0) {
    return <p className="text-sm text-oliveMuted-500">No payments recorded yet.</p>;
  }

  return (
    <div className="grid gap-2">
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-stoneWarm-100 bg-white px-4 py-3"
        >
          <div className="grid min-w-0 gap-1">
            <span
              className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${METHOD_STYLE[payment.method]}`}
            >
              {METHOD_LABEL[payment.method]}
            </span>
            <p className="text-xs text-oliveMuted-500">
              {fmtDateTime(payment.recorded_at)}
              {payment.recorded_by_name ? ` · ${payment.recorded_by_name}` : ""}
              {payment.reference ? ` · Ref: ${payment.reference}` : ""}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-green-700">{fmtUgx(payment.amount_ugx)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Post charge form ─────────────────────────────────────────────────────────

function PostChargeForm({
  bookingId,
  formKey,
  isPending,
  onSubmit
}: {
  bookingId: string;
  formKey: number;
  isPending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form
      key={formKey}
      className="print:hidden grid gap-3 rounded-2xl border border-stoneWarm-200 bg-stoneWarm-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <p className="text-sm font-semibold">Post a Charge</p>
      <input type="hidden" name="booking_id" value={bookingId} />

      <div className="grid gap-3 sm:grid-cols-[160px_1fr_140px]">
        <select
          name="category"
          required
          defaultValue=""
          className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Category
          </option>
          <option value="accommodation">Accommodation</option>
          <option value="food">Food</option>
          <option value="beverage">Beverage</option>
          <option value="tax">Tax</option>
          <option value="discount">Discount</option>
          <option value="other">Other</option>
        </select>

        <input
          name="description"
          type="text"
          required
          placeholder="Description"
          className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
        />

        <input
          name="amount_ugx"
          type="number"
          required
          min="1"
          step="1"
          placeholder="Amount (UGX)"
          className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:opacity-50"
        >
          {isPending ? "Posting…" : "Post Charge"}
        </button>
      </div>
    </form>
  );
}

// ─── Record payment form ──────────────────────────────────────────────────────

function RecordPaymentForm({
  bookingId,
  formKey,
  isPending,
  onSubmit
}: {
  bookingId: string;
  formKey: number;
  isPending: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form
      key={formKey}
      className="print:hidden grid gap-3 rounded-2xl border border-stoneWarm-200 bg-stoneWarm-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <p className="text-sm font-semibold">Record a Payment</p>
      <input type="hidden" name="booking_id" value={bookingId} />

      <div className="grid gap-3 sm:grid-cols-[160px_140px_1fr]">
        <select
          name="method"
          required
          defaultValue=""
          className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Method
          </option>
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="card">Card</option>
          <option value="transfer">Bank Transfer</option>
          <option value="pesapal">Pesapal</option>
        </select>

        <input
          name="amount_ugx"
          type="number"
          required
          min="1"
          step="1"
          placeholder="Amount (UGX)"
          className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
        />

        <input
          name="reference"
          type="text"
          placeholder="Reference (optional)"
          className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:opacity-50"
        >
          {isPending ? "Recording…" : "Record Payment"}
        </button>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FolioClient({
  booking,
  initialFolio,
  role
}: {
  booking: BookingRow;
  initialFolio: FolioData;
  role: AdminRole;
}) {
  const router = useRouter();
  const [chargeFormKey, setChargeFormKey] = useState(0);
  const [paymentFormKey, setPaymentFormKey] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const n = nights(booking.check_in, booking.check_out);

  const totalCharges = initialFolio.charges
    .filter((c) => !c.voided_at)
    .reduce((sum, c) => sum + c.amount_ugx, 0);
  const totalPaid = initialFolio.payments.reduce((sum, p) => sum + p.amount_ugx, 0);
  const balanceDue = totalCharges - totalPaid;

  function handleCharge(fd: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await postChargeAction(fd);
        setChargeFormKey((k) => k + 1);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to post charge.");
      }
    });
  }

  function handleVoid(chargeId: string) {
    setError(null);
    const fd = new FormData();
    fd.set("charge_id", chargeId);
    fd.set("booking_id", booking.id);
    startTransition(async () => {
      try {
        await voidChargeAction(fd);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to void charge.");
      }
    });
  }

  function handlePayment(fd: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await recordPaymentAction(fd);
        setPaymentFormKey((k) => k + 1);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to record payment.");
      }
    });
  }

  return (
    <div className="grid gap-6">
      {/* Print header — hidden on screen */}
      <div className="hidden print:block">
        <p className="text-lg font-bold">Mubende Country Resort</p>
        <p className="text-sm text-oliveMuted-600">Guest Folio</p>
      </div>

      {/* Booking header */}
      <div className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{booking.guest_full_name}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLE[booking.status]}`}
              >
                {STATUS_LABEL[booking.status]}
              </span>
            </div>
            <p className="font-mono text-xs text-oliveMuted-500">{booking.reference}</p>
            <div className="flex flex-wrap gap-4 text-sm text-oliveMuted-600">
              <span>{booking.room_type_title}</span>
              <span>
                {fmtDate(booking.check_in)} → {fmtDate(booking.check_out)}{" "}
                <span className="text-oliveMuted-400">
                  ({n} {n === 1 ? "night" : "nights"})
                </span>
              </span>
              <span>
                {booking.guests_adults} adult{booking.guests_adults !== 1 ? "s" : ""}
                {booking.guests_children > 0
                  ? `, ${booking.guests_children} child${booking.guests_children !== 1 ? "ren" : ""}`
                  : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-oliveMuted-600">
              {booking.guest_email && (
                <a href={`mailto:${booking.guest_email}`} className="hover:underline">
                  {booking.guest_email}
                </a>
              )}
              {booking.guest_phone && (
                <a href={`tel:${booking.guest_phone}`} className="hover:underline">
                  {booking.guest_phone}
                </a>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="print:hidden rounded-2xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
          >
            Print Folio
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="print:hidden rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Balance summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="surface-card p-4">
          <SectionLabel>Total Charges</SectionLabel>
          <p className="mt-2 text-xl font-semibold">{fmtUgx(totalCharges)}</p>
        </div>
        <div className="surface-card p-4">
          <SectionLabel>Total Paid</SectionLabel>
          <p className="mt-2 text-xl font-semibold text-green-700">{fmtUgx(totalPaid)}</p>
        </div>
        <div className="surface-card p-4">
          <SectionLabel>Balance Due</SectionLabel>
          <p className={`mt-2 text-xl font-semibold ${balanceDue > 0 ? "text-red-600" : "text-green-700"}`}>
            {balanceDue < 0 ? "-" : ""}{fmtUgx(Math.abs(balanceDue))}
          </p>
        </div>
      </div>

      {/* Charges section */}
      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Charges</h2>
          <span className="text-sm text-oliveMuted-500">
            {initialFolio.charges.filter((c) => !c.voided_at).length} active
          </span>
        </div>

        <ChargesList
          charges={initialFolio.charges}
          bookingId={booking.id}
          role={role}
          isPending={isPending}
          onVoid={handleVoid}
        />

        <PostChargeForm
          bookingId={booking.id}
          formKey={chargeFormKey}
          isPending={isPending}
          onSubmit={handleCharge}
        />
      </section>

      <hr className="border-stoneWarm-100" />

      {/* Payments section */}
      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Payments</h2>
          <span className="text-sm text-oliveMuted-500">
            {initialFolio.payments.length} recorded
          </span>
        </div>

        <PaymentsList payments={initialFolio.payments} />

        <RecordPaymentForm
          bookingId={booking.id}
          formKey={paymentFormKey}
          isPending={isPending}
          onSubmit={handlePayment}
        />
      </section>

      {/* Print footer */}
      <div className="hidden print:block mt-8 border-t border-stoneWarm-200 pt-4 text-xs text-oliveMuted-500">
        Printed {new Date().toLocaleString("en-UG")} · Mubende Country Resort
      </div>
    </div>
  );
}
