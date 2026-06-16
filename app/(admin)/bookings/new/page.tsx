import { notFound } from "next/navigation";
import { getRoomTypes } from "@/lib/rooms/data";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getReservationGroupById } from "@/lib/groups/data";
import { BookingForm } from "../booking-form";

export default async function NewBookingPage({
  searchParams
}: {
  searchParams: Promise<{ groupId?: string }>;
}) {
  await requireApprovedAdminRole();
  const params = await searchParams;
  const [rooms, group] = await Promise.all([
    getRoomTypes(),
    params.groupId ? getReservationGroupById(params.groupId) : Promise.resolve(null)
  ]);

  if (params.groupId && !group) notFound();

  const roomOptions = rooms
    .filter((r) => r.is_published && !r.archived_at)
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      priceUgx: Number(r.price_ugx)
    }));

  return (
    <BookingForm
      mode="create"
      rooms={roomOptions}
      group={
        group
          ? {
              id: group.id,
              reference: group.reference,
              groupName: group.group_name,
              status: group.status
            }
          : undefined
      }
    />
  );
}
