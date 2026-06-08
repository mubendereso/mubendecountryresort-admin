import { getOccupancyCalendarData } from "@/lib/calendar/data";
import { CalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";

function getFirstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default async function CalendarPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requestedStart = getFirstValue(query.start);
  const data = await getOccupancyCalendarData(14, validDate(requestedStart) ? requestedStart : undefined);
  return <CalendarClient initialData={data} />;
}
