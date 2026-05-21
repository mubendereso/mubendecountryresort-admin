import { listGuests } from "@/lib/guests/data";
import { GuestsClient } from "./guests-client";

export default async function GuestsPage() {
  const guests = await listGuests();
  return <GuestsClient guests={guests} />;
}
