import { getHousekeepingData } from "@/lib/housekeeping/data";
import { HousekeepingClient } from "./housekeeping-client";

export const dynamic = "force-dynamic";

export default async function HousekeepingPage() {
  const data = await getHousekeepingData();
  return <HousekeepingClient initialData={data} />;
}
