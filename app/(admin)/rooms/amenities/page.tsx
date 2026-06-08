import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getRoomTypes } from "@/lib/rooms/data";

export default async function RoomAmenitiesPage() {
  const [session, rooms] = await Promise.all([requireApprovedAdminRole(), getRoomTypes()]);
  if (session.role === "staff") redirect("/rooms");

  const amenityUsage = new Map<string, string[]>();
  for (const room of rooms.filter((item) => !item.archived_at)) {
    for (const amenity of room.amenities) {
      amenityUsage.set(amenity, [...(amenityUsage.get(amenity) ?? []), room.title]);
    }
  }

  return (
    <section className="grid gap-6">
      <header className="rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] to-stoneWarm-100/55 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-8">
        <Link href="/rooms" className="text-sm font-semibold text-oliveMuted-600 hover:underline">Back to rooms</Link>
        <h1 className="mt-5 font-serif text-3xl font-semibold text-[#2a241a]">Room Amenities</h1>
        <p className="mt-3 text-sm text-oliveMuted-600">Review amenity coverage and open any room type to edit its guest-facing amenity list.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from(amenityUsage.entries()).map(([amenity, roomNames]) => (
          <article key={amenity} className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_10px_24px_rgba(55,43,30,0.05)]">
            <h2 className="font-serif text-lg font-semibold text-[#2a241a]">{amenity}</h2>
            <p className="mt-2 text-xs text-oliveMuted-500">{roomNames.length} room type{roomNames.length === 1 ? "" : "s"}</p>
            <p className="mt-3 text-sm leading-6 text-oliveMuted-600">{roomNames.join(", ")}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3">
        <h2 className="font-serif text-xl font-semibold text-[#2a241a]">Edit amenities by room</h2>
        {rooms.filter((room) => !room.archived_at).map((room) => (
          <Link key={room.id} href={`/rooms/${room.slug}#amenities`} className="flex items-center justify-between rounded-[18px] border border-stoneWarm-200/80 bg-[#fffdf8] px-4 py-3 text-sm font-semibold text-[#2a241a] transition hover:bg-stoneWarm-100/60">
            <span>{room.title}</span>
            <span className="text-xs font-normal text-oliveMuted-500">{room.amenities.length} amenities</span>
          </Link>
        ))}
      </section>
    </section>
  );
}
