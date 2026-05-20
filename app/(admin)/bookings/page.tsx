import { listBookings } from "@/lib/bookings/data";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { BookingsClient } from "./bookings-client";

export default async function BookingsPage() {
  const [bookings, session] = await Promise.all([
    listBookings(),
    requireApprovedAdminRole()
  ]);

  return <BookingsClient initialBookings={bookings} role={session.role} />;
}
