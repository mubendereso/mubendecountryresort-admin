import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getBookingById } from "@/lib/bookings/data";
import { getFolioData } from "@/lib/folios/data";
import { createBookingInvoiceAndRedirect } from "@/lib/invoices/actions";
import { listInvoicesForBooking } from "@/lib/invoices/data";
import { FolioClient } from "./folio-client";
import { getCompanyCreditAssessment } from "@/lib/companies/data";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

export default async function FolioPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [session, booking, folio, invoices] = await Promise.all([
    requireApprovedAdminRole(),
    getBookingById(id),
    getFolioData(id),
    listInvoicesForBooking(id)
  ]);

  if (!booking) notFound();
  const credit = booking.effective_company_account_id
    ? await getCompanyCreditAssessment(booking.effective_company_account_id)
    : null;
  const invoiceNeedsOverride = credit?.credit_status === "overdue" || credit?.credit_status === "over_limit";
  const companyBlocked = Boolean(credit && (!credit.is_active || credit.is_suspended));

  return (
    <div className="grid gap-6">
      <nav className="text-sm text-oliveMuted-500">
        <Link href="/bookings" className="hover:underline">
          Bookings
        </Link>
        <span className="mx-2">{">"}</span>
        <span className="font-mono">{booking.reference}</span>
        {booking.group_id && (
          <>
            <span className="mx-2">{">"}</span>
            <Link href={`/groups/${booking.group_id}`} className="hover:underline">
              {booking.group_name ?? booking.group_reference ?? "Group"}
            </Link>
          </>
        )}
        <span className="mx-2">{">"}</span>
        <Link href={`/bookings/${booking.id}`} className="hover:underline">
          History
        </Link>
        <span className="mx-2">{">"}</span>
        <span>Folio</span>
      </nav>

      <FolioClient
        booking={booking}
        initialFolio={folio}
        role={session.role}
      />

      {booking.effective_company_account_id && (
        <section className={`rounded-2xl border px-5 py-4 ${credit?.credit_status === "clear" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <p className="text-sm font-semibold text-[#2a241a]">
            Company payer: <Link href={`/companies/${booking.effective_company_account_id}`} className="hover:underline">{booking.effective_company_name}</Link>
            {booking.group_company_account_id ? " (inherited from group)" : " (direct booking payer)"}
          </p>
          {credit && <p className="mt-1 text-xs text-oliveMuted-600">Credit status {credit.credit_status.replace("_", " ")} - available {fmtUgx(credit.available_credit_ugx)} - overdue {fmtUgx(credit.overdue_invoices_ugx)}</p>}
        </section>
      )}

      <section className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#2a241a]">Invoices</h2>
            <p className="mt-1 text-sm text-oliveMuted-500">
              Create a resort invoice snapshot from the current active folio charges.
            </p>
          </div>
          <form action={createBookingInvoiceAndRedirect}>
            <input type="hidden" name="bookingId" value={booking.id} />
            {invoiceNeedsOverride && session.role !== "staff" && (
              <textarea name="creditOverrideReason" required minLength={5} maxLength={500} rows={2} placeholder="Credit override reason" className="mb-2 block w-64 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs" />
            )}
            <button
              type="submit"
              disabled={companyBlocked || (invoiceNeedsOverride && session.role === "staff")}
              className="rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
            >
              Create Invoice
            </button>
            {(companyBlocked || (invoiceNeedsOverride && session.role === "staff")) && <p className="mt-2 max-w-64 text-xs text-red-700">Company credit approval is required before invoicing.</p>}
          </form>
        </div>

        <div className="mt-4 grid gap-2">
          {invoices.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stoneWarm-300 px-4 py-5 text-sm text-oliveMuted-600">
              No invoices have been created for this booking.
            </p>
          ) : (
            invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stoneWarm-100 bg-white px-4 py-3"
              >
                <div>
                  <p className="font-mono text-xs font-semibold text-oliveMuted-600">
                    {invoice.invoice_number ?? "Draft invoice"}
                  </p>
                  <p className="mt-1 text-sm text-oliveMuted-500">
                    {invoice.payment_status.replace("_", " ")} - Balance {fmtUgx(invoice.current_balance_due_ugx)}
                  </p>
                </div>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="rounded-full border border-stoneWarm-200 bg-white px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
                >
                  Open invoice
                </Link>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
