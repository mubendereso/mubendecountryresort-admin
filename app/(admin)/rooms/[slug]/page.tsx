import Link from "next/link";
import { notFound } from "next/navigation";
import { updateRoomTypeAction, uploadRoomCoverAction } from "@/lib/rooms/actions";
import { getRoomTypeBySlug } from "@/lib/rooms/data";
import { listToTextarea } from "@/lib/rooms/format";

function getFirstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  required = false
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <input
        className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm font-normal"
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
      />
    </label>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
  rows = 4
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <textarea
        className="resize-y rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm font-normal leading-6"
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
      />
    </label>
  );
}

export default async function EditRoomTypePage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const room = await getRoomTypeBySlug(slug);
  const message = getFirstValue(query.message);

  if (!room) {
    notFound();
  }

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link className="text-sm font-semibold text-oliveMuted-600 hover:underline" href="/rooms">
            Back to rooms
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">{room.title}</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">{room.slug}</p>
        </div>
        <Link
          href={`/availability?roomTypeId=${room.id}`}
          className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
        >
          Check availability
        </Link>
      </header>

      {message ? (
        <div className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm text-oliveMuted-600">
          {message}
        </div>
      ) : null}

      <form action={updateRoomTypeAction} className="grid gap-5">
        <input type="hidden" name="id" value={room.id} />
        <input type="hidden" name="slug" value={room.slug} />

        <section className="surface-card grid gap-4 p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Core</p>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Title" name="title" defaultValue={room.title} required />
            <TextField
              label="Price UGX"
              name="price_ugx"
              type="number"
              defaultValue={room.price_ugx}
              required
            />
            <TextField
              label="Inventory count"
              name="inventory_count"
              type="number"
              defaultValue={room.inventory_count}
              required
            />
            <TextField
              label="Sort order"
              name="sort_order"
              type="number"
              defaultValue={room.sort_order}
              required
            />
          </div>
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input
              className="h-4 w-4 accent-oliveMuted-600"
              type="checkbox"
              name="is_published"
              defaultChecked={room.is_published}
            />
            Published
          </label>
        </section>

        <section className="surface-card grid gap-4 p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Copy</p>
          <TextAreaField label="Short description" name="description" defaultValue={room.description} />
          <TextAreaField label="Overview" name="overview" defaultValue={room.overview} rows={6} />
          <TextField label="Cover image URL" name="cover_image_url" defaultValue={room.cover_image_url} />
        </section>

        <section className="surface-card grid gap-4 p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Lists</p>
          <div className="grid gap-4 md:grid-cols-2">
            <TextAreaField label="Details" name="details" defaultValue={listToTextarea(room.details)} rows={7} />
            <TextAreaField
              label="Amenities"
              name="amenities"
              defaultValue={listToTextarea(room.amenities)}
              rows={7}
            />
            <TextAreaField
              label="Dining hours"
              name="dining_hours"
              defaultValue={listToTextarea(room.dining_hours)}
              rows={5}
            />
            <TextAreaField
              label="Gallery image URLs"
              name="gallery"
              defaultValue={listToTextarea(room.gallery)}
              rows={5}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-2xl bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
          >
            Save room type
          </button>
        </div>
      </form>

      <section className="surface-card grid gap-4 p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Cover image upload</p>
        {room.cover_image_url ? (
          <img
            src={room.cover_image_url}
            alt={`${room.title} cover`}
            className="h-40 w-full max-w-md rounded-2xl object-cover"
          />
        ) : (
          <p className="text-sm text-oliveMuted-600">No cover image set yet.</p>
        )}
        <form action={uploadRoomCoverAction} className="grid gap-3">
          <input type="hidden" name="id" value={room.id} />
          <input type="hidden" name="slug" value={room.slug} />
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/avif"
            required
            className="text-sm"
          />
          <p className="text-xs text-oliveMuted-600">JPEG, PNG, WebP, or AVIF. Max 4MB.</p>
          <div>
            <button
              type="submit"
              className="rounded-2xl bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
            >
              Upload cover image
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
