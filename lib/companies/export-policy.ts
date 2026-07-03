export const COMPANY_EXPORT_MAX_RANGE_DAYS = 366;
export const COMPANY_EXPORT_MAX_ROWS = 10_000;
export const COMPANY_EXPORT_PAGE_SIZE = 500;

export const COMPANY_EXPORT_DATASETS = [
  "summary",
  "invoices",
  "lines",
  "payments",
  "allocations"
] as const;

export type CompanyExportDataset = (typeof COMPANY_EXPORT_DATASETS)[number];

export type CompanyExportDateRange =
  | { ok: true; from: string; to: string; days: number }
  | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string | null): number | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export function parseCompanyExportDataset(value: string | null): CompanyExportDataset | null {
  return COMPANY_EXPORT_DATASETS.find((dataset) => dataset === value) ?? null;
}

export function parseCompanyExportDateRange(searchParams: URLSearchParams): CompanyExportDateRange {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const fromTimestamp = parseIsoDate(from);
  const toTimestamp = parseIsoDate(to);

  if (fromTimestamp === null || toTimestamp === null || from === null || to === null) {
    return { ok: false, error: "A valid from and to date are required." };
  }
  if (toTimestamp < fromTimestamp) {
    return { ok: false, error: "The export end date must be on or after the start date." };
  }

  const days = Math.floor((toTimestamp - fromTimestamp) / DAY_MS) + 1;
  if (days > COMPANY_EXPORT_MAX_RANGE_DAYS) {
    return {
      ok: false,
      error: `Export ranges cannot exceed ${COMPANY_EXPORT_MAX_RANGE_DAYS} days.`
    };
  }

  return { ok: true, from, to, days };
}
