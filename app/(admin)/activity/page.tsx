import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { listAuditEvents, type AuditEvent } from "@/lib/audit/data";

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
  searchParams?: Promise<{ entity?: string; action?: string }>;
}) {
  const session = await requireApprovedAdminRole();
  if (session.role === "staff") redirect("/dashboard");

  const params = await searchParams;
  const events = await listAuditEvents({
    entityType: params?.entity,
    action: params?.action,
    limit: 250
  });

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
          { href: "/activity?entity=company_account", label: "Companies" }
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
