import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getCompanyAccountDetail } from "@/lib/companies/data";
import { listInvoicesForCompany } from "@/lib/invoices/data";
import { CompanyForm } from "../company-form";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Open-ended";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

export default async function CompanyDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireApprovedAdminRole();
  const { id } = await params;
  const [data, invoices] = await Promise.all([
    getCompanyAccountDetail(id),
    listInvoicesForCompany(id)
  ]);
  if (!data) notFound();

  const company = data.company;
  const exposurePercent =
    company.credit_limit_ugx > 0
      ? Math.round((company.outstanding_balance_ugx / company.credit_limit_ugx) * 100)
      : 0;

  return (
    <section className="grid gap-7 lg:gap-9">
      <nav className="text-sm text-oliveMuted-500">
        <Link href="/companies" className="hover:underline">
          Companies
        </Link>
        <span className="mx-2">{">"}</span>
        <span>{company.company_name}</span>
      </nav>

      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
                Company account
              </p>
              <span className="rounded-full border border-stoneWarm-200 bg-stoneWarm-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                {company.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
              {company.company_name}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
              {company.contact_name ?? "Contact not recorded"}
              {company.contact_email ? ` - ${company.contact_email}` : ""}
              {company.contact_phone ? ` - ${company.contact_phone}` : ""}
            </p>
          </div>
          <Link
            href="/companies"
            className="rounded-[18px] border border-stoneWarm-200 bg-[#fffdf8]/90 px-5 py-3 text-sm font-semibold text-oliveMuted-600 transition hover:bg-white"
          >
            Back to companies
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Outstanding</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(company.outstanding_balance_ugx)}</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Credit limit</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(company.credit_limit_ugx)}</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Credit used</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{exposurePercent}%</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Payment terms</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{company.payment_terms_days} days</p>
        </div>
      </section>

      <section className="grid gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
            Company details
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
            Billing profile
          </h2>
        </div>
        <CompanyForm company={company} />
      </section>

      <section className="grid gap-4">
        <div className="flex items-end justify-between gap-4 px-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
              Linked groups
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
              Accounts receivable
            </h2>
          </div>
          <p className="text-sm text-oliveMuted-500">{data.groups.length} group{data.groups.length === 1 ? "" : "s"}</p>
        </div>

        {data.groups.length === 0 ? (
          <div className="surface-card px-6 py-10 text-sm text-oliveMuted-600">
            No reservation groups are billed to this company yet.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.groups.map((group) => (
              <article key={group.id} className="grid gap-4 rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bronze-500">{group.reference}</p>
                    <h3 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">{group.group_name}</h3>
                    <p className="mt-2 text-sm text-oliveMuted-600">
                      {formatDate(group.first_check_in)} to {formatDate(group.last_check_out)}
                    </p>
                  </div>
                  <Link href={`/groups/${group.id}`} className="rounded-full border border-stoneWarm-200 bg-white px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100">
                    Open group
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Status</p>
                    <p className="mt-2 text-sm font-semibold text-[#2a241a]">{group.status}</p>
                  </div>
                  <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Charges</p>
                    <p className="mt-2 text-sm font-semibold text-[#2a241a]">{fmtUgx(group.total_charges_ugx)}</p>
                  </div>
                  <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Balance</p>
                    <p className="mt-2 text-sm font-semibold text-[#2a241a]">{fmtUgx(Math.max(0, group.balance_due_ugx))}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4">
        <div className="flex items-end justify-between gap-4 px-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
              Invoices
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
              Billing documents
            </h2>
          </div>
          <p className="text-sm text-oliveMuted-500">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}</p>
        </div>

        {invoices.length === 0 ? (
          <div className="surface-card px-6 py-8 text-sm text-oliveMuted-600">
            No invoices have been created for this company yet.
          </div>
        ) : (
          <div className="surface-card divide-y divide-stoneWarm-200 p-0">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-mono text-xs font-semibold text-oliveMuted-600">
                    {invoice.invoice_number ?? "Draft invoice"}
                  </p>
                  <p className="mt-1 text-sm text-oliveMuted-500">
                    {invoice.source_reference} - {invoice.status} - Balance {fmtUgx(invoice.balance_due_ugx)}
                  </p>
                </div>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="rounded-full border border-stoneWarm-200 bg-white px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
                >
                  Open invoice
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
