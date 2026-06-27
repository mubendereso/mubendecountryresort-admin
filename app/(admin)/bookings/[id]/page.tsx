import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getBookingHistoryData } from "@/lib/bookings/history";
import type { BookingStatus } from "@/lib/bookings/types";
import { listCompanySelectOptions } from "@/lib/companies/data";
import { BookingCompanyPayerForm } from "./company-payer-form";

function fmtUgx(amount: number): string {
  return new Intl.NumberFormat("en-UG").format(amount) + " UGX";
}

function fmtDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(y, m - 1, d));
}

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

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Pending Payment",
  awaiting_confirmation: "Awaiting Confirmation",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  cancelled: "Cancelled",
  no_show: "No Show",
  refunded: "Refunded"
};

const STATUS_STYLE: Record<BookingStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-800",
  awaiting_confirmation: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  checked_in: "bg-teal-100 text-teal-800",
  checked_out: "bg-stoneWarm-100 text-oliveMuted-600",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-orange-100 text-orange-800",
  refunded: "bg-stoneWarm-100 text-stoneWarm-500"
};

function EventCard({
  event,
  tone
}: {
  event: {
    title: string;
    detail: string;
    at: string;
    actor_name: string | null;
    actor_email: string | null;
    action: string;
  };
  tone: "booking" | "folio" | "receipt";
}) {
  const toneClasses =
    tone === "booking"
      ? "border-blue-200 bg-blue-50/70"
      : tone === "folio"
        ? "border-emerald-200 bg-emerald-50/70"
        : "border-stoneWarm-200 bg-stoneWarm-50";

  return (
    <div className={`grid gap-2 rounded-[22px] border px-5 py-4 ${toneClasses}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[#2a241a]">{event.title}</p>
        <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
          {tone}
        </span>
      </div>
      <p className="text-sm text-oliveMuted-600">{event.detail}</p>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-oliveMuted-500">
        <span>{fmtDateTime(event.at)}</span>
        {event.actor_name && <span>By {event.actor_name}</span>}
        {!event.actor_name && event.actor_email && <span>By {event.actor_email}</span>}
      </div>
    </div>
  );
}

export default async function BookingHistoryPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireApprovedAdminRole();
  const { id } = await params;
  const [data, companies] = await Promise.all([getBookingHistoryData(id), listCompanySelectOptions()]);

  if (!data) notFound();

  const booking = data.booking;
  const balanceDue = Math.max(0, booking.total_charges_ugx - booking.total_paid_ugx);
  const nights = Math.round(
    (new Date(`${booking.check_out}T00:00:00Z`).getTime() -
      new Date(`${booking.check_in}T00:00:00Z`).getTime()) /
      86400000
  );
  const guestCount = booking.guests_adults + booking.guests_children;

  return (
    <div className="grid gap-6">
      <nav className="text-sm text-oliveMuted-500">
        <Link href="/bookings" className="hover:underline">
          Bookings
        </Link>
        <span className="mx-2">{">"}</span>
        <span className="font-mono">{booking.reference}</span>
        <span className="mx-2">{">"}</span>
        <span>History</span>
      </nav>

      <section className="grid gap-6">
        <div className="surface-card grid gap-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                Booking history
              </p>
              <h1 className="text-3xl font-semibold">{booking.guest_full_name}</h1>
              <p className="text-sm text-oliveMuted-600">
                {booking.room_type_title} - {booking.reference}
              </p>
              {booking.group_id && (
                <p className="text-sm text-oliveMuted-600">
                  Group{" "}
                  <Link href={`/groups/${booking.group_id}`} className="font-semibold text-oliveMuted-700 hover:underline">
                    {booking.group_name ?? booking.group_reference ?? "Open group"}
                  </Link>
                </p>
              )}
              {booking.effective_company_account_id && (
                <p className="text-sm text-oliveMuted-600">
                  Billed to <Link href={`/companies/${booking.effective_company_account_id}`} className="font-semibold hover:underline">{booking.effective_company_name}</Link>
                  {booking.group_company_account_id ? " through the group" : " directly"}.
                </p>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${STATUS_STYLE[booking.status]}`}
            >
              {STATUS_LABEL[booking.status]}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[20px] border border-stoneWarm-200 bg-stoneWarm-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                Stay
              </p>
              <p className="mt-2 text-sm font-semibold">
                {fmtDate(booking.check_in)} to {fmtDate(booking.check_out)}
              </p>
              <p className="mt-1 text-xs text-oliveMuted-500">
                {nights} {nights === 1 ? "night" : "nights"} - {guestCount} guest
                {guestCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-[20px] border border-stoneWarm-200 bg-stoneWarm-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                Charges
              </p>
              <p className="mt-2 text-xl font-semibold">{fmtUgx(booking.total_charges_ugx)}</p>
            </div>
            <div className="rounded-[20px] border border-stoneWarm-200 bg-stoneWarm-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                Paid
              </p>
              <p className="mt-2 text-xl font-semibold">{fmtUgx(booking.total_paid_ugx)}</p>
            </div>
            <div className="rounded-[20px] border border-stoneWarm-200 bg-stoneWarm-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                Balance due
              </p>
              <p className="mt-2 text-xl font-semibold">{fmtUgx(balanceDue)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/bookings/${booking.id}/folio`}
              className="rounded-full border border-stoneWarm-200 bg-white px-4 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
            >
              View folio
            </Link>
            {(booking.status === "confirmed" || booking.status === "checked_in") && (
              <Link
                href={`/bookings/${booking.id}/edit`}
                className="rounded-full border border-stoneWarm-200 bg-white px-4 py-2 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
              >
                Edit booking
              </Link>
            )}
          </div>
          <div className="grid gap-2 border-t border-stoneWarm-200 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Company payer</p>
            <BookingCompanyPayerForm bookingId={booking.id} groupId={booking.group_id} currentCompanyId={booking.company_account_id} companies={companies} role={session.role} balanceDueUgx={balanceDue} />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="surface-card grid gap-4 p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                  Audit trail
                </p>
                <h2 className="mt-1 text-xl font-semibold">Who changed what</h2>
              </div>
              <p className="text-sm text-oliveMuted-500">
                {data.auditEvents.length} event{data.auditEvents.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="grid gap-3">
              {data.auditEvents.length === 0 ? (
                <p className="text-sm text-oliveMuted-600">No audit entries for this booking yet.</p>
              ) : (
                data.auditEvents.map((event) => (
                  <EventCard key={event.id} event={event} tone="booking" />
                ))
              )}
            </div>
          </section>

          <section className="surface-card grid gap-4 p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                  Booking history
                </p>
                <h2 className="mt-1 text-xl font-semibold">Charges, payments, receipts</h2>
              </div>
              <p className="text-sm text-oliveMuted-500">
                {data.ledgerEvents.length} event{data.ledgerEvents.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="grid gap-3">
              {data.ledgerEvents.length === 0 ? (
                <p className="text-sm text-oliveMuted-600">No folio activity has been recorded yet.</p>
              ) : (
                data.ledgerEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    tone={event.kind === "receipt" ? "receipt" : "folio"}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
