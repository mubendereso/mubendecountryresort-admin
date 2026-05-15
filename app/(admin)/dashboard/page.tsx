import Link from "next/link";
import { getRoomTypes } from "@/lib/rooms/data";

export default async function DashboardPage() {
  const roomTypes = await getRoomTypes();

  const stats = [
    { title: "Room types", value: roomTypes.length, detail: "Seeded and editable" },
    {
      title: "Published rooms",
      value: roomTypes.filter((room) => room.is_published).length,
      detail: "Visible to public once storefront is wired"
    },
    {
      title: "Total units",
      value: roomTypes.reduce((sum, room) => sum + room.inventory_count, 0),
      detail: "Across all room types"
    }
  ];

  return (
    <section className="grid gap-6">
      <header>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-oliveMuted-600">
          Operational overview for Mubende Country Resort. Room content and availability checks are
          now connected to Neon.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <article key={stat.title} className="surface-card p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">
              {stat.title}
            </p>
            <p className="mt-3 text-2xl font-semibold">{stat.value}</p>
            <p className="mt-1 text-xs text-oliveMuted-600">{stat.detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          {
            title: "Manage room types",
            body: "Edit rates, published state, copy, gallery URLs, and inventory counts.",
            href: "/rooms",
            cta: "Open rooms"
          },
          {
            title: "Check availability",
            body: "Check a room type across a date window before the storefront booking flow lands.",
            href: "/availability",
            cta: "Check dates"
          }
        ].map((item) => (
          <article key={item.title} className="surface-card p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Next step</p>
            <h2 className="mt-3 text-xl font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-oliveMuted-600">{item.body}</p>
            <Link
              href={item.href}
              className="mt-4 inline-flex rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
            >
              {item.cta}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
