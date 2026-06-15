import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { closeNightAuditAction, voidNightAuditCloseAction } from "@/lib/night-audit/actions";
import { getNightAuditData, kampalaToday, shiftIsoDate } from "@/lib/night-audit/data";
import type { NightAuditBookingIssue, NightAuditPaymentMethodTotal } from "@/lib/night-audit/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REASON_LENGTH = 500;

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatShortDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short"
  }).format(new Date(year, month - 1, day));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function parseDaysDiff(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function MoneyStat({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold tracking-[-0.03em] text-[#2a241a]">{value}</p>
      {detail && <p className="mt-1 text-xs text-oliveMuted-500">{detail}</p>}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-bronze-500">{eyebrow}</p>
        <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-oliveMuted-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function MethodRow({ total }: { total: NightAuditPaymentMethodTotal }) {
  const label =
    total.method === "pesapal_manual"
      ? "Pesapal balance"
      : total.method === "pesapal"
        ? "Pesapal"
        : total.method === "mpesa"
          ? "M-Pesa"
          : total.method === "cash"
            ? "Cash"
            : total.method === "card"
              ? "Card"
              : "Transfer";

  return (
    <tr className="border-b border-stoneWarm-50 last:border-0">
      <td className="px-5 py-3 font-medium text-[#2a241a]">{label}</td>
      <td className="px-5 py-3 text-right text-oliveMuted-600">{total.count}</td>
      <td className="px-5 py-3 text-right font-semibold">{formatUgx(total.total_ugx)}</td>
    </tr>
  );
}

function IssueBadge({ issueType }: { issueType: NightAuditBookingIssue["issue_type"] }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${
        issueType === "pending_payment"
          ? "border border-bronze-400/25 bg-bronze-400/10 text-bronze-500"
          : "border border-[#a4635b]/25 bg-[#a4635b]/10 text-[#8b4d46]"
      }`}
    >
      {issueType === "pending_payment" ? "Pending payment" : "Open balance"}
    </span>
  );
}

function IssueRow({ booking }: { booking: NightAuditBookingIssue }) {
  const nights = parseDaysDiff(booking.check_in, booking.check_out);
  return (
    <tr className="border-b border-stoneWarm-50 last:border-0">
      <td className="px-5 py-3">
        <div className="grid gap-1">
          <Link
            href={`/bookings/${booking.id}/folio`}
            className="font-medium text-[#2a241a] transition hover:text-oliveMuted-600"
          >
            {booking.guest_full_name}
          </Link>
          <p className="font-mono text-[11px] tracking-wide text-oliveMuted-500">{booking.reference}</p>
        </div>
      </td>
      <td className="px-5 py-3">
        <div className="grid gap-1">
          <p className="text-sm font-medium text-[#2a241a]">{booking.room_type_title}</p>
          <p className="text-xs text-oliveMuted-500">{booking.room_unit_name ?? "No room assigned"}</p>
        </div>
      </td>
      <td className="px-5 py-3 text-sm text-oliveMuted-600">
        {formatShortDate(booking.check_in)} to {formatShortDate(booking.check_out)}
        <p className="mt-1 text-xs text-oliveMuted-500">
          {nights} {nights === 1 ? "night" : "nights"}
        </p>
      </td>
      <td className="px-5 py-3 text-right text-sm text-oliveMuted-600">
        <p>{formatUgx(booking.total_charges_ugx)}</p>
        <p className="mt-1 text-xs text-oliveMuted-500">Paid {formatUgx(booking.total_paid_ugx)}</p>
      </td>
      <td className="px-5 py-3 text-right font-semibold text-[#2a241a]">{formatUgx(booking.balance_due_ugx)}</td>
      <td className="px-5 py-3 text-right">
        <IssueBadge issueType={booking.issue_type} />
      </td>
    </tr>
  );
}

function Banner({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" | "success" }) {
  const classes =
    tone === "success"
      ? "border-oliveMuted-400/25 bg-oliveMuted-600/10 text-oliveMuted-700"
      : tone === "warning"
        ? "border-bronze-400/25 bg-bronze-400/10 text-bronze-600"
        : "border-stoneWarm-200/80 bg-[#fffdf8] text-oliveMuted-700";
  return <div className={`rounded-[22px] border px-5 py-4 shadow-sm ${classes}`}>{children}</div>;
}

export default async function NightAuditPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; message?: string }>;
}) {
  const [session, params] = await Promise.all([requireApprovedAdminRole(), searchParams]);
  const today = kampalaToday();
  const defaultDate = shiftIsoDate(today, -1);
  const businessDate = params.date && ISO_DATE.test(params.date) ? params.date : defaultDate;
  const message = params.message ?? null;
  const data = await getNightAuditData(businessDate);
  const openTotal = data.summary.open_balance_amount_ugx + data.summary.pending_payment_amount_ugx;
  const isClosed = Boolean(data.closeRecord);
  const showCloseForm = session.role !== "staff" && !isClosed;
  const paymentBreakdown = data.paymentMethods.filter((entry) => entry.total_ugx > 0 || entry.count > 0);

  return (
    <section className="grid gap-7 lg:gap-9">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9 print:shadow-none">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-bronze-400/15" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-44 w-44 rounded-full border border-oliveMuted-400/10" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">Daily close</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
              Night Audit
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
              Staff can review this screen. Only admin and superadmin can sign off the close for the selected business day.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-stoneWarm-100/70 px-3 py-1.5 text-xs font-semibold text-oliveMuted-600">
              <span className={`h-2 w-2 rounded-full ${isClosed ? "bg-oliveMuted-600" : "bg-bronze-500"}`} />
              {isClosed ? "Closed" : "Open"} for {formatDate(businessDate)}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3 print:hidden">
            <form method="get" className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <label htmlFor="date" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                  Business date
                </label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={businessDate}
                  max={today}
                  className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200"
                />
              </div>
              <button
                type="submit"
                className="rounded-2xl bg-oliveMuted-600 px-5 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
              >
                Load day
              </button>
            </form>
            <div className="pb-0.5">
              <PrintButton label="Print close sheet" />
            </div>
          </div>
        </div>
      </header>

      {message && (
        <Banner tone={message.toLowerCase().includes("close") ? "success" : "warning"}>
          <p className="text-sm font-medium">{message}</p>
        </Banner>
      )}

      {data.closeRecord && (
        <Banner tone="success">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">Closed</p>
              <p className="mt-1 text-sm font-medium">
                Signed off by {data.closeRecord.closed_by_name ?? "unknown"} on {formatDateTime(data.closeRecord.closed_at)}
              </p>
              <p className="mt-1 text-xs text-oliveMuted-600">
                Cash difference: {formatUgx(data.closeRecord.cash_difference_ugx)} · Opening float:{" "}
                {formatUgx(data.closeRecord.opening_float_ugx)} · Cash counted: {formatUgx(data.closeRecord.cash_counted_ugx)}
              </p>
            </div>
            {session.role === "superadmin" && (
              <form action={voidNightAuditCloseAction} className="grid gap-2 print:hidden">
                <input type="hidden" name="closure_id" value={data.closeRecord.id} />
                <input type="hidden" name="business_date" value={data.closeRecord.business_date} />
                <input
                  name="reason"
                  type="text"
                  maxLength={MAX_REASON_LENGTH}
                  required
                  placeholder="Reason for voiding"
                  className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200"
                />
                <button
                  type="submit"
                  className="rounded-2xl border border-[#9c6b63]/25 bg-[#9c6b63]/10 px-4 py-2 text-sm font-semibold text-[#83574f] transition hover:bg-[#9c6b63]/15"
                >
                  Void close
                </button>
              </form>
            )}
          </div>
        </Banner>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyStat label="Occupancy" value={`${data.summary.occupancy_percent}%`} detail={`${data.summary.occupied_room_nights} room-nights across ${data.summary.total_units} units`} />
        <MoneyStat label="Revenue charged" value={formatUgx(data.summary.total_charged_ugx)} detail="Posted folio charges for the day" />
        <MoneyStat label="Collected" value={formatUgx(data.summary.total_collected_ugx)} detail="Payments recorded for the day" />
        <MoneyStat label="Open balances" value={formatUgx(openTotal)} detail={`${data.summary.open_balance_count + data.summary.pending_payment_count} bookings still needing attention`} />
      </section>

      <section className="grid gap-3">
        <SectionHeader
          eyebrow="Operational mix"
          title="Payments by method"
          description="Useful for cash counting and checking whether the folio ledger matches the day's payment mix."
        />
        <div className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stoneWarm-100 text-left text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
              <tr>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3 text-right">Payments</th>
                <th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {paymentBreakdown.map((item) => (
                <MethodRow key={item.method} total={item} />
              ))}
              {paymentBreakdown.length === 0 && (
                <tr>
                  <td className="px-5 py-6 text-sm text-oliveMuted-500" colSpan={3}>
                    No payments were recorded for this business date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3">
        <SectionHeader
          eyebrow="Review items"
          title="Unsettled stays"
          description="These are the bookings most likely to need a check before the day is signed off."
        />
        <div className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
          <table className="w-full text-sm">
            <thead className="border-b border-stoneWarm-100 text-left text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
              <tr>
                <th className="px-5 py-3">Guest</th>
                <th className="px-5 py-3">Stay</th>
                <th className="px-5 py-3">Amounts</th>
                <th className="px-5 py-3 text-right">Balance</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.unsettledBookings.map((booking) => (
                <IssueRow key={booking.id} booking={booking} />
              ))}
              {data.unsettledBookings.length === 0 && (
                <tr>
                  <td className="px-5 py-6 text-sm text-oliveMuted-500" colSpan={5}>
                    No unsettled bookings were found for this day.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyStat label="Receipts issued" value={data.summary.receipt_count} detail="Immutable printable snapshots" />
        <MoneyStat label="Missing receipts" value={data.summary.missing_receipt_count} detail="Should stay at zero" />
        <MoneyStat label="Voided charges" value={data.summary.voided_charges_count} detail={formatUgx(data.summary.voided_charges_amount_ugx)} />
        <MoneyStat label="Pending payment bookings" value={data.summary.pending_payment_count} detail={formatUgx(data.summary.pending_payment_amount_ugx)} />
      </section>

      {!data.closeRecord && session.role !== "staff" && (
        <section className="grid gap-3">
          <SectionHeader
            eyebrow="Sign off"
            title="Close this business date"
            description="The close captures the day's totals and locks the audit record. Use the cash count to measure any drawer difference."
          />
          <form
            action={closeNightAuditAction}
            className="grid gap-5 rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_14px_34px_rgba(55,43,30,0.06)] sm:p-6 print:hidden"
          >
            <input type="hidden" name="business_date" value={businessDate} />
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                  Opening float
                </span>
                <input
                  name="opening_float_ugx"
                  type="text"
                  inputMode="numeric"
                  defaultValue="0"
                  className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                  Cash counted
                </span>
                <input
                  name="cash_counted_ugx"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200"
                />
              </label>
              <label className="grid gap-1.5 md:col-span-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                  Notes
                </span>
                <input
                  name="notes"
                  type="text"
                  maxLength={2000}
                  placeholder="Optional close notes"
                  className="rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-stoneWarm-100/50 px-4 py-4">
              <div className="grid gap-1 text-sm text-oliveMuted-600">
                <p className="font-medium text-[#2a241a]">Expected cash from payments: {formatUgx(data.summary.cash_total_ugx)}</p>
                <p className="text-xs leading-5">
                  Cash difference = cash counted - opening float - expected cash.
                </p>
              </div>
              <button
                type="submit"
                className="rounded-2xl bg-oliveMuted-600 px-5 py-2.5 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
              >
                Close business date
              </button>
            </div>
          </form>
        </section>
      )}
    </section>
  );
}
