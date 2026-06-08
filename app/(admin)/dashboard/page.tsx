import Link from "next/link";
import {
  getDashboardData,
  type DashboardBooking,
  type DashboardOccupancyDay
} from "@/lib/dashboard/data";
import type { BookingStatus } from "@/lib/bookings/types";

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parseDate(value));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short"
  }).format(parseDate(value));
}

function formatWeekday(value: string): string {
  return new Intl.DateTimeFormat("en-UG", { weekday: "short" }).format(parseDate(value));
}

function BedIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M4 18v-7m16 7v-5a3 3 0 0 0-3-3H9a5 5 0 0 0-5 5v3" />
      <path d="M4 14h16M7 10V7h5a3 3 0 0 1 3 3" />
      <path d="M6 18v2m12-2v2" strokeLinecap="round" />
    </svg>
  );
}

function ArrivalIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v3h14v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DepartureIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M12 15V4m0 0 4 4m-4-4L8 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v3h14v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path d="M8 3.5v4m8-4v4M3.5 10h17" strokeLinecap="round" />
    </svg>
  );
}

function MessageIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 3v-13a2 2 0 0 1 2-2Z" />
      <path d="M8 10h8M8 13h5" strokeLinecap="round" />
    </svg>
  );
}

function PaymentIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <rect x="3.5" y="6" width="17" height="12" rx="3" />
      <path d="M3.5 10h17M7 14h3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m6.5 12.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SummaryMetric({
  icon,
  label,
  value,
  detail
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="flex min-w-[150px] flex-1 items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-stoneWarm-100 text-oliveMuted-600">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
          {label}
        </span>
        <span className="mt-0.5 block truncate font-serif text-xl font-semibold text-[#2a241a]">
          {value}
        </span>
        {detail && <span className="block text-[10px] text-oliveMuted-500">{detail}</span>}
      </span>
    </div>
  );
}

function TodaySummary({
  today,
  inHouseGuests,
  arrivals,
  departures,
  occupancy,
  unread
}: {
  today: string;
  inHouseGuests: number;
  arrivals: number;
  departures: number;
  occupancy: number;
  unread: number;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.07)]">
      <div className="flex flex-wrap divide-y divide-stoneWarm-200/70 sm:divide-x sm:divide-y-0">
        <SummaryMetric icon={<CalendarIcon />} label="Today" value={formatShortDate(today)} detail={formatWeekday(today)} />
        <SummaryMetric icon={<BedIcon />} label="In house" value={inHouseGuests} detail="guests" />
        <SummaryMetric icon={<ArrivalIcon />} label="Arrivals" value={arrivals} detail="today" />
        <SummaryMetric icon={<DepartureIcon />} label="Departures" value={departures} detail="today" />
        <SummaryMetric icon={<BedIcon />} label="Occupancy" value={`${occupancy}%`} detail="tonight" />
        <SummaryMetric icon={<MessageIcon />} label="Messages" value={unread} detail="unread" />
      </div>
    </section>
  );
}

