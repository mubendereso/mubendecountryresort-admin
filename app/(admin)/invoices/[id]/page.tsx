import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { listAuditEventsForEntity } from "@/lib/audit/data";
import { getInvoiceDetail } from "@/lib/invoices/data";
import { issueInvoiceAction, refreshDraftInvoiceAction, voidInvoiceAction } from "@/lib/invoices/actions";

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

function fmtDateTime(value: string | null): string {
  if (!value) return "Not issued";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala"
  }).format(new Date(value));
}

function statusLabel(status: string): string {
  if (status === "issued") return "Issued";
  if (status === "voided") return "Voided";
  return "Draft";
}

function paymentStatusLabel(status: string): string {
  if (status === "part_paid") return "Part paid";
  if (status === "paid") return "Paid";
  if (status === "overdue") return "Overdue";
  if (status === "unpaid") return "Unpaid";
  if (status === "voided") return "Voided";
  return "Draft";
}

function ActivityCard({
  event
}: {
  event: {
    title: string;
    summary: string | null;
    created_at: string;
    actor_name: string | null;
    actor_email: string | null;
  };
}) {
  return (
    <div className="grid gap-2 rounded-2xl border border-stoneWarm-200 bg-stoneWarm-50 px-4 py-3">
      <p className="text-sm font-semibold text-[#2a241a]">{event.title}</p>
      <p className="text-sm text-oliveMuted-600">{event.summary ?? "Activity recorded."}</p>
      <div className="flex flex-wrap gap-3 text-[11px] text-oliveMuted-500">
        <span>{fmtDateTime(event.created_at)}</span>
        {event.actor_name && <span>By {event.actor_name}</span>}
        {!event.actor_name && event.actor_email && <span>By {event.actor_email}</span>}
      </div>
    </div>
  );
}

