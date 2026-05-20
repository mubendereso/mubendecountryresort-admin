import { getOccupancyCalendarData } from "@/lib/calendar/data";
import { CalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const data = await getOccupancyCalendarData(30);
  return <CalendarClient initialData={data} />;
}
