import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getPaymentReceipt } from "@/lib/folios/receipts";
import type { PaymentMethod } from "@/lib/folios/types";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pesapal: "Pesapal",
  pesapal_manual: "Pesapal balance payment",
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  transfer: "Bank transfer"
};

function fmtUgx(amount: number): string {
  return new Intl.NumberFormat("en-UG").format(amount) + " UGX";
}

function fmtDate(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "long",
    year: "numeric"
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

export default async function PaymentReceiptPage({
  params
}: {
  params: Promise<{ id: string; receiptId: string }>;
}) {
  await requireApprovedAdminRole();
  const { id, receiptId } = await params;
  const receipt = await getPaymentReceipt(id, receiptId);
  if (!receipt) notFound();

  return (
    <section className="mx-auto grid max-w-4xl gap-5 print:max-w-none print:gap-0">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/bookings/${id}/folio`}
          className="text-sm font-semibold text-oliveMuted-600 hover:underline"
        >
          Back to folio
        </Link>
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
              <p className="mt-1 text-sm text-oliveMuted-500">Payment Receipt</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Receipt Number
            </p>
            <p className="mt-1 font-mono text-base font-semibold">{receipt.receipt_number}</p>
            <p className="mt-2 text-xs text-oliveMuted-500">{fmtDateTime(receipt.issued_at)}</p>
          </div>
        </header>

        <div className="grid gap-8 py-8 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Received From
            </p>
            <p className="mt-2 text-lg font-semibold">{receipt.guest_full_name}</p>
            {receipt.guest_phone && <p className="mt-1 text-sm">{receipt.guest_phone}</p>}
            {receipt.guest_email && <p className="mt-1 text-sm">{receipt.guest_email}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Booking
            </p>
            <p className="mt-2 font-mono text-sm font-semibold">{receipt.booking_reference}</p>
            <p className="mt-1 text-sm">{receipt.room_type_title}</p>
            <p className="mt-1 text-sm text-oliveMuted-500">
              {fmtDate(receipt.check_in)} - {fmtDate(receipt.check_out)}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-stoneWarm-200 bg-stoneWarm-50 p-6">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
                Amount Received
              </p>
              <p className="mt-2 text-3xl font-semibold">{fmtUgx(receipt.amount_ugx)}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{METHOD_LABEL[receipt.payment_method]}</p>
              {receipt.payment_reference && (
                <p className="mt-1 text-oliveMuted-500">
                  Reference: {receipt.payment_reference}
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="mt-8 grid gap-4 border-t border-stoneWarm-200 pt-6 text-xs text-oliveMuted-500 sm:grid-cols-2">
          <p>
            Recorded by: {receipt.recorded_by_name ?? "Automated payment confirmation"}
          </p>
          <p className="sm:text-right">
            Resort payment receipt. This is not an EFRIS fiscal receipt.
          </p>
        </footer>
      </article>
    </section>
  );
}
