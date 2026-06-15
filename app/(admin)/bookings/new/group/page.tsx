import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getGroupBookingRoomOptions } from "@/lib/rooms/data";
import { GroupBookingForm } from "./group-booking-form";

function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export default async function NewGroupBookingPage() {
  await requireApprovedAdminRole();
  const checkIn = todayISO();
  const checkOut = addDays(checkIn, 1);
  const rooms = await getGroupBookingRoomOptions(checkIn, checkOut);

  return <GroupBookingForm rooms={rooms} initialCheckIn={checkIn} initialCheckOut={checkOut} />;
}
