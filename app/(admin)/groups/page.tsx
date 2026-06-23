import Link from "next/link";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { listReservationGroups } from "@/lib/groups/data";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function statusLabel(status: string): string {
  if (status === "closed") return "Closed";
  if (status === "archived") return "Archived";
  return "Active";
}

function formatDate(
  value: string | null,
  timeZone: "UTC" | "Africa/Kampala" = "UTC"
): string {
  if (!value) return "Open-ended";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone
  }).format(parsed);
}

export default async function GroupsPage() {
  await requireApprovedAdminRole();
  const groups = await listReservationGroups();

  const totals = groups.reduce(
    (acc, group) => ({
      bookings: acc.bookings + group.booking_count,
      guests: acc.guests + group.guest_count,
      balance: acc.balance + group.balance_due_ugx
    }),
    { bookings: 0, guests: 0, balance: 0 }
  );

  return (
    <section className="grid gap-7 lg:gap-9">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-bronze-400/15" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-44 w-44 rounded-full border border-oliveMuted-400/10" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
              Reservations
            </p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
              Groups
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
              An umbrella view for multi-booking stays. Each member booking still manages its own room, folio, receipts, and housekeeping.
            </p>
          </div>
          <Link
            href="/groups/new"
            className="group inline-flex min-h-[52px] w-fit items-center gap-3 rounded-[18px] bg-oliveMuted-600 px-5 py-3 text-canvas-light shadow-[0_14px_30px_rgba(82,88,69,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-lg font-light transition-transform group-hover:rotate-90">
              +
            </span>
            <span>
              <span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-canvas-light/70">
                Group
              </span>
              <span className="block text-sm font-semibold">New group</span>
            </span>
          </Link>
        </div>
      </header>

      <section className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
        <div className="grid gap-4 divide-y divide-stoneWarm-200/70 p-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:p-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Visible groups</p>
            <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{groups.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Active bookings</p>
            <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{totals.bookings}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Active balance</p>
            <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(totals.balance)}</p>
          </div>
        </div>
      </section>

      {groups.length === 0 ? (
        <div className="surface-card px-6 py-10 text-sm text-oliveMuted-600">
          No active reservation groups yet. Create one when a guest trip has more than one booking to manage together.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map((group) => {
            const balance = Math.max(0, group.balance_due_ugx);
            return (
              <article
                key={group.id}
                className="grid gap-4 rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_14px_34px_rgba(55,43,30,0.06)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bronze-500">
                        {group.reference}
                      </p>
                      <span className="rounded-full border border-stoneWarm-200 bg-stoneWarm-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                        {statusLabel(group.status)}
                      </span>
                    </div>
                    <h2 className="mt-1 truncate font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
                      {group.group_name}
                    </h2>
                    <p className="mt-2 text-sm text-oliveMuted-600">
                      {group.organizer_name ?? "Organizer not recorded"}
                      {group.organizer_email ? ` - ${group.organizer_email}` : ""}
                      {group.organizer_phone ? ` - ${group.organizer_phone}` : ""}
                    </p>
                    {group.company_account_id && (
                      <p className="mt-2 text-sm font-semibold text-bronze-600">
                        Bill to {group.company_name ?? "company account"}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/groups/${group.id}`}
                    className="rounded-full border border-stoneWarm-200 bg-white px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
                  >
                    Open group
                  </Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                      Active bookings
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[#2a241a]">{group.booking_count}</p>
                    <p className="mt-1 text-xs text-oliveMuted-500">{group.guest_count} guests</p>
                  </div>
                  <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                      Stay window
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#2a241a]">
                      {formatDate(group.first_check_in)} to {formatDate(group.last_check_out)}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/45 p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                      Balance due
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-[#2a241a]">{fmtUgx(balance)}</p>
                    <p className="mt-1 text-xs text-oliveMuted-500">Paid {fmtUgx(group.total_paid_ugx)}</p>
                  </div>
                </div>

                <p className="text-sm text-oliveMuted-600">
                  Active charges {fmtUgx(group.total_charges_ugx)} - Created {formatDate(group.created_at, "Africa/Kampala")}
                </p>
                {group.company_account_id && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-bronze-200 bg-bronze-50/40 px-4 py-3 text-sm">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-bronze-600">
                        Corporate billing
                      </p>
                      <p className="mt-1 font-semibold text-[#2a241a]">{group.company_name}</p>
                      <p className="mt-1 text-xs text-oliveMuted-500">
                        Terms {group.company_payment_terms_days ?? 0} days
                        {group.company_contact_name ? ` - ${group.company_contact_name}` : ""}
                      </p>
                    </div>
                    <Link
                      href={`/companies/${group.company_account_id}`}
                      className="rounded-full border border-bronze-200 bg-white px-3 py-2 text-xs font-semibold text-bronze-700 transition hover:bg-bronze-50"
                    >
                      Company
                    </Link>
                  </div>
                )}
                </article>
              );
            })}
        </div>
      )}
    </section>
  );
}
