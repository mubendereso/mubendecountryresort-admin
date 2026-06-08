import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { createRoomTypeAction } from "@/lib/rooms/actions";

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  defaultValue
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#2a241a]">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="rounded-[16px] border border-stoneWarm-200 bg-white/75 px-4 py-3 text-sm font-normal outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-400/10"
      />
    </label>
  );
}

function Area({ label, name, rows = 5 }: { label: string; name: string; rows?: number }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#2a241a]">
      {label}
      <textarea
        name={name}
        rows={rows}
        className="resize-y rounded-[16px] border border-stoneWarm-200 bg-white/75 px-4 py-3 text-sm font-normal leading-6 outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-400/10"
      />
    </label>
  );
}

export default async function NewRoomPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, query] = await Promise.all([requireApprovedAdminRole(), searchParams]);
  if (session.role === "staff") redirect("/rooms");
  const message = first(query.message);

  return (
    <section className="grid gap-6">
      <header className="rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] to-stoneWarm-100/55 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-8">
        <Link href="/rooms" className="text-sm font-semibold text-oliveMuted-600 hover:underline">Back to rooms</Link>
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-oliveMuted-500">New hospitality product</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-[#2a241a]">Add Room Type</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600">
          Create the room product first, then add its full gallery and refine the guest-facing content.
        </p>
      </header>

      {message && <div className="rounded-[18px] border border-[#a4635b]/25 bg-[#a4635b]/10 px-4 py-3 text-sm text-[#8b4d46]">{message}</div>}

      <form action={createRoomTypeAction} className="grid gap-5">
        <section className="grid gap-5 rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_16px_38px_rgba(55,43,30,0.07)] sm:p-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Room identity</p>
            <h2 className="mt-1 font-serif text-xl font-semibold text-[#2a241a]">Name, rate and inventory</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Room name" name="title" required />
            <Field label="Slug" name="slug" required />
            <Field label="Base rate (UGX)" name="price_ugx" type="number" required />
            <Field label="Inventory count" name="inventory_count" type="number" required defaultValue={1} />
            <Field label="Sort order" name="sort_order" type="number" required defaultValue={0} />
            <Field label="Cover image URL (optional)" name="cover_image_url" />
          </div>
          <label className="inline-flex items-center gap-3 text-sm font-semibold text-[#2a241a]">
            <input type="checkbox" name="is_published" className="h-4 w-4 accent-oliveMuted-600" />
            Publish immediately
          </label>
        </section>

        <section className="grid gap-4 rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_16px_38px_rgba(55,43,30,0.07)] sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">Guest-facing content</p>
          <Area label="Short description" name="description" rows={3} />
          <Area label="Overview" name="overview" rows={6} />
          <div className="grid gap-4 md:grid-cols-2">
            <Area label="Key details (one per line)" name="details" />
            <Area label="Amenities (one per line)" name="amenities" />
          </div>
          <Area label="Dining hours or inclusions (one per line)" name="dining_hours" rows={4} />
        </section>

        <div className="flex justify-end">
          <button type="submit" className="rounded-[17px] bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light shadow-[0_12px_26px_rgba(82,88,69,0.22)] transition hover:bg-oliveMuted-500">
            Create Room Type
          </button>
        </div>
      </form>
    </section>
  );
}
