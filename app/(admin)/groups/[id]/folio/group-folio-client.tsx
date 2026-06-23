"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import type { AdminRole } from "@/lib/auth/session";
import { recordGroupPaymentAction } from "@/lib/groups/folio-actions";
import type { GroupFolioData, GroupFolioBooking } from "@/lib/groups/folio-data";
import type { FolioCharge, FolioPayment, PaymentMethod } from "@/lib/folios/types";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function fmtDate(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function fmtDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala"
  }).format(new Date(value));
}

function signedChargeAmount(charge: FolioCharge): number {
  return charge.category === "discount" ? -charge.amount_ugx : charge.amount_ugx;
}

function activeCharges(charges: FolioCharge[]): number {
  return charges
    .filter((charge) => !charge.voided_at)
    .reduce((sum, charge) => sum + signedChargeAmount(charge), 0);
}

function totalPayments(payments: FolioPayment[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount_ugx, 0);
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pesapal: "Pesapal",
  pesapal_manual: "Pesapal Balance Payment",
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  transfer: "Bank Transfer"
};

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="surface-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-oliveMuted-500">
        {label}
      </p>
      <p className={`mt-2 text-xl font-semibold ${tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-600" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function MemberFolioRow({ booking }: { booking: GroupFolioBooking }) {
  const charges = activeCharges(booking.charges);
  const paid = totalPayments(booking.payments);
  const balance = charges - paid;

  return (
    <div className="rounded-2xl border border-stoneWarm-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/bookings/${booking.id}/folio`}
              className="font-mono text-xs font-semibold text-oliveMuted-700 hover:underline"
            >
              {booking.reference}
            </Link>
            <span className="rounded-full bg-stoneWarm-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-oliveMuted-600">
              {booking.status.replaceAll("_", " ")}
            </span>
          </div>
          <p className="text-sm font-semibold text-[#2a241a]">{booking.guest_full_name}</p>
          <p className="text-xs text-oliveMuted-500">
            {booking.room_type_title}
            {booking.room_unit_name ? ` - ${booking.room_unit_name}` : ""} - {fmtDate(booking.check_in)} to {fmtDate(booking.check_out)}
          </p>
        </div>
        <div className="grid gap-1 text-right text-sm">
          <span>Charges {fmtUgx(charges)}</span>
          <span className="text-green-700">Paid {fmtUgx(paid)}</span>
          <span className={balance > 0 ? "font-semibold text-red-600" : "font-semibold text-green-700"}>
            Balance {fmtUgx(Math.max(0, balance))}
          </span>
        </div>
      </div>
      {booking.payments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {booking.payments.map((payment) => (
            <span
              key={payment.id}
              className="rounded-full border border-stoneWarm-200 bg-stoneWarm-50 px-2.5 py-1 text-[11px] text-oliveMuted-600"
            >
              {METHOD_LABEL[payment.method]} {fmtUgx(payment.amount_ugx)}
              {payment.receipt_id && (
                <>
                  {" - "}
                  <Link href={`/bookings/${payment.booking_id}/receipts/${payment.receipt_id}`} className="font-semibold hover:underline">
                    {payment.receipt_number ?? "Receipt"}
                  </Link>
                </>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupPaymentForm({
  groupId,
  balanceDue,
  isPending,
  formKey,
  onSubmit
}: {
  groupId: string;
  balanceDue: number;
  isPending: boolean;
  formKey: number;
  onSubmit: (formData: FormData) => void;
}) {
  const [method, setMethod] = useState<Exclude<PaymentMethod, "pesapal"> | "">("");

  return (
    <form
      key={formKey}
      className="print:hidden grid gap-3 rounded-2xl border border-stoneWarm-200 bg-stoneWarm-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <div>
        <p className="text-sm font-semibold text-[#2a241a]">Record Group Payment</p>
        <p className="mt-1 text-xs text-oliveMuted-500">
          Payments are automatically allocated to active member bookings by oldest stay balance first.
        </p>
      </div>
      <input type="hidden" name="group_id" value={groupId} />

      <div className="grid gap-3 lg:grid-cols-[180px_160px_1fr]">
        <select
          name="method"
          required
          value={method}
          onChange={(event) => setMethod(event.target.value as Exclude<PaymentMethod, "pesapal">)}
          className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Method
          </option>
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="card">Card</option>
          <option value="transfer">Bank Transfer</option>
          <option value="pesapal_manual">Pesapal Balance Payment</option>
        </select>
        <UgxAmountInput
          name="amount_ugx"
          required
          minLength={1}
          placeholder="Amount"
          className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
        />
        <input
          name="reference"
          type="text"
          required={method === "pesapal_manual"}
          placeholder={method === "pesapal_manual" ? "Pesapal transaction reference" : "Reference"}
          className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
        />
      </div>
      <input
        name="note"
        type="text"
        placeholder="Note (optional)"
        className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-oliveMuted-500">Maximum active balance: {fmtUgx(Math.max(0, balanceDue))}</p>
        <button
          type="submit"
          disabled={isPending || balanceDue <= 0}
          className="rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:opacity-50"
        >
          {isPending ? "Recording..." : "Record Group Payment"}
        </button>
      </div>
    </form>
  );
}

export function GroupFolioClient({
  data,
  renderedAt
}: {
  data: GroupFolioData;
  role: AdminRole;
  renderedAt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    return data.bookings.reduce(
      (sum, booking) => {
        const charges = activeCharges(booking.charges);
        const paid = totalPayments(booking.payments);
        return {
          charges: sum.charges + charges,
          paid: sum.paid + paid,
          balance: sum.balance + Math.max(0, charges - paid)
        };
      },
      { charges: 0, paid: 0, balance: 0 }
    );
  }, [data.bookings]);

  function handlePayment(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await recordGroupPaymentAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFormKey((key) => key + 1);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div className="hidden print:block">
        <p className="text-lg font-bold">Mubende Country Resort</p>
        <p className="text-sm text-oliveMuted-600">Group Folio</p>
      </div>

      <header className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-semibold text-oliveMuted-500">{data.group.reference}</p>
            <h1 className="mt-2 text-2xl font-semibold text-[#2a241a]">{data.group.group_name}</h1>
            <p className="mt-2 text-sm text-oliveMuted-600">
              {data.group.organizer_name ?? "Organizer not recorded"}
              {data.group.organizer_email ? ` - ${data.group.organizer_email}` : ""}
              {data.group.organizer_phone ? ` - ${data.group.organizer_phone}` : ""}
            </p>
          </div>
          <div className="print:hidden flex flex-wrap gap-2">
            <Link
              href={`/groups/${data.group.id}/statement`}
              className="rounded-2xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
            >
              Statement
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-2xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
            >
              Print Folio
            </button>
            <Link
              href={`/groups/${data.group.id}`}
              className="rounded-2xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
            >
              Back to Group
            </Link>
          </div>
        </div>
      </header>

      {error && (
        <div className="print:hidden rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Charges" value={fmtUgx(totals.charges)} />
        <StatCard label="Total Paid" value={fmtUgx(totals.paid)} tone="good" />
        <StatCard label="Balance Due" value={fmtUgx(totals.balance)} tone={totals.balance > 0 ? "bad" : "good"} />
      </div>

      <GroupPaymentForm
        groupId={data.group.id}
        balanceDue={totals.balance}
        isPending={isPending}
        formKey={formKey}
        onSubmit={handlePayment}
      />

      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-[#2a241a]">Member Folios</h2>
          <span className="text-sm text-oliveMuted-500">{data.bookings.length} booking{data.bookings.length === 1 ? "" : "s"}</span>
        </div>
        <div className="grid gap-3">
          {data.bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stoneWarm-300 bg-[#fffdf8] px-6 py-10 text-sm text-oliveMuted-600">
              No member bookings have been attached to this group yet.
            </div>
          ) : (
            data.bookings.map((booking) => <MemberFolioRow key={booking.id} booking={booking} />)
          )}
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-[#2a241a]">Group Payments</h2>
          <span className="text-sm text-oliveMuted-500">{data.groupPayments.length} recorded</span>
        </div>
        <div className="grid gap-3">
          {data.groupPayments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stoneWarm-300 bg-[#fffdf8] px-6 py-10 text-sm text-oliveMuted-600">
              No group-level payments have been recorded yet.
            </div>
          ) : (
            data.groupPayments.map((payment) => {
              const allocations = data.allocations.filter((allocation) => allocation.group_payment_id === payment.id);
              return (
                <div key={payment.id} className="rounded-2xl border border-stoneWarm-100 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#2a241a]">
                        {METHOD_LABEL[payment.method]} - {fmtUgx(payment.amount_ugx)}
                      </p>
                      <p className="mt-1 text-xs text-oliveMuted-500">
                        {fmtDateTime(payment.recorded_at)}
                        {payment.recorded_by_name ? ` - ${payment.recorded_by_name}` : ""}
                        {payment.reference ? ` - Ref: ${payment.reference}` : ""}
                      </p>
                      {payment.note && <p className="mt-2 text-sm text-oliveMuted-600">{payment.note}</p>}
                    </div>
                    <p className="text-sm font-semibold text-green-700">
                      Allocated {fmtUgx(payment.allocated_amount_ugx)}
                    </p>
                  </div>
                  {allocations.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {allocations.map((allocation) => (
                        <div key={allocation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stoneWarm-50 px-3 py-2 text-xs text-oliveMuted-600">
                          <span>
                            {allocation.booking_reference} - {allocation.guest_full_name} - {fmtUgx(allocation.amount_ugx)}
                          </span>
                          {allocation.receipt_id && (
                            <Link
                              href={`/bookings/${allocation.booking_id}/receipts/${allocation.receipt_id}`}
                              className="font-semibold text-oliveMuted-700 hover:underline"
                            >
                              {allocation.receipt_number ?? "Receipt"}
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="hidden print:block mt-8 border-t border-stoneWarm-200 pt-4 text-xs text-oliveMuted-500">
        Printed {fmtDateTime(renderedAt)} - Mubende Country Resort
      </div>
    </div>
  );
}
