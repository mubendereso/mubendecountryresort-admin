import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getReservationGroupDetailData } from "@/lib/groups/data";
import { archiveReservationGroupAction, updateReservationGroupAction } from "@/lib/groups/actions";
import { GroupMembershipManager } from "../group-membership-manager";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
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

const FIELD_CLASS =
  "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500";

function ActivityCard({
  event
}: {
  event: {
    title: string;
    detail: string;
    at: string;
    actor_name: string | null;
    actor_email: string | null;
  };
}) {
  return (
    <div className="grid gap-2 rounded-[22px] border border-stoneWarm-200 bg-stoneWarm-50 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[#2a241a]">{event.title}</p>
      </div>
      <p className="text-sm text-oliveMuted-600">{event.detail}</p>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-oliveMuted-500">
        <span>
          {new Intl.DateTimeFormat("en-UG", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Africa/Kampala"
          }).format(new Date(event.at))}
        </span>
        {event.actor_name && <span>By {event.actor_name}</span>}
        {!event.actor_name && event.actor_email && <span>By {event.actor_email}</span>}
      </div>
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "closed") return "Closed";
  if (status === "archived") return "Archived";
  return "Active";
}

export default async function GroupDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireApprovedAdminRole();
  const { id } = await params;
  const data = await getReservationGroupDetailData(id);

  if (!data) notFound();

  const group = data.group;
  const balanceDue = Math.max(0, group.balance_due_ugx);

  async function saveGroupDetails(formData: FormData) {
    "use server";
    const result = await updateReservationGroupAction(formData);
    if (!result.ok) throw new Error(result.error);
  }

  async function archiveGroup(formData: FormData) {
    "use server";
    const result = await archiveReservationGroupAction(formData);
    if (!result.ok) throw new Error(result.error);
  }

  return (
    <section className="grid gap-7 lg:gap-9">
      <nav className="text-sm text-oliveMuted-500">
        <Link href="/groups" className="hover:underline">
          Groups
        </Link>
        <span className="mx-2">{">"}</span>
        <span className="font-mono">{group.reference}</span>
      </nav>

      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-bronze-400/15" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-44 w-44 rounded-full border border-oliveMuted-400/10" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
                Reservation group
              </p>
              <span className="rounded-full border border-stoneWarm-200 bg-stoneWarm-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                {statusLabel(group.status)}
              </span>
            </div>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
              {group.group_name}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
              {group.reference}
            </p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600">
              {group.organizer_name ?? "Organizer not recorded"}
              {group.organizer_email ? ` - ${group.organizer_email}` : ""}
              {group.organizer_phone ? ` - ${group.organizer_phone}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/groups/${group.id}/folio`}
              className="rounded-[18px] border border-stoneWarm-200 bg-[#fffdf8]/90 px-5 py-3 text-sm font-semibold text-oliveMuted-600 transition hover:bg-white"
            >
              Group folio
            </Link>
            <Link
              href={`/bookings/new?groupId=${group.id}`}
              className="group inline-flex min-h-[52px] w-fit items-center gap-3 rounded-[18px] bg-oliveMuted-600 px-5 py-3 text-canvas-light shadow-[0_14px_30px_rgba(82,88,69,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-lg font-light transition-transform group-hover:rotate-90">
                +
              </span>
              <span>
                <span className="block text-[9px] font-semibold uppercase tracking-[0.17em] text-canvas-light/70">
                  Booking
                </span>
                <span className="block text-sm font-semibold">Add booking to group</span>
              </span>
            </Link>
            {group.status !== "archived" && (
              <form action={archiveGroup}>
                <input type="hidden" name="groupId" value={group.id} />
                <button
                  type="submit"
                  className="rounded-[18px] border border-stoneWarm-200 bg-[#fffdf8]/90 px-5 py-3 text-sm font-semibold text-oliveMuted-600 transition hover:bg-white"
                >
                  Archive group
                </button>
              </form>
            )}
            <Link
              href="/groups"
              className="rounded-[18px] border border-stoneWarm-200 bg-[#fffdf8]/90 px-5 py-3 text-sm font-semibold text-oliveMuted-600 transition hover:bg-white"
            >
              Back to groups
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Active bookings</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{group.booking_count}</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Guests</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{group.guest_count}</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Charged</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(group.total_charges_ugx)}</p>
        </div>
        <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Balance due</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">{fmtUgx(balanceDue)}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="rounded-[28px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_18px_45px_rgba(55,43,30,0.08)] sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
            Historical totals
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
            Cancelled and no-show bookings stay recorded
          </h2>
          <p className="mt-2 text-sm leading-6 text-oliveMuted-600">
            Active totals ignore cancelled, no-show, and refunded member bookings so the group record reflects the live operational stay.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-stoneWarm-200 bg-stoneWarm-50 p-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                Historical bookings
              </p>
              <p className="mt-2 text-2xl font-semibold text-[#2a241a]">{group.historical_booking_count}</p>
            </div>
            <div className="rounded-[20px] border border-stoneWarm-200 bg-stoneWarm-50 p-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                Historical charges
              </p>
              <p className="mt-2 text-xl font-semibold text-[#2a241a]">{fmtUgx(group.historical_total_charges_ugx)}</p>
            </div>
            <div className="rounded-[20px] border border-stoneWarm-200 bg-stoneWarm-50 p-4">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
                Historical balance
              </p>
              <p className="mt-2 text-xl font-semibold text-[#2a241a]">{fmtUgx(group.historical_balance_due_ugx)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[28px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 text-sm text-oliveMuted-600 shadow-[0_18px_45px_rgba(55,43,30,0.08)] sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
            Lifecycle note
          </p>
          <p className="mt-2 leading-6">
            The group stay window is still just the umbrella default. Individual bookings keep their own dates, folios, receipts, room assignments, and housekeeping flow.
          </p>
          <p className="mt-3 leading-6">
            Archived groups are hidden from the default list but remain accessible directly for review or recovery.
          </p>
        </div>
      </section>

      <section className="grid gap-4 rounded-[28px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_18px_45px_rgba(55,43,30,0.08)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">Group details</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
              Edit organiser details
            </h2>
          </div>
          <p className="text-sm text-oliveMuted-500">
            This keeps the umbrella record tidy while member bookings stay atomic.
          </p>
        </div>

        <form action={saveGroupDetails} className="grid gap-4">
          <input type="hidden" name="groupId" value={group.id} />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="groupName" className={LABEL_CLASS}>Group name</label>
              <input id="groupName" name="groupName" defaultValue={group.group_name} className={FIELD_CLASS} required />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="organizerName" className={LABEL_CLASS}>Organiser name</label>
              <input id="organizerName" name="organizerName" defaultValue={group.organizer_name ?? ""} className={FIELD_CLASS} />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="organizerEmail" className={LABEL_CLASS}>Organiser email</label>
              <input id="organizerEmail" name="organizerEmail" type="email" defaultValue={group.organizer_email ?? ""} className={FIELD_CLASS} />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="organizerPhone" className={LABEL_CLASS}>Organiser phone</label>
              <input id="organizerPhone" name="organizerPhone" defaultValue={group.organizer_phone ?? ""} className={FIELD_CLASS} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="notes" className={LABEL_CLASS}>Group notes</label>
            <textarea id="notes" name="notes" rows={4} defaultValue={group.notes ?? ""} className={`${FIELD_CLASS} min-h-[120px]`} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="submit"
              className="rounded-full bg-oliveMuted-600 px-5 py-2.5 text-sm font-semibold text-canvas-light shadow-[0_10px_24px_rgba(82,88,69,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500"
            >
              Save group details
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <GroupMembershipManager
          groupId={group.id}
          attachableBookings={data.attachableBookings}
          bookings={data.bookings}
        />

        <section className="grid gap-4">
          <div className="flex items-end justify-between gap-3 px-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
                Activity
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
                Group history
              </h2>
            </div>
            <p className="text-sm text-oliveMuted-500">
              {data.auditEvents.length} event{data.auditEvents.length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="grid gap-3">
            {data.auditEvents.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-6 py-10 text-sm text-oliveMuted-600">
                No group activity has been recorded yet.
              </div>
            ) : (
              data.auditEvents.map((event) => <ActivityCard key={event.id} event={event} />)
            )}
          </div>

          <div className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 text-sm text-oliveMuted-600 shadow-[0_12px_30px_rgba(55,43,30,0.06)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
              Stay window
            </p>
            <p className="mt-2 font-semibold text-[#2a241a]">
              {formatDate(group.first_check_in)} to {formatDate(group.last_check_out)}
            </p>
            <p className="mt-2 leading-6">
              Groups do not change booking-level operations. Every member booking still checks in, checks out, posts folio charges, issues receipts, and cycles housekeeping independently.
            </p>
          </div>
        </section>
      </section>
    </section>
  );
}
