import Link from "next/link";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { listCompanyAccounts } from "@/lib/companies/data";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

export default async function CompaniesPage() {
  await requireApprovedAdminRole();
  const companies = await listCompanyAccounts();
  const totals = companies.reduce(
    (sum, company) => ({
      active: sum.active + (company.is_active ? 1 : 0),
      groups: sum.groups + company.active_group_count,
      balance: sum.balance + company.outstanding_balance_ugx
    }),
    { active: 0, groups: 0, balance: 0 }
  );

  return (
    <section className="grid gap-7 lg:gap-9">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
              Accounts receivable
            </p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
              Companies
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
              Billing profiles for corporate and organization-paid group stays.
            </p>
          </div>
          <Link
            href="/companies/new"
            className="group inline-flex min-h-[52px] w-fit items-center gap-3 rounded-[18px] bg-oliveMuted-600 px-5 py-3 text-canvas-light shadow-[0_14px_30px_rgba(82,88,69,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-lg font-light transition-transform group-hover:rotate-90">
              +
            </span>
            <span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-canvas-light/70">
                Company
              </span>
              <span className="block text-sm font-semibold">New company</span>
            </span>
          </Link>
        </div>
      </header>

      <section className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
        <div className="grid gap-4 divide-y divide-stoneWarm-200/70 p-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:p-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Active companies</p>
            <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{totals.active}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Active groups</p>
            <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{totals.groups}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Outstanding</p>
            <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(totals.balance)}</p>
          </div>
        </div>
      </section>

      {companies.length === 0 ? (
        <div className="surface-card px-6 py-10 text-sm text-oliveMuted-600">
          No company accounts yet. Create one when a group should be billed to an organization.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {companies.map((company) => (
            <article
              key={company.id}
              className="grid gap-4 rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_14px_34px_rgba(55,43,30,0.06)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bronze-500">
                      {company.is_active ? "Active" : "Inactive"}
                    </p>
                    <span className="rounded-full border border-stoneWarm-200 bg-stoneWarm-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                      {company.payment_terms_days} day terms
                    </span>
                  </div>
                  <h2 className="mt-1 truncate font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
                    {company.company_name}
                  </h2>
                  <p className="mt-2 text-sm text-oliveMuted-600">
                    {company.contact_name ?? "Contact not recorded"}
                    {company.contact_email ? ` - ${company.contact_email}` : ""}
                    {company.contact_phone ? ` - ${company.contact_phone}` : ""}
                  </p>
                </div>
                <Link
                  href={`/companies/${company.id}`}
                  className="rounded-full border border-stoneWarm-200 bg-white px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
                >
                  Open account
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Groups</p>
                  <p className="mt-2 text-2xl font-semibold text-[#2a241a]">{company.active_group_count}</p>
                  <p className="mt-1 text-xs text-oliveMuted-500">{company.linked_group_count} linked total</p>
                </div>
                <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Credit limit</p>
                  <p className="mt-2 text-sm font-semibold text-[#2a241a]">{fmtUgx(company.credit_limit_ugx)}</p>
                </div>
                <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Outstanding</p>
                  <p className="mt-2 text-2xl font-semibold text-[#2a241a]">{fmtUgx(company.outstanding_balance_ugx)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