function AttentionCard({
  pendingPayments,
  unreadContacts,
  arrivals,
  departures
}: {
  pendingPayments: number;
  unreadContacts: number;
  arrivals: number;
  departures: number;
}) {
  const issues = [
    {
      label: `${pendingPayments} pending payment${pendingPayments === 1 ? "" : "s"} need review`,
      detail: "Confirm payment state before the guest journey is affected.",
      count: pendingPayments,
      href: "/bookings",
      icon: <PaymentIcon />
    },
    {
      label: `${unreadContacts} unread guest ${unreadContacts === 1 ? "enquiry" : "enquiries"}`,
      detail: "A guest is waiting for a response from the resort.",
      count: unreadContacts,
      href: "/inbox",
      icon: <MessageIcon />
    },
    {
      label: `${arrivals} ${arrivals === 1 ? "arrival is" : "arrivals are"} awaiting check-in`,
      detail: "Prepare room assignments and welcome details.",
      count: arrivals,
      href: "/front-desk",
      icon: <ArrivalIcon />
    },
    {
      label: `${departures} ${departures === 1 ? "departure is" : "departures are"} awaiting check-out`,
      detail: "Review folios and close stays with care.",
      count: departures,
      href: "/front-desk",
      icon: <DepartureIcon />
    }
  ].filter((issue) => issue.count > 0);

  const allClear = [
    "No pending payments",
    "No unread guest enquiries",
    "No arrivals awaiting check-in",
    "No departures awaiting check-out"
  ];

  return (
    <section className="rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_16px_38px_rgba(55,43,30,0.08)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
            Operational heartbeat
          </p>
          <h2 className="mt-2 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
            Attention Required
          </h2>
        </div>
        <span
          className={`grid h-11 min-w-11 place-items-center rounded-full px-3 font-serif text-lg font-semibold ${
            issues.length === 0
              ? "bg-oliveMuted-600 text-canvas-light"
              : "border border-bronze-400/30 bg-bronze-400/10 text-bronze-500"
          }`}
        >
          {issues.length === 0 ? <CheckIcon /> : issues.length}
        </span>
      </div>

      {issues.length === 0 ? (
        <div className="mt-5 grid gap-2.5">
          {allClear.map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-[17px] bg-stoneWarm-100/45 px-3.5 py-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-oliveMuted-600 text-canvas-light">
                <CheckIcon className="h-4 w-4" />
              </span>
              <p className="text-sm font-medium text-oliveMuted-600">{item}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 grid gap-3">
          {issues.map((issue) => (
            <Link
              key={issue.label}
              href={issue.href}
              className="group flex items-start gap-3 rounded-[18px] border border-stoneWarm-200/70 bg-stoneWarm-100/35 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-stoneWarm-100/65"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[#fffdf8] text-bronze-500 shadow-sm">
                {issue.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#2a241a]">{issue.label}</span>
                <span className="mt-1 block text-xs leading-5 text-oliveMuted-500">{issue.detail}</span>
              </span>
              <span className="ml-auto mt-1 text-oliveMuted-400 transition-transform group-hover:translate-x-0.5">
                &rarr;
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ResortStatus({
  occupancyPercent,
  occupiedRooms,
  totalRooms
}: {
  occupancyPercent: number;
  occupiedRooms: number;
  totalRooms: number;
}) {
  const availableRooms = Math.max(0, totalRooms - occupiedRooms);
  const segments = 16;
  const filledSegments = Math.round((occupancyPercent / 100) * segments);

  return (
    <section className="rounded-[26px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] to-stoneWarm-100/45 p-5 shadow-[0_16px_38px_rgba(55,43,30,0.08)] sm:p-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
        Resort status
      </p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <div>
          <p className="font-serif text-4xl font-semibold tracking-[-0.03em] text-[#2a241a]">
            {occupancyPercent}%
          </p>
          <p className="mt-1 text-sm text-oliveMuted-600">Occupancy tonight</p>
        </div>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-oliveMuted-600 text-canvas-light shadow-[0_10px_24px_rgba(82,88,69,0.2)]">
          <BedIcon className="h-6 w-6" />
        </span>
      </div>

      <div className="mt-7 flex gap-1.5" aria-label={`${occupancyPercent}% occupancy`}>
        {Array.from({ length: segments }, (_, index) => (
          <span
            key={index}
            className={`h-3 flex-1 rounded-full ${
              index < filledSegments ? "bg-oliveMuted-600" : "bg-stoneWarm-200"
            }`}
          />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-3 divide-x divide-stoneWarm-200/80 rounded-[18px] border border-stoneWarm-200/70 bg-[#fffdf8]/70 py-4 text-center">
        <StatusValue label="Occupied" value={occupiedRooms} />
        <StatusValue label="Available" value={availableRooms} />
        <StatusValue label="Total rooms" value={totalRooms} />
      </div>
    </section>
  );
}

function StatusValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2">
      <p className="font-serif text-2xl font-semibold text-[#2a241a]">{value}</p>
      <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-oliveMuted-500">
        {label}
      </p>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  detail,
  href,
  action
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  href: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-stoneWarm-300 hover:shadow-[0_16px_34px_rgba(55,43,30,0.1)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-stoneWarm-100 text-oliveMuted-600">
          {icon}
        </span>
        <span className="font-serif text-3xl font-semibold text-[#2a241a]">{value}</span>
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.17em] text-oliveMuted-500">
        {label}
      </p>
      <p className="mt-1 text-xs leading-5 text-oliveMuted-600">{detail}</p>
      <p className="mt-3 text-[11px] font-semibold text-oliveMuted-600 transition-colors group-hover:text-[#2a241a]">
        {action} &rarr;
      </p>
    </Link>
  );
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: "Pending payment",
  awaiting_confirmation: "Awaiting review",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No show",
  refunded: "Refunded"
};

function UpcomingBookings({ bookings }: { bookings: DashboardBooking[] }) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_16px_38px_rgba(55,43,30,0.08)]">
      <div className="flex items-center justify-between gap-4 border-b border-stoneWarm-200/70 px-5 py-5 sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
            Forward view
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
            Upcoming Bookings
          </h2>
        </div>
        <Link href="/bookings" className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100">
          View all
        </Link>
      </div>

      {bookings.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-stoneWarm-100 text-oliveMuted-600">
            <CalendarIcon className="h-6 w-6" />
          </span>
          <h3 className="mt-4 font-serif text-xl font-semibold text-[#2a241a]">
            No upcoming bookings today.
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-oliveMuted-600">
            Future reservations will appear here automatically as guests complete their booking.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-stoneWarm-200/70">
          {bookings.map((booking) => (
            <Link
              key={booking.id}
              href={`/bookings/${booking.id}/edit`}
              className="grid gap-3 px-5 py-4 transition-colors hover:bg-stoneWarm-100/35 sm:grid-cols-[1.35fr_1fr_0.75fr_auto] sm:items-center sm:px-6"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#2a241a]">{booking.guest_full_name}</p>
                <p className="mt-1 font-mono text-[10px] tracking-wide text-oliveMuted-500">{booking.reference}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-oliveMuted-500">Room</p>
                <p className="mt-1 text-sm text-oliveMuted-600">{booking.room_type_title}</p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-oliveMuted-500">Check-in</p>
                <p className="mt-1 text-sm font-semibold text-[#2a241a]">{formatShortDate(booking.check_in)}</p>
              </div>
              <span className="w-fit rounded-full bg-stoneWarm-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-oliveMuted-600">
                {STATUS_LABELS[booking.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function OccupancyTrend({
  days,
  totalRooms
}: {
  days: DashboardOccupancyDay[];
  totalRooms: number;
}) {
  const peak = Math.max(1, ...days.map((day) => day.occupancyPercent));

  return (
    <section className="rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_16px_38px_rgba(55,43,30,0.08)] sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
            Booking momentum
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
            Occupancy This Week
          </h2>
          <p className="mt-2 text-sm text-oliveMuted-600">
            Seven-day room demand across {totalRooms} available units.
          </p>
        </div>
        <Link href="/calendar" className="rounded-full px-3 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100">
          Open calendar
        </Link>
      </div>

      <div className="mt-8 grid h-52 grid-cols-7 items-end gap-2 sm:gap-4">
        {days.map((day, index) => {
          const relativeHeight = day.occupancyPercent === 0 ? 5 : Math.max(12, (day.occupancyPercent / peak) * 100);
          return (
            <div key={day.date} className="flex h-full min-w-0 flex-col justify-end text-center">
              <p className="mb-2 text-[10px] font-semibold text-oliveMuted-600">{day.occupancyPercent}%</p>
              <div className="flex h-32 items-end rounded-[14px] bg-stoneWarm-100/60 p-1.5">
                <div
                  className={`w-full rounded-[10px] transition-all ${
                    index === 0 ? "bg-oliveMuted-600" : "bg-oliveMuted-400"
                  }`}
                  style={{ height: `${relativeHeight}%` }}
                  title={`${day.occupiedRooms} occupied rooms`}
                />
              </div>
              <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-oliveMuted-500">
                {formatWeekday(day.date)}
              </p>
              <p className="mt-0.5 text-[10px] text-oliveMuted-500">{formatShortDate(day.date)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <section className="grid gap-8 lg:gap-10">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
          Resort operations
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
          Dashboard
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
          A calm, complete view of the resort for {formatDate(data.today)}.
        </p>
      </header>

      <TodaySummary
        today={data.today}
        inHouseGuests={data.inHouseGuests}
        arrivals={data.arrivalsToday}
        departures={data.departuresToday}
        occupancy={data.occupancyPercent}
        unread={data.unreadContacts}
      />

      <div className="grid items-stretch gap-6 xl:grid-cols-2">
        <ResortStatus
          occupancyPercent={data.occupancyPercent}
          occupiedRooms={data.occupiedTonight}
          totalRooms={data.totalUnits}
        />
        <AttentionCard
          pendingPayments={data.pendingPayments}
          unreadContacts={data.unreadContacts}
          arrivals={data.arrivalsToday}
          departures={data.departuresToday}
        />
      </div>

      <section>
        <div className="mb-4 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
            Daily operations
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
            At a glance
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard icon={<ArrivalIcon />} label="Arrivals Today" value={data.arrivalsToday} detail="Guests expected to check in." href="/front-desk" action="Open arrivals" />
          <KpiCard icon={<DepartureIcon />} label="Departures Today" value={data.departuresToday} detail="Stays scheduled to close." href="/front-desk" action="Open departures" />
          <KpiCard icon={<BedIcon />} label="In House Guests" value={data.inHouseGuests} detail="Guests currently staying." href="/front-desk" action="View front desk" />
          <KpiCard icon={<PaymentIcon />} label="Pending Payments" value={data.pendingPayments} detail="Payments still unresolved." href="/bookings" action="Review payments" />
          <KpiCard icon={<MessageIcon />} label="Unread Contacts" value={data.unreadContacts} detail="Guest enquiries needing reply." href="/inbox" action="Open inbox" />
        </div>
      </section>

      <UpcomingBookings bookings={data.upcomingBookings} />

      <OccupancyTrend days={data.occupancyWeek} totalRooms={data.totalUnits} />
    </section>
  );
}
