import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getGroupFolioData } from "@/lib/groups/folio-data";
import type { GroupFolioBooking } from "@/lib/groups/folio-data";
import type { FolioCharge, FolioPayment, PaymentMethod } from "@/lib/folios/types";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pesapal: "Pesapal",
  pesapal_manual: "Pesapal balance payment",
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  transfer: "Bank transfer"
};

function fmtUgx(value: number): string {
  return new Intl.NumberFormat("en-UG").format(value) + " UGX";
}

function fmtDate(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function fmtDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "long",
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

function bookingBalance(booking: GroupFolioBooking): {
  charges: number;
  paid: number;
  balance: number;
} {
  const charges = activeCharges(booking.charges);
  const paid = totalPayments(booking.payments);
  return {
    charges,
    paid,
    balance: Math.max(0, charges - paid)
  };
}

export default async function GroupStatementPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireApprovedAdminRole();
  const { id } = await params;
  const data = await getGroupFolioData(id);

  if (!data) notFound();

  const totals = data.bookings.reduce(
    (sum, booking) => {
      const balance = bookingBalance(booking);
      return {
        charges: sum.charges + balance.charges,
        paid: sum.paid + balance.paid,
        balance: sum.balance + balance.balance
      };
    },
    { charges: 0, paid: 0, balance: 0 }
  );
  const issuedAt = new Date().toISOString();

  return (
    <section className="mx-auto grid max-w-5xl gap-5 print:max-w-none print:gap-0">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/groups/${data.group.id}/folio`}
            className="text-sm font-semibold text-oliveMuted-600 hover:underline"
          >
            Back to group folio
          </Link>
          <Link
            href={`/groups/${data.group.id}`}
            className="text-sm font-semibold text-oliveMuted-600 hover:underline"
          >
            Back to group
          </Link>
        </div>
        <PrintButton />
      </div>

      <article className="rounded-[28px] border border-stoneWarm-200 bg-white p-6 shadow-[0_18px_45px_rgba(55,43,30,0.10)] sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-stoneWarm-200 pb-6">
          <div className="flex items-center gap-4">
            <Image
              src="/icons/mcr-official-logo.png"
              alt="Mubende Country Resort"
              width={72}
              height={72}
              className="h-16 w-16 object-contain"
              priority
            />
            <div>
              <p className="font-serif text-2xl font-semibold">Mubende Country Resort</p>
              <p className="mt-1 text-sm text-oliveMuted-500">Group Statement / Proforma</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Group Reference
            </p>
            <p className="mt-1 font-mono text-base font-semibold">{data.group.reference}</p>
            <p className="mt-2 text-xs text-oliveMuted-500">{fmtDateTime(issuedAt)}</p>
          </div>
        </header>

        <div className="grid gap-8 py-8 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Prepared For
            </p>
            <p className="mt-2 text-lg font-semibold">{data.group.group_name}</p>
            <p className="mt-1 text-sm">{data.group.organizer_name ?? "Organizer not recorded"}</p>
            {data.group.organizer_email && <p className="mt-1 text-sm">{data.group.organizer_email}</p>}
            {data.group.organizer_phone && <p className="mt-1 text-sm">{data.group.organizer_phone}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Stay Window
            </p>
            <p className="mt-2 text-sm font-semibold">
              {fmtDate(data.group.first_check_in)} - {fmtDate(data.group.last_check_out)}
            </p>
            <p className="mt-1 text-sm text-oliveMuted-500">
              {data.group.booking_count} active booking{data.group.booking_count === 1 ? "" : "s"} - {data.group.guest_count} guest{data.group.guest_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-3xl border border-stoneWarm-200 bg-stoneWarm-50 p-5 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Total Charges
            </p>
            <p className="mt-2 text-xl font-semibold">{fmtUgx(totals.charges)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Total Paid
            </p>
            <p className="mt-2 text-xl font-semibold text-green-700">{fmtUgx(totals.paid)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Balance Due
            </p>
            <p className={`mt-2 text-xl font-semibold ${totals.balance > 0 ? "text-red-600" : "text-green-700"}`}>
              {fmtUgx(totals.balance)}
            </p>
          </div>
        </div>

        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
                Member Bookings
              </p>
              <h2 className="mt-1 text-lg font-semibold">Accommodation and folio summary</h2>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-stoneWarm-200">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-stoneWarm-50 text-[11px] uppercase tracking-[0.16em] text-oliveMuted-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Booking</th>
                  <th className="px-4 py-3 font-semibold">Guest / Room</th>
                  <th className="px-4 py-3 text-right font-semibold">Charges</th>
                  <th className="px-4 py-3 text-right font-semibold">Paid</th>
                  <th className="px-4 py-3 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stoneWarm-100">
                {data.bookings.map((booking) => {
                  const balance = bookingBalance(booking);
                  return (
                    <tr key={booking.id}>
                      <td className="px-4 py-3 align-top">
                        <p className="font-mono text-xs font-semibold">{booking.reference}</p>
                        <p className="mt-1 text-xs text-oliveMuted-500">{booking.status.replaceAll("_", " ")}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-semibold">{booking.guest_full_name}</p>
                        <p className="mt-1 text-xs text-oliveMuted-500">
                          {booking.room_type_title}
                          {booking.room_unit_name ? ` - ${booking.room_unit_name}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-oliveMuted-500">
                          {fmtDate(booking.check_in)} - {fmtDate(booking.check_out)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right align-top">{fmtUgx(balance.charges)}</td>
                      <td className="px-4 py-3 text-right align-top text-green-700">{fmtUgx(balance.paid)}</td>
                      <td className="px-4 py-3 text-right align-top font-semibold">{fmtUgx(balance.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
            Payments and Receipts
          </p>
          <div className="mt-3 grid gap-3">
            {data.groupPayments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stoneWarm-300 px-5 py-6 text-sm text-oliveMuted-600">
                No group-level payments have been recorded yet.
              </div>
            ) : (
              data.groupPayments.map((payment) => {
                const allocations = data.allocations.filter((allocation) => allocation.group_payment_id === payment.id);
                return (
                  <div key={payment.id} className="rounded-2xl border border-stoneWarm-200 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {METHOD_LABEL[payment.method]} - {fmtUgx(payment.amount_ugx)}
                        </p>
                        <p className="mt-1 text-xs text-oliveMuted-500">
                          {fmtDateTime(payment.recorded_at)}
                          {payment.reference ? ` - Ref: ${payment.reference}` : ""}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-green-700">
                        Allocated {fmtUgx(payment.allocated_amount_ugx)}
                      </p>
                    </div>
                    {allocations.length > 0 && (
                      <div className="mt-3 grid gap-1 text-xs text-oliveMuted-600">
                        {allocations.map((allocation) => (
                          <p key={allocation.id}>
                            {allocation.booking_reference} - {allocation.guest_full_name} - {fmtUgx(allocation.amount_ugx)}
                            {allocation.receipt_number ? ` - ${allocation.receipt_number}` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <footer className="mt-8 grid gap-4 border-t border-stoneWarm-200 pt-6 text-xs text-oliveMuted-500 sm:grid-cols-2">
          <p>
            This statement summarizes active member booking folios for the group.
          </p>
          <p className="sm:text-right">
            Proforma/group statement only. This is not an EFRIS fiscal receipt or tax invoice.
          </p>
        </footer>
      </article>
    </section>
  );
}
