import type { AuditEvent } from "@/lib/audit/data";

export type AuditChange = {
  label: string;
  before: string;
  after: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function labelFromKey(key: string): string {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();

  return withSpaces.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Blank";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("en-UG") : String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.map(formatAuditValue).join(", ");
  }
  if (isPlainObject(value)) return JSON.stringify(value);
  return String(value).replaceAll("_", " ");
}

function changed(before: unknown, after: unknown): boolean {
  return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
}

export function getAuditChanges(event: Pick<AuditEvent, "context">): AuditChange[] {
  const context = event.context ?? {};
  const changes: AuditChange[] = [];

  if (isPlainObject(context.before) && isPlainObject(context.after)) {
    const keys = Array.from(new Set([...Object.keys(context.before), ...Object.keys(context.after)]));
    for (const key of keys) {
      const before = context.before[key];
      const after = context.after[key];
      if (!changed(before, after)) continue;
      changes.push({
        label: labelFromKey(key),
        before: formatAuditValue(before),
        after: formatAuditValue(after)
      });
    }
  }

  const directPairs: [string, string, string][] = [
    ["Status", "fromStatus", "toStatus"],
    ["Room", "fromRoomUnitName", "toRoomUnitName"],
    ["Group", "fromGroupName", "toGroupName"],
    ["Role", "fromRole", "toRole"],
    ["Active", "fromActive", "toActive"],
    ["Price", "fromPriceUgx", "toPriceUgx"],
    ["Housekeeping Status", "previousStatus", "status"]
  ];

  for (const [label, beforeKey, afterKey] of directPairs) {
    if (!(beforeKey in context) || !(afterKey in context)) continue;
    if (!changed(context[beforeKey], context[afterKey])) continue;
    changes.push({
      label,
      before: formatAuditValue(context[beforeKey]),
      after: formatAuditValue(context[afterKey])
    });
  }

  return changes;
}

export function auditChangesSummary(event: Pick<AuditEvent, "context">): string {
  return getAuditChanges(event)
    .map((change) => `${change.label}: ${change.before} -> ${change.after}`)
    .join("; ");
}
