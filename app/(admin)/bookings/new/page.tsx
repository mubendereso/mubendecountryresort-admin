import { getRoomTypes } from "@/lib/rooms/data";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { BookingForm } from "../booking-form";

export default async function NewBookingPage() {
  await requireApprovedAdminRole();
  const rooms = await getRoomTypes();

  const roomOptions = rooms
    .filter((r) => r.is_published && !r.archived_at)
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      priceUgx: Number(r.price_ugx)
    }));

  return <BookingForm mode="create" rooms={roomOptions} />;
}
