import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getBookingById } from "@/lib/bookings/data";
import { getFolioData } from "@/lib/folios/data";
import { createBookingInvoiceAndRedirect } from "@/lib/invoices/actions";
import { listInvoicesForBooking } from "@/lib/invoices/data";
import { FolioClient } from "./folio-client";

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
            <button
              type="submit"
              className="rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
            >
              Create Invoice
            </button>
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
                    {invoice.status} - Balance {fmtUgx(invoice.balance_due_ugx)}
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
