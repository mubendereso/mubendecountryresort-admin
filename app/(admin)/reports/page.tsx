import { redirect } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getReportData } from "@/lib/reports/data";
import { ReportsClient } from "./reports-client";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function kampalaToday(): string {
  // en-CA formats as YYYY-MM-DD; timeZone pins it to Africa/Kampala.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
}

function firstOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireApprovedAdminRole();
  // Revenue reports are management-only.
  if (session.role === "staff") redirect("/dashboard");

  const { from: fromParam, to: toParam } = await searchParams;
  const today = kampalaToday();

  let to = toParam && ISO_DATE.test(toParam) ? toParam : today;
  let from = fromParam && ISO_DATE.test(fromParam) ? fromParam : firstOfMonth(today);

  // Guard against inverted or over-wide ranges (protects Neon from huge scans).
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    const clamp = new Date(to + "T00:00:00Z");
    clamp.setUTCDate(clamp.getUTCDate() - (MAX_RANGE_DAYS - 1));
    from = clamp.toISOString().slice(0, 10);
  }

  const data = await getReportData(from, to);
  return <ReportsClient data={data} maxRangeDays={MAX_RANGE_DAYS} />;
}
