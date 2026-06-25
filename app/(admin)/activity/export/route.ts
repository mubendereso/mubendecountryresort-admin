import { NextResponse } from "next/server";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { listAuditEvents } from "@/lib/audit/data";
import { auditChangesSummary } from "@/lib/audit/presentation";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const session = await requireApprovedAdminRole();
  if (session.role === "staff") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const events = await listAuditEvents({
    entityType: url.searchParams.get("entity") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
    limit: 500
  });

  const rows = [
    [
      "created_at",
      "actor",
      "action",
      "entity_type",
      "entity_id",
      "summary",
      "changes"
    ],
    ...events.map((event) => [
      event.created_at,
      event.actor_name ?? event.actor_email ?? "System",
      event.action,
      event.entity_type ?? "",
      event.entity_id ?? "",
      event.summary ?? "",
      auditChangesSummary(event)
    ])
  ];

  const csv = `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-export.csv"`
    }
  });
}
