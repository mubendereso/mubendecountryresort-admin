import Link from "next/link";
import { getRoomTypes } from "@/lib/rooms/data";
import { formatUgx } from "@/lib/rooms/format";

function PublishedBadge({ published }: { published: boolean }) {
  return (
    <span
      className={
        published
          ? "rounded-full bg-oliveMuted-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-canvas-light"
          : "rounded-full bg-stoneWarm-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-oliveMuted-600"
      }
    >
      {published ? "Published" : "Hidden"}
    </span>
  );
}

export default async function RoomsPage() {
  const rooms = await getRoomTypes();

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Room Types</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-oliveMuted-600">
            Manage room copy, pricing, publication, and inventory. Inventory reductions are checked
            by the database before they are accepted.
          </p>
        </div>
        <Link
          href="/availability"
          className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          Check availability
        </Link>
      </header>

      <div className="overflow-hidden rounded-3xl border border-stoneWarm-200 bg-white shadow-soft">
        <div className="hidden grid-cols-[1.7fr_0.9fr_0.7fr_0.7fr_0.5fr] gap-4 border-b border-stoneWarm-200 bg-stoneWarm-100 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-600 md:grid">
          <span>Room</span>
          <span>Rate</span>
          <span>Inventory</span>
          <span>Status</span>
          <span className="text-right">Edit</span>
        </div>
        <div className="divide-y divide-stoneWarm-200">
          {rooms.map((room) => (
            <article
              key={room.id}
              className="grid gap-4 px-5 py-4 md:grid-cols-[1.7fr_0.9fr_0.7fr_0.7fr_0.5fr] md:items-center"
            >
              <div>
                <h2 className="font-semibold">{room.title}</h2>
                <p className="mt-1 text-xs text-oliveMuted-600">{room.slug}</p>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-oliveMuted-600">
                  {room.description ?? "No short description yet."}
                </p>
              </div>
              <p className="text-sm font-semibold">{formatUgx(room.price_ugx)}</p>
              <p className="text-sm">{room.inventory_count} units</p>
              <PublishedBadge published={room.is_published} />
              <div className="md:text-right">
                <Link
                  href={`/rooms/${room.slug}`}
                  className="inline-flex rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
                >
                  Edit
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
