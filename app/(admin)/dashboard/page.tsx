import Link from "next/link";
import { getDashboardData, type DashboardBooking, type DashboardContact } from "@/lib/dashboard/data";

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatUgx(value: number): string {
  return `${new Intl.NumberFormat("en-UG").format(value)} UGX`;
}

function guestCount(booking: DashboardBooking): string {
  const adults = `${booking.guests_adults} adult${booking.guests_adults === 1 ? "" : "s"}`;
  if (booking.guests_children === 0) return adults;
  return `${adults}, ${booking.guests_children} child${booking.guests_children === 1 ? "" : "ren"}`;
}

function KpiCard({
  label,
  value,
  detail,
  href
}: {
  label: string;
  value: string | number;
  detail: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-[#2a241a]">{value}</p>
      <p className="mt-1 text-xs text-oliveMuted-600">{detail}</p>
    </>
  );

  if (!href) return <article className="surface-card p-5">{body}</article>;

  return (
    <Link href={href} className="surface-card block p-5 transition hover:border-oliveMuted-300">
      {body}
    </Link>
  );
}

function BookingPanel({
  title,
  bookings,
  empty
}: {
  title: string;
  bookings: DashboardBooking[];
  empty: string;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-stoneWarm-100 px-5 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {bookings.length === 0 ? (
        <p className="px-5 py-5 text-sm text-oliveMuted-600">{empty}</p>
      ) : (
        <div className="divide-y divide-stoneWarm-100">
          {bookings.map((booking) => (
            <Link
              key={booking.id}
              href="/bookings"
              className="block px-5 py-4 transition hover:bg-stoneWarm-50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{booking.guest_full_name}</p>
                    <span className="font-mono text-xs text-oliveMuted-500">{booking.reference}</span>
                  </div>
                  <p className="mt-1 text-sm text-oliveMuted-600">
                    {booking.room_type_title} · {guestCount(booking)}
                  </p>
                  {booking.special_requests && (
                    <p className="mt-1 line-clamp-2 text-xs text-oliveMuted-500">
                      {booking.special_requests}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">{formatUgx(booking.quoted_total_ugx)}</p>
                  {booking.guest_phone && (
                    <p className="mt-1 text-xs text-oliveMuted-500">{booking.guest_phone}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ContactPanel({ contacts }: { contacts: DashboardContact[] }) {
  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-stoneWarm-100 px-5 py-4">
        <h2 className="text-lg font-semibold">Unread Contacts</h2>
        <Link href="/inbox" className="text-sm font-semibold text-oliveMuted-600 hover:underline">
          Open inbox
        </Link>
      </div>
      {contacts.length === 0 ? (
        <p className="px-5 py-5 text-sm text-oliveMuted-600">No unread enquiries.</p>
      ) : (
        <div className="divide-y divide-stoneWarm-100">
          {contacts.map((contact) => (
            <Link
              key={contact.id}
              href="/inbox"
              className="block px-5 py-4 transition hover:bg-stoneWarm-50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{contact.full_name}</p>
                  <p className="mt-1 truncate text-sm text-oliveMuted-600">
                    {contact.subject || contact.email}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-oliveMuted-500">
                  {formatDateTime(contact.created_at)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const stats = [
    {
      label: "Arrivals",
      value: data.arrivalsToday,
      detail: formatDate(data.today),
      href: "/bookings"
    },
    {
      label: "Departures",
      value: data.departuresToday,
      detail: "Checked-in guests due out",
      href: "/bookings"
    },
    {
      label: "In House",
      value: data.inHouse,
      detail: "Currently checked in",
      href: "/bookings"
    },
    {
      label: "Pending Payments",
      value: data.pendingPayments,
      detail: "Active payment holds",
      href: "/bookings"
    },
    {
      label: "Unread Contacts",
      value: data.unreadContacts,
      detail: "Guest enquiries needing review",
      href: "/inbox"
    },
    {
      label: "Tonight",
      value: `${data.occupancyPercent}%`,
      detail: `${data.occupiedTonight} of ${data.totalUnits} units occupied`
    }
  ];

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">
            Live operating view for {formatDate(data.today)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/front-desk"
            className="rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
          >
            Front Desk
          </Link>
          <Link
            href="/bookings"
            className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-50"
          >
            Bookings
          </Link>
          <Link
            href="/availability"
            className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-50"
          >
            Availability
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <KpiCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BookingPanel
          title="Arrivals Today"
          bookings={data.arrivalBookings}
          empty="No confirmed arrivals today."
        />
        <BookingPanel
          title="Departures Today"
          bookings={data.departureBookings}
          empty="No checked-in guests due out today."
        />
      </div>

      <ContactPanel contacts={data.recentUnreadContacts} />
    </section>
  );
}