export default async function InvoiceDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireApprovedAdminRole();
  const { id } = await params;
  const [detail, auditEvents] = await Promise.all([
    getInvoiceDetail(id),
    listAuditEventsForEntity("invoice", id)
  ]);
  if (!detail) notFound();

  const { invoice, lines } = detail;
  const backHref = invoice.booking_id
    ? `/bookings/${invoice.booking_id}/folio`
    : invoice.group_id
      ? `/groups/${invoice.group_id}/folio`
      : "/invoices";

  return (
    <section className="mx-auto grid max-w-5xl gap-5 print:max-w-none print:gap-0">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Link href="/invoices" className="text-sm font-semibold text-oliveMuted-600 hover:underline">
            All invoices
          </Link>
          <Link href={backHref} className="text-sm font-semibold text-oliveMuted-600 hover:underline">
            Back to source folio
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status === "draft" && (
            <>
              <form action={refreshDraftInvoiceAction}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
                >
                  Refresh Draft
                </button>
              </form>
              <form action={issueInvoiceAction}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
                >
                  Issue Invoice
                </button>
              </form>
            </>
          )}
          <PrintButton />
        </div>
      </div>

      {invoice.status === "issued" && session.role !== "staff" && (
        <form action={voidInvoiceAction} className="print:hidden flex flex-wrap items-end gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <label className="grid min-w-64 flex-1 gap-1 text-sm">
            <span className="font-semibold text-red-800">Void reason</span>
            <input
              name="reason"
              required
              maxLength={500}
              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm"
              placeholder="Required before voiding"
            />
          </label>
          <button
            type="submit"
            className="rounded-2xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
          >
            Void Invoice
          </button>
        </form>
      )}

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
              <p className="mt-1 text-sm text-oliveMuted-500">Resort Invoice</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Invoice
            </p>
            <p className="mt-1 font-mono text-base font-semibold">{invoice.invoice_number ?? "Draft"}</p>
            <p className="mt-2 text-xs text-oliveMuted-500">{statusLabel(invoice.status)}</p>
            <p className="mt-1 text-xs text-oliveMuted-500">{fmtDateTime(invoice.issued_at ?? invoice.created_at)}</p>
            {invoice.due_date && (
              <p className="mt-1 text-xs text-oliveMuted-500">Due {fmtDate(invoice.due_date)}</p>
            )}
          </div>
        </header>

        {invoice.status === "voided" && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Voided {fmtDateTime(invoice.voided_at)}. Reason: {invoice.void_reason}
          </div>
        )}

        <div className="grid gap-8 py-8 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Bill To
            </p>
            <p className="mt-2 text-lg font-semibold">{invoice.bill_to_name}</p>
            {invoice.company_account_id && <Link href={`/companies/${invoice.company_account_id}`} className="mt-1 inline-block text-xs font-semibold text-oliveMuted-600 hover:underline">Open company account</Link>}
            {invoice.bill_to_contact && <p className="mt-1 text-sm">{invoice.bill_to_contact}</p>}
            {invoice.bill_to_email && <p className="mt-1 text-sm">{invoice.bill_to_email}</p>}
            {invoice.bill_to_phone && <p className="mt-1 text-sm">{invoice.bill_to_phone}</p>}
            {invoice.bill_to_address && <p className="mt-1 text-sm">{invoice.bill_to_address}</p>}
            {invoice.tax_id && <p className="mt-1 text-sm">Tax ID: {invoice.tax_id}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
              Source
            </p>
            <p className="mt-2 font-mono text-sm font-semibold">{invoice.source_reference}</p>
            <p className="mt-1 text-sm">{invoice.source_title}</p>
            <p className="mt-1 text-sm text-oliveMuted-500">
              {fmtDate(invoice.stay_start)} - {fmtDate(invoice.stay_end)}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-stoneWarm-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-stoneWarm-50 text-[11px] uppercase tracking-[0.16em] text-oliveMuted-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stoneWarm-100">
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3 align-top">{line.description}</td>
                  <td className="px-4 py-3 align-top text-oliveMuted-500">{line.category.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 text-right align-top font-semibold">{fmtUgx(line.amount_ugx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-3 rounded-3xl border border-stoneWarm-200 bg-stoneWarm-50 p-5 sm:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">Total Charges</p>
            <p className="mt-2 text-xl font-semibold">{fmtUgx(invoice.total_charges_ugx)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">Payments Received</p>
            <p className="mt-2 text-xl font-semibold text-green-700">{fmtUgx(invoice.current_paid_ugx)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">Balance Due</p>
            <p className={`mt-2 text-xl font-semibold ${invoice.current_balance_due_ugx > 0 ? "text-red-600" : "text-green-700"}`}>
              {fmtUgx(invoice.current_balance_due_ugx)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-2xl border border-stoneWarm-200 px-5 py-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Payment Status</p>
            <p className="mt-1 font-semibold text-[#2a241a]">{paymentStatusLabel(invoice.payment_status)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Terms</p>
            <p className="mt-1 font-semibold text-[#2a241a]">{invoice.payment_terms_days} days</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Aging</p>
            <p className="mt-1 font-semibold text-[#2a241a]">
              {invoice.payment_status === "overdue" ? `${invoice.days_overdue} days overdue` : invoice.aging_bucket.replace("_", "-")}
            </p>
          </div>
        </div>

        {invoice.note && <p className="mt-6 text-sm text-oliveMuted-600">{invoice.note}</p>}

        <section className="mt-8 grid gap-3 border-t border-stoneWarm-200 pt-6 print:hidden">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">
                Activity
              </p>
              <h2 className="mt-1 text-lg font-semibold">Invoice history</h2>
            </div>
            <Link href={`/activity?entity=invoice`} className="text-xs font-semibold text-oliveMuted-600 hover:underline">
              Open activity
            </Link>
          </div>
          {auditEvents.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stoneWarm-300 px-4 py-5 text-sm text-oliveMuted-600">
              No invoice activity has been recorded yet.
            </p>
          ) : (
            auditEvents.map((event) => <ActivityCard key={event.id} event={event} />)
          )}
        </section>

        <footer className="mt-8 grid gap-4 border-t border-stoneWarm-200 pt-6 text-xs text-oliveMuted-500 sm:grid-cols-2">
          <p>
            Created by: {invoice.created_by_name ?? "Admin"}
            {invoice.issued_by_name ? ` - Issued by: ${invoice.issued_by_name}` : ""}
          </p>
          <p className="sm:text-right">
            Resort invoice only. This is not an EFRIS fiscal invoice.
          </p>
        </footer>
      </article>
    </section>
  );
}
