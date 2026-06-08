import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookingById } from "@/lib/bookings/data";
import { getRoomTypes } from "@/lib/rooms/data";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { BookingForm } from "../../booking-form";

export default async function EditBookingPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  await requireApprovedAdminRole();
  const { id } = await params;

  const [booking, rooms] = await Promise.all([getBookingById(id), getRoomTypes()]);
  if (!booking) notFound();

  const editable = booking.status === "confirmed" || booking.status === "checked_in";
  if (!editable) {
    return (
      <section className="grid max-w-3xl gap-6">
        <h1 className="text-3xl font-semibold">Edit Booking</h1>
        <div className="surface-card grid gap-3 px-5 py-6 text-sm text-oliveMuted-600">
          <p>
            This booking is <span className="font-semibold">{booking.status.replace(/_/g, " ")}</span> and
            can no longer be edited. Only confirmed or checked-in bookings can be modified.
          </p>
          <Link
            href={`/bookings/${booking.id}/folio`}
            className="text-oliveMuted-700 hover:underline"
          >
            ← Back to folio
          </Link>
        </div>
      </section>
    );
  }

  const roomOptions = rooms
    .filter((r) => (r.is_published && !r.archived_at) || r.id === booking.room_type_id)
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      priceUgx: Number(r.price_ugx)
    }));

  const currentRoom = rooms.find((r) => r.id === booking.room_type_id);

  return (
    <BookingForm
      mode="edit"
      rooms={roomOptions}
      bookingId={booking.id}
      status={booking.status as "confirmed" | "checked_in"}
      initial={{
        roomSlug: currentRoom?.slug ?? roomOptions[0]?.slug ?? "",
        checkIn: booking.check_in,
        checkOut: booking.check_out,
        adults: booking.guests_adults,
        children: booking.guests_children,
        fullName: booking.guest_full_name,
        phone: booking.guest_phone ?? "",
        email: booking.guest_email ?? "",
        specialRequests: booking.special_requests ?? "",
        notes: booking.notes ?? ""
      }}
    />
  );
}
