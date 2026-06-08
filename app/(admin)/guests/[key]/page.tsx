import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuestProfile, listBookingsByGuestKey } from "@/lib/guests/data";
import type { BookingRow, BookingStatus } from "@/lib/bookings/types";

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtUgx(n: number): string {
  return new Intl.NumberFormat("en-UG").format(n) + " UGX";
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(y, m - 1, day));
}

function nights(checkIn: string, checkOut: string): number {
  return Math.round(
    (new Date(checkOut + "T00:00:00Z").getTime() -
      new Date(checkIn + "T00:00:00Z").getTime()) /
      86400000
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Pending Payment",
  awaiting_confirmation: "Awaiting",
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

// ─── Booking history row ──────────────────────────────────────────────────────

function StayRow({ booking }: { booking: BookingRow }) {
  const n = nights(booking.check_in, booking.check_out);
  return (
    <div className="surface-card flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[booking.status]}`}
          >
            {STATUS_LABEL[booking.status]}
          </span>
          <span className="font-mono text-xs text-oliveMuted-500">{booking.reference}</span>
        </div>
        <p className="text-sm font-medium">{booking.room_type_title}</p>
        <p className="text-sm text-oliveMuted-600">
          {fmtDate(booking.check_in)} → {fmtDate(booking.check_out)}{" "}
          <span className="text-oliveMuted-400">
            ({n} {n === 1 ? "night" : "nights"})
          </span>
        </p>
        {booking.special_requests && (
          <p className="text-xs text-oliveMuted-500">
            Requests: {booking.special_requests}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <p className="text-sm font-semibold">{fmtUgx(booking.quoted_total_ugx)}</p>
        {(booking.status === "checked_in" || booking.status === "checked_out") && (
          <Link
            href={`/bookings/${booking.id}/folio`}
            className="rounded-xl border border-stoneWarm-200 px-3 py-1 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
          >
            Folio →
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GuestDetailPage({
  params
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  // Next.js decodes route params automatically; re-decode in case of double-encoding
  const decodedKey = decodeURIComponent(key);

  const [profile, bookings] = await Promise.all([
    getGuestProfile(decodedKey),
    listBookingsByGuestKey(decodedKey)
  ]);

  if (!profile) notFound();

  const completedStays = bookings.filter((b) =>
    ["checked_in", "checked_out"].includes(b.status)
  );

  return (
    <div className="grid gap-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-oliveMuted-500">
        <Link href="/guests" className="hover:underline">
          Guests
        </Link>
        <span className="mx-2">›</span>
        <span>{profile.guest_full_name}</span>
      </nav>

      {/* Profile card */}
      <div className="surface-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold">{profile.guest_full_name}</h1>
            {profile.guest_email && (
              <a
                href={`mailto:${profile.guest_email}`}
                className="text-sm text-oliveMuted-600 hover:underline"
              >
                {profile.guest_email}
              </a>
            )}
            {profile.guest_phone && (
              <a
                href={`tel:${profile.guest_phone}`}
                className="text-sm text-oliveMuted-500 hover:underline"
              >
                {profile.guest_phone}
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-6 text-sm">
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
                Total Stays
              </p>
              <p className="mt-0.5 text-xl font-semibold">{profile.total_stays}</p>
            </div>
            {profile.total_spend_ugx > 0 && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
                  Total Spend
                </p>
                <p className="mt-0.5 text-xl font-semibold">
                  {fmtUgx(profile.total_spend_ugx)}
                </p>
              </div>
            )}
            {profile.first_visit && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
                  First Visit
                </p>
                <p className="mt-0.5 font-semibold">{fmtDate(profile.first_visit)}</p>
              </div>
            )}
            {profile.last_visit && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.18em] text-oliveMuted-500">
                  Last Visit
                </p>
                <p className="mt-0.5 font-semibold">{fmtDate(profile.last_visit)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stay history */}
      <section className="grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Stay History</h2>
          <span className="text-sm text-oliveMuted-500">
            {completedStays.length} stay{completedStays.length !== 1 ? "s" : ""} ·{" "}
            {bookings.length} total booking{bookings.length !== 1 ? "s" : ""}
          </span>
        </div>

        {bookings.length === 0 ? (
          <p className="text-sm text-oliveMuted-600">No bookings found.</p>
        ) : (
          <div className="grid gap-2">
            {bookings.map((b) => (
              <StayRow key={b.id} booking={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
