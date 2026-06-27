import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getGroupFolioData } from "@/lib/groups/folio-data";
import { createGroupInvoiceAndRedirect } from "@/lib/invoices/actions";
import { listInvoicesForGroup } from "@/lib/invoices/data";
import { GroupFolioClient } from "./group-folio-client";
import { getCompanyCreditAssessment } from "@/lib/companies/data";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

export default async function GroupFolioPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, data, invoices] = await Promise.all([
    requireApprovedAdminRole(),
    getGroupFolioData(id),
    listInvoicesForGroup(id)
  ]);

  if (!data) notFound();
  const credit = data.group.company_account_id ? await getCompanyCreditAssessment(data.group.company_account_id) : null;
  const invoiceNeedsOverride = credit?.credit_status === "overdue" || credit?.credit_status === "over_limit";
  const companyBlocked = Boolean(credit && (!credit.is_active || credit.is_suspended));

  return (
    <div className="grid gap-6">
      <nav className="text-sm text-oliveMuted-500">
        <Link href="/groups" className="hover:underline">
          Groups
        </Link>
        <span className="mx-2">{">"}</span>
        <Link href={`/groups/${data.group.id}`} className="hover:underline">
          {data.group.group_name}
        </Link>
        <span className="mx-2">{">"}</span>
        <span>Group folio</span>
      </nav>

      <GroupFolioClient data={data} role={session.role} renderedAt={new Date().toISOString()} />

      {credit && (
        <section className={`rounded-2xl border px-5 py-4 ${credit.credit_status === "clear" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <p className="text-sm font-semibold">Company credit status: {credit.credit_status.replace("_", " ")}</p>
          <p className="mt-1 text-xs text-oliveMuted-600">Available {fmtUgx(credit.available_credit_ugx)} - open invoices {fmtUgx(credit.total_open_invoices_ugx)} - overdue {fmtUgx(credit.overdue_invoices_ugx)}</p>
        </section>
      )}

      <section className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[#2a241a]">Invoices</h2>
            <p className="mt-1 text-sm text-oliveMuted-500">
              Create a resort invoice snapshot from this group folio. Attached companies are used as the billing party.
            </p>
          </div>
          <form action={createGroupInvoiceAndRedirect}>
            <input type="hidden" name="groupId" value={data.group.id} />
            {invoiceNeedsOverride && session.role !== "staff" && <textarea name="creditOverrideReason" required minLength={5} maxLength={500} rows={2} placeholder="Credit override reason" className="mb-2 block w-64 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs" />}
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
              No invoices have been created for this group.
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
