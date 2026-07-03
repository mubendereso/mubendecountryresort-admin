import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getCompanyAccountDetail, listCompanyPayments } from "@/lib/companies/data";
import {
  COMPANY_EXPORT_MAX_RANGE_DAYS,
  COMPANY_EXPORT_MAX_ROWS
} from "@/lib/companies/export-policy";
import { listInvoicesForCompany } from "@/lib/invoices/data";
import { CompanyForm } from "../company-form";
import { CompanyPaymentForm } from "../company-payment-form";
import { CompanyRatesManager } from "../company-rates-manager";
import { getRoomTypes } from "@/lib/rooms/data";
import { setCompanySuspensionAction } from "@/lib/companies/actions";

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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala"
  }).format(new Date(value));
}

export default async function CompanyDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireApprovedAdminRole();
  const { id } = await params;
  const [data, invoices, payments, rooms] = await Promise.all([
    getCompanyAccountDetail(id),
    listInvoicesForCompany(id),
    listCompanyPayments(id),
    getRoomTypes()
  ]);
  if (!data) notFound();

  const company = data.company;
  const exportTo = new Date().toISOString().slice(0, 10);
  const exportFromDate = new Date(`${exportTo}T00:00:00Z`);
  exportFromDate.setUTCDate(exportFromDate.getUTCDate() - 89);
  const exportFrom = exportFromDate.toISOString().slice(0, 10);
  const credit = data.credit;
  const exposurePercent =
    company.credit_limit_ugx > 0
      ? Math.round((credit.total_credit_exposure_ugx / company.credit_limit_ugx) * 100)
      : 0;
  const invoiceAr = invoices.reduce(
    (sum, invoice) => ({
      overdue: sum.overdue + (invoice.payment_status === "overdue" ? 1 : 0),
      open: sum.open + (invoice.status !== "voided" ? invoice.current_balance_due_ugx : 0)
    }),
    { overdue: 0, open: 0 }
  );

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
                {!company.is_active ? "Inactive" : company.is_suspended ? "Suspended" : credit.credit_status.replace("_", " ")}
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
          <div className="grid gap-3">
            <form
              action={`/companies/${company.id}/export`}
              method="get"
              className="grid gap-3 rounded-[22px] border border-stoneWarm-200 bg-white/85 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-semibold text-oliveMuted-600">
                  Export from
                  <input
                    type="date"
                    name="from"
                    defaultValue={exportFrom}
                    max={exportTo}
                    required
                    className="rounded-xl border border-stoneWarm-200 px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-oliveMuted-600">
                  Export to
                  <input
                    type="date"
                    name="to"
                    defaultValue={exportTo}
                    max={exportTo}
                    required
                    className="rounded-xl border border-stoneWarm-200 px-3 py-2 text-sm font-normal"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" name="dataset" value="invoices" className="rounded-[18px] border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm font-semibold text-oliveMuted-600">Export invoices</button>
                <button type="submit" name="dataset" value="allocations" className="rounded-[18px] border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm font-semibold text-oliveMuted-600">Export allocations</button>
                <button type="submit" name="dataset" value="payments" className="rounded-[18px] border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm font-semibold text-oliveMuted-600">Export payments</button>
              </div>
              <p className="text-xs text-oliveMuted-500">
                Maximum {COMPANY_EXPORT_MAX_RANGE_DAYS} days and{" "}
                {COMPANY_EXPORT_MAX_ROWS.toLocaleString("en-UG")} rows per export.
              </p>
            </form>
            <Link href="/companies" className="w-fit rounded-[18px] border border-stoneWarm-200 bg-[#fffdf8]/90 px-4 py-3 text-sm font-semibold text-oliveMuted-600">Back</Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Group exposure</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(credit.current_group_exposure_ugx)}</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Invoice AR</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(credit.current_booking_exposure_ugx)}</p>
          <p className="mt-1 text-xs text-oliveMuted-500">Individual bookings</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Overdue invoices</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-red-600">{fmtUgx(credit.overdue_invoices_ugx)}</p>
          <p className="mt-1 text-xs text-oliveMuted-500">{credit.overdue_invoice_count} invoice{credit.overdue_invoice_count === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Payment terms</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(credit.total_open_invoices_ugx)}</p>
          <p className="mt-1 text-xs text-oliveMuted-500">Open invoice AR</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Available credit</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(credit.available_credit_ugx)}</p>
          <p className="mt-1 text-xs text-oliveMuted-500">Limit {fmtUgx(company.credit_limit_ugx)} - used {exposurePercent}%</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Payment terms</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{company.payment_terms_days} days</p>
          <p className="mt-1 text-xs text-oliveMuted-500">Status {credit.credit_status.replace("_", " ")}</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-5">
        {[
          ["Current", credit.aging_current_ugx], ["1-30", credit.aging_1_30_ugx], ["31-60", credit.aging_31_60_ugx], ["61-90", credit.aging_61_90_ugx], ["90+", credit.aging_90_plus_ugx]
        ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-stoneWarm-200 bg-white p-4"><p className="text-xs text-oliveMuted-500">{label} days</p><p className="mt-1 font-semibold">{fmtUgx(Number(value))}</p></div>)}
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
        {session.role === "superadmin" && (
          <form action={setCompanySuspensionAction} className="surface-card flex flex-wrap items-end gap-3 p-4">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="suspend" value={company.is_suspended ? "false" : "true"} />
            {!company.is_suspended && <label className="grid flex-1 gap-1 text-xs font-semibold text-oliveMuted-600">Suspension reason<input name="reason" required minLength={5} maxLength={500} className="rounded-xl border border-stoneWarm-200 px-3 py-2 text-sm font-normal" /></label>}
            <button type="submit" className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">{company.is_suspended ? "Reactivate account" : "Suspend account"}</button>
          </form>
        )}
      </section>

      <CompanyRatesManager companyId={company.id} rates={data.rates} rooms={rooms.filter((room) => !room.archived_at).map((room) => ({ id: room.id, title: room.title, publicRateUgx: Number(room.price_ugx) }))} canManage={session.role !== "staff"} />

      <CompanyPaymentForm
        companyId={company.id}
        openInvoiceBalanceUgx={invoiceAr.open}
        canRecord={session.role !== "staff"}
      />

      <section className="grid gap-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">Individual bookings</p><h2 className="mt-1 text-2xl font-semibold text-[#2a241a]">Direct company-paid stays</h2></div>
        <div className="surface-card divide-y divide-stoneWarm-200 p-0">
          {data.bookings.length === 0 ? <p className="px-5 py-8 text-sm text-oliveMuted-600">No individual bookings are billed directly to this company.</p> : data.bookings.map((booking) => (
            <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-semibold">{booking.reference} - {booking.guest_full_name}</p><p className="mt-1 text-xs text-oliveMuted-500">{booking.room_type_title} - {booking.check_in} to {booking.check_out} - balance {fmtUgx(booking.balance_due_ugx)}</p></div><Link href={`/bookings/${booking.id}/folio`} className="rounded-xl border border-stoneWarm-200 px-3 py-2 text-xs font-semibold">Open folio</Link></div>
          ))}
        </div>
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
              Payments
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
              Company receipts and allocations
            </h2>
          </div>
          <p className="text-sm text-oliveMuted-500">{payments.length} payment{payments.length === 1 ? "" : "s"}</p>
        </div>

        {payments.length === 0 ? (
          <div className="surface-card px-6 py-8 text-sm text-oliveMuted-600">
            No company-level payments have been recorded yet.
          </div>
        ) : (
          <div className="surface-card divide-y divide-stoneWarm-200 p-0">
            {payments.map((payment) => (
              <article key={payment.id} className="grid gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#2a241a]">
                      {fmtUgx(payment.amount_ugx)} via {payment.method.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs text-oliveMuted-500">
                      {formatDateTime(payment.recorded_at)}
                      {payment.recorded_by_name ? ` - ${payment.recorded_by_name}` : ""}
                      {payment.reference ? ` - ${payment.reference}` : ""}
                    </p>
                    {payment.note && <p className="mt-2 text-sm text-oliveMuted-600">{payment.note}</p>}
                  </div>
                  <p className="rounded-full border border-stoneWarm-200 bg-stoneWarm-50 px-3 py-1.5 text-xs font-semibold text-oliveMuted-600">
                    {payment.allocation_count} allocation{payment.allocation_count === 1 ? "" : "s"}
                  </p>
                </div>
                {payment.allocations.length > 0 && (
                  <div className="grid gap-2">
                    {payment.allocations.map((allocation) => (
                      <div
                        key={allocation.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/40 px-4 py-3 text-sm"
                      >
                        <div>
                          <p className="font-mono text-xs font-semibold text-oliveMuted-600">
                            {allocation.invoice_number ?? "Invoice"} - {allocation.invoice_source_reference}
                          </p>
                          <p className="mt-1 text-xs text-oliveMuted-500">
                            {allocation.group_id ? `${allocation.group_reference} - ${allocation.group_name}` : `${allocation.booking_reference} - ${allocation.guest_name}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-semibold text-[#2a241a]">{fmtUgx(allocation.amount_ugx)}</p>
                          <Link
                            href={`/invoices/${allocation.invoice_id}`}
                            className="rounded-full border border-stoneWarm-200 bg-white px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
                          >
                            Open invoice
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                    {invoice.source_reference} - {invoice.payment_status.replace("_", " ")} - Balance {fmtUgx(invoice.current_balance_due_ugx)}
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
