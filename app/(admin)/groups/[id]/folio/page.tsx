import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getGroupFolioData } from "@/lib/groups/folio-data";
import { createGroupInvoiceAndRedirect } from "@/lib/invoices/actions";
import { listInvoicesForGroup } from "@/lib/invoices/data";
import { GroupFolioClient } from "./group-folio-client";

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
