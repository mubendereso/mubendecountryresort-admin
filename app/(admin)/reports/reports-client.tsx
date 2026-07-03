"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { serializeCsv } from "@/lib/csv";
import type { ReportData } from "@/lib/reports/types";

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG").format(n) + " UGX";
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(y, m - 1, day)
  );
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

const CATEGORY_LABEL: Record<string, string> = {
  accommodation: "Accommodation",
  food: "Food",
  beverage: "Beverage",
  other: "Other",
  tax: "Tax",
  discount: "Discount"
};

// Build a CSV string and trigger a download. Runs entirely in the browser,
// so it costs the Worker nothing.
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = serializeCsv([headers, ...rows], { lineEnding: "\n" });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-oliveMuted-500">{hint}</p>}
    </div>
  );
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-stoneWarm-200 px-3 py-1.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
    >
      Export CSV
    </button>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function ReportsClient({ data, maxRangeDays }: { data: ReportData; maxRangeDays: number }) {
  const router = useRouter();
  const [from, setFrom] = useState(data.range.from);
  const [to, setTo] = useState(data.range.to);

  const { summary } = data;
  const rangeLabel = `${fmtDate(data.range.from)} → ${fmtDate(data.range.to)}`;

  function applyRange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    router.push(`/reports?from=${from}&to=${to}`);
  }

  const fieldClass =
    "rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Reports</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">{rangeLabel}</p>
        </div>
        <form onSubmit={applyRange} className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <label htmlFor="from" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
              From
            </label>
            <input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
          </div>
          <div className="grid gap-1">
            <label htmlFor="to" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
              To
            </label>
            <input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
          </div>
          <button
            type="submit"
            className="rounded-2xl bg-oliveMuted-600 px-5 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
          >
            Apply
          </button>
        </form>
      </header>

      <p className="text-xs text-oliveMuted-500">
        Revenue is based on non-voided folio charges posted in the range (range capped at {maxRangeDays} days).
        Occupancy counts committed rooms (confirmed, checked-in, checked-out).
      </p>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Occupancy"
          value={`${summary.occupancyPercent}%`}
          hint={`${summary.occupiedNights} / ${summary.totalUnits * summary.nightsInRange} room-nights`}
        />
        <Kpi label="Revenue Charged" value={fmtUgx(summary.totalCharged)} hint="Posted folio charges" />
        <Kpi label="Collected" value={fmtUgx(summary.totalCollected)} hint="Payments received" />
        <Kpi label="Stays" value={String(summary.stays)} hint="Bookings active in range" />
        <Kpi label="Arrivals" value={String(summary.arrivals)} hint="Check-ins in range" />
        <Kpi label="Departures" value={String(summary.departures)} hint="Check-outs in range" />
        <Kpi label="In House Now" value={String(summary.inHouseNow)} hint="Currently checked in" />
        <Kpi label="Nights in Range" value={String(summary.nightsInRange)} />
      </div>

      {/* Revenue by room type */}
      <section className="grid gap-3">
        <SectionHeader
          title="Revenue by Room Type"
          action={
            data.byRoomType.length > 0 && (
              <ExportButton
                onClick={() =>
                  downloadCsv(
                    `revenue-by-room-type_${data.range.from}_${data.range.to}.csv`,
                    ["Room Type", "Revenue (UGX)", "Charges"],
                    data.byRoomType.map((r) => [r.room_type, r.revenue, r.charge_count])
                  )
                }
              />
            )
          }
        />
        {data.byRoomType.length === 0 ? (
          <p className="surface-card px-5 py-4 text-sm text-oliveMuted-600">No accommodation revenue in this range.</p>
        ) : (
          <div className="surface-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-stoneWarm-100 text-left text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
                <tr>
                  <th className="px-5 py-3">Room Type</th>
                  <th className="px-5 py-3 text-right">Charges</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.byRoomType.map((r) => (
                  <tr key={r.room_type} className="border-b border-stoneWarm-50 last:border-0">
                    <td className="px-5 py-3 font-medium">{r.room_type}</td>
                    <td className="px-5 py-3 text-right text-oliveMuted-600">{r.charge_count}</td>
                    <td className="px-5 py-3 text-right font-semibold">{fmtUgx(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Revenue by category */}
      <section className="grid gap-3">
        <SectionHeader
          title="Revenue by Category"
          action={
            data.byCategory.length > 0 && (
              <ExportButton
                onClick={() =>
                  downloadCsv(
                    `revenue-by-category_${data.range.from}_${data.range.to}.csv`,
                    ["Category", "Revenue (UGX)", "Charges"],
                    data.byCategory.map((r) => [CATEGORY_LABEL[r.category] ?? r.category, r.revenue, r.charge_count])
                  )
                }
              />
            )
          }
        />
        {data.byCategory.length === 0 ? (
          <p className="surface-card px-5 py-4 text-sm text-oliveMuted-600">No charges in this range.</p>
        ) : (
          <div className="surface-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-stoneWarm-100 text-left text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
                <tr>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3 text-right">Charges</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.byCategory.map((r) => (
                  <tr key={r.category} className="border-b border-stoneWarm-50 last:border-0">
                    <td className="px-5 py-3 font-medium">{CATEGORY_LABEL[r.category] ?? r.category}</td>
                    <td className="px-5 py-3 text-right text-oliveMuted-600">{r.charge_count}</td>
                    <td className="px-5 py-3 text-right font-semibold">{fmtUgx(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Revenue by month */}
      <section className="grid gap-3">
        <SectionHeader
          title="Revenue by Month"
          action={
            data.byMonth.length > 0 && (
              <ExportButton
                onClick={() =>
                  downloadCsv(
                    `revenue-by-month_${data.range.from}_${data.range.to}.csv`,
                    ["Month", "Revenue (UGX)"],
                    data.byMonth.map((r) => [r.month, r.revenue])
                  )
                }
              />
            )
          }
        />
        {data.byMonth.length === 0 ? (
          <p className="surface-card px-5 py-4 text-sm text-oliveMuted-600">No revenue in this range.</p>
        ) : (
          <div className="surface-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-stoneWarm-100 text-left text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
                <tr>
                  <th className="px-5 py-3">Month</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.byMonth.map((r) => (
                  <tr key={r.month} className="border-b border-stoneWarm-50 last:border-0">
                    <td className="px-5 py-3 font-medium">{fmtMonth(r.month)}</td>
                    <td className="px-5 py-3 text-right font-semibold">{fmtUgx(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Daily movement */}
      <section className="grid gap-3">
        <SectionHeader
          title="Daily Movement"
          action={
            data.daily.length > 0 && (
              <ExportButton
                onClick={() =>
                  downloadCsv(
                    `daily-movement_${data.range.from}_${data.range.to}.csv`,
                    ["Date", "Arrivals", "Departures", "Occupied", "Occupancy %"],
                    data.daily.map((r) => [
                      r.date,
                      r.arrivals,
                      r.departures,
                      r.occupied,
                      summary.totalUnits === 0 ? 0 : Math.round((r.occupied / summary.totalUnits) * 100)
                    ])
                  )
                }
              />
            )
          }
        />
        <div className="surface-card max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-stoneWarm-100 bg-white text-left text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-right">Arrivals</th>
                <th className="px-5 py-3 text-right">Departures</th>
                <th className="px-5 py-3 text-right">Occupied</th>
                <th className="px-5 py-3 text-right">Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((r) => {
                const pct = summary.totalUnits === 0 ? 0 : Math.round((r.occupied / summary.totalUnits) * 100);
                return (
                  <tr key={r.date} className="border-b border-stoneWarm-50 last:border-0">
                    <td className="px-5 py-2.5 font-medium">{fmtDate(r.date)}</td>
                    <td className="px-5 py-2.5 text-right text-oliveMuted-600">{r.arrivals}</td>
                    <td className="px-5 py-2.5 text-right text-oliveMuted-600">{r.departures}</td>
                    <td className="px-5 py-2.5 text-right text-oliveMuted-600">{r.occupied}</td>
                    <td className="px-5 py-2.5 text-right font-semibold">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
