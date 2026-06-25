import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { listAuditEvents, type AuditEvent } from "@/lib/audit/data";
import { getAuditChanges } from "@/lib/audit/presentation";

function fmtDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala"
  }).format(new Date(value));
}

function entityHref(event: AuditEvent): string | null {
  if (!event.entity_id) return null;
  if (event.entity_type === "booking") return `/bookings/${event.entity_id}`;
  if (event.entity_type === "reservation_group") return `/groups/${event.entity_id}`;
  if (event.entity_type === "invoice") return `/invoices/${event.entity_id}`;
  if (event.entity_type === "company_account") return `/companies/${event.entity_id}`;
  return null;
}

function labelForEntity(type: string | null): string {
  if (!type) return "System";
  if (type === "reservation_group") return "Group";
  if (type === "company_account") return "Company";
  return type.replaceAll("_", " ");
}

function ActivityRow({ event }: { event: AuditEvent }) {
  const href = entityHref(event);
  const contextJson = JSON.stringify(event.context, null, 2);
  const changes = getAuditChanges(event);

  return (
    <article className="grid gap-3 border-b border-stoneWarm-200 px-5 py-4 last:border-b-0 lg:grid-cols-[1fr_180px_180px] lg:items-start">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[#2a241a]">{event.title}</p>
          <span className="rounded-full border border-stoneWarm-200 bg-stoneWarm-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
            {labelForEntity(event.entity_type)}
          </span>
        </div>
        <p className="mt-1 text-sm text-oliveMuted-600">{event.summary ?? event.action}</p>
        {changes.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-lg border border-stoneWarm-200">
            <div className="grid grid-cols-[140px_1fr_1fr] bg-stoneWarm-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-oliveMuted-500">
              <span>Field</span>
              <span>Before</span>
              <span>After</span>
            </div>
            {changes.map((change) => (
              <div
                key={`${change.label}-${change.before}-${change.after}`}
                className="grid grid-cols-[140px_1fr_1fr] gap-3 border-t border-stoneWarm-200 px-3 py-2 text-xs text-oliveMuted-700"
              >
                <span className="font-semibold text-[#2a241a]">{change.label}</span>
                <span className="min-w-0 break-words">{change.before}</span>
                <span className="min-w-0 break-words">{change.after}</span>
              </div>
            ))}
          </div>
        )}
        <details className="mt-3 text-xs text-oliveMuted-600">
          <summary className="cursor-pointer font-semibold text-oliveMuted-700">Context</summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-2xl border border-stoneWarm-200 bg-white p-3 text-[11px] leading-5">
            {contextJson}
          </pre>
        </details>
      </div>
      <div className="text-sm text-oliveMuted-600">
        <p>{fmtDateTime(event.created_at)}</p>
        <p className="mt-1 text-xs">{event.action}</p>
      </div>
      <div className="text-sm text-oliveMuted-600">
        <p>{event.actor_name ?? event.actor_email ?? "System"}</p>
        {href && (
          <Link href={href} className="mt-2 inline-flex text-xs font-semibold text-oliveMuted-700 hover:underline">
            Open record
          </Link>
        )}
      </div>
    </article>
  );
}

export default async function ActivityPage({
  searchParams
}: {
  searchParams?: Promise<{ entity?: string; action?: string; q?: string }>;
}) {
  const session = await requireApprovedAdminRole();
  if (session.role === "staff") redirect("/dashboard");

  const params = await searchParams;
  const events = await listAuditEvents({
    entityType: params?.entity,
    action: params?.action,
    query: params?.q,
    limit: 250
  });
  const exportParams = new URLSearchParams();
  if (params?.entity) exportParams.set("entity", params.entity);
  if (params?.action) exportParams.set("action", params.action);
  if (params?.q) exportParams.set("q", params.q);
  const exportHref = `/activity/export${exportParams.size > 0 ? `?${exportParams.toString()}` : ""}`;

  return (
    <section className="grid gap-7">
      <header className="surface-card p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
          Admin only
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a]">
          Activity
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-oliveMuted-600">
          Actor-aware history for high-risk operational changes across bookings, folios, groups, companies, invoices, housekeeping, and night audit.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {[
          { href: "/activity", label: "All" },
          { href: "/activity?entity=booking", label: "Bookings" },
          { href: "/activity?entity=reservation_group", label: "Groups" },
          { href: "/activity?entity=invoice", label: "Invoices" },
          { href: "/activity?entity=company_account", label: "Companies" },
          { href: "/activity?entity=room_type", label: "Rooms" },
          { href: "/activity?entity=room_unit", label: "Housekeeping" },
          { href: "/activity?entity=admin_user", label: "Users" },
          { href: "/activity?entity=night_audit_close", label: "Night audit" }
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-full border border-stoneWarm-200 bg-white px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <form className="surface-card flex flex-col gap-3 p-4 md:flex-row md:items-center">
        {params?.entity && <input type="hidden" name="entity" value={params.entity} />}
        {params?.action && <input type="hidden" name="action" value={params.action} />}
        <input
          name="q"
          defaultValue={params?.q ?? ""}
          placeholder="Search reference, guest, company, invoice, actor, action..."
          className="min-h-11 flex-1 rounded-lg border border-stoneWarm-200 bg-white px-3 text-sm text-[#2a241a] outline-none focus:border-bronze-400"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#2a241a] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#403625]"
        >
          Search
        </button>
        <Link
          href={exportHref}
          className="rounded-lg border border-stoneWarm-200 bg-white px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-oliveMuted-700 transition hover:bg-stoneWarm-50"
        >
          Export CSV
        </Link>
      </form>

      <section className="surface-card overflow-hidden p-0">
        {events.length === 0 ? (
          <div className="px-6 py-10 text-sm text-oliveMuted-600">
            No activity entries match this filter.
          </div>
        ) : (
          events.map((event) => <ActivityRow key={event.id} event={event} />)
        )}
      </section>
    </section>
  );
}
