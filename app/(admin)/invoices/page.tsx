import Link from "next/link";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { listInvoices } from "@/lib/invoices/data";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function fmtDateTime(value: string | null): string {
  if (!value) return "Not issued";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
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

export default async function InvoicesPage() {
  await requireApprovedAdminRole();
  const invoices = await listInvoices(150);

  const totals = invoices.reduce(
    (sum, invoice) => ({
      draft: sum.draft + (invoice.status === "draft" ? 1 : 0),
      issued: sum.issued + (invoice.status === "issued" ? 1 : 0),
      openBalance: sum.openBalance + (invoice.status !== "voided" ? invoice.balance_due_ugx : 0)
    }),
    { draft: 0, issued: 0, openBalance: 0 }
  );

  return (
    <section className="grid gap-7">
      <header className="surface-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
              Billing
            </p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a]">
              Invoices
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-oliveMuted-600">
              Resort billing documents generated from booking and group folios. These are not EFRIS fiscal invoices.
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Drafts</p>
          <p className="mt-2 text-2xl font-semibold text-[#2a241a]">{totals.draft}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Issued</p>
          <p className="mt-2 text-2xl font-semibold text-[#2a241a]">{totals.issued}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Open invoice balance</p>
          <p className="mt-2 text-2xl font-semibold text-[#2a241a]">{fmtUgx(totals.openBalance)}</p>
        </div>
      </section>

      <section className="surface-card overflow-hidden p-0">
        {invoices.length === 0 ? (
          <div className="px-6 py-10 text-sm text-oliveMuted-600">
            No invoices have been created yet. Start from a booking folio or group folio.
          </div>
        ) : (
          <div className="divide-y divide-stoneWarm-200">
            {invoices.map((invoice) => (
              <article key={invoice.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs font-semibold text-oliveMuted-600">
                      {invoice.invoice_number ?? "Draft invoice"}
                    </p>
                    <span className="rounded-full border border-stoneWarm-200 bg-stoneWarm-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                      {statusLabel(invoice.status)}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold text-[#2a241a]">{invoice.bill_to_name}</p>
                  <p className="mt-1 text-xs text-oliveMuted-500">
                    {invoice.source_reference} - {invoice.source_title}
                  </p>
                </div>
                <div className="text-sm text-oliveMuted-600">
                  <p>{invoice.invoice_type === "group" ? "Group invoice" : "Booking invoice"}</p>
                  <p className="mt-1 text-xs">Created {fmtDateTime(invoice.created_at)}</p>
                </div>
                <div className="text-sm">
                  <p className="font-semibold text-[#2a241a]">{fmtUgx(invoice.total_charges_ugx)}</p>
                  <p className="mt-1 text-xs text-oliveMuted-500">Balance {fmtUgx(invoice.balance_due_ugx)}</p>
                </div>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="w-fit rounded-full border border-stoneWarm-200 bg-white px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
                >
                  Open
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
