import Link from "next/link";
import { getAvailabilityForRoomType, getRoomTypes } from "@/lib/rooms/data";

function getFirstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function isDateValue(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export default async function AvailabilityPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [allRooms, query] = await Promise.all([getRoomTypes(), searchParams]);
  const rooms = allRooms.filter((room) => !room.archived_at);
  const checkIn = getFirstValue(query.checkIn);
  const checkOut = getFirstValue(query.checkOut);
  const roomTypeId = getFirstValue(query.roomTypeId) ?? rooms[0]?.id;
  const hasValidDates = isDateValue(checkIn) && isDateValue(checkOut) && checkOut! > checkIn!;
  const selectedRoom = rooms.find((room) => room.id === roomTypeId) ?? rooms[0] ?? null;
  const availabilityRows = hasValidDates
    ? await Promise.all(
        rooms.map(async (room) => {
          const availability = await getAvailabilityForRoomType(room.id, checkIn!, checkOut!);
          return { room, ...availability };
        })
      )
    : [];
  const selectedAvailability =
    hasValidDates && selectedRoom
      ? availabilityRows.find((row) => row.room.id === selectedRoom.id) ?? null
      : null;

  return (
    <section className="grid gap-6">
      <header>
        <h1 className="text-3xl font-semibold">Availability</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-oliveMuted-600">
          Check live room availability for a date window. Confirmed stays, unexpired payment
          holds, active group room blocks, and out-of-order units are counted together so the
          sellable count stays operational.
        </p>
      </header>

      <form className="surface-card grid gap-4 p-5 md:grid-cols-[1fr_1fr_1fr_auto]" method="get">
        <label className="grid gap-2 text-sm font-semibold">
          Room type
          <select
            className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm font-normal"
            name="roomTypeId"
            defaultValue={selectedRoom?.id}
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Check-in
          <input
            className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm font-normal"
            name="checkIn"
            type="date"
            defaultValue={checkIn ?? ""}
            required
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Check-out
          <input
            className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm font-normal"
            name="checkOut"
            type="date"
            defaultValue={checkOut ?? ""}
            required
          />
        </label>
        <div className="flex items-end">
          <button
            className="w-full rounded-2xl bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
            type="submit"
          >
            Check
          </button>
        </div>
      </form>

      {checkIn && checkOut && !hasValidDates ? (
        <div className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm text-oliveMuted-600">
          Choose a valid date window where check-out is after check-in.
        </div>
      ) : null}

      {hasValidDates ? (
        <div className="grid gap-5">
          <section className="surface-card overflow-hidden">
            <div className="border-b border-stoneWarm-200 bg-stoneWarm-100 px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-oliveMuted-600">
                {checkIn} to {checkOut}
              </p>
            </div>
            <div className="divide-y divide-stoneWarm-200">
              {availabilityRows.map((row) => (
                <article
                  key={row.room.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[1.6fr_0.7fr_0.7fr_0.5fr] md:items-center"
                >
                  <div>
                    <h2 className="font-semibold">{row.room.title}</h2>
                    <p className="mt-1 text-xs text-oliveMuted-600">{row.room.slug}</p>
                  </div>
                  <p className="text-sm">
                    <span className="font-semibold">{row.unitsAvailable}</span> available
                  </p>
                  <p className="text-sm text-oliveMuted-600">{row.bookings.length} live holds</p>
                  <Link
                    href={`/rooms/${row.room.slug}`}
                    className="text-sm font-semibold text-oliveMuted-600 hover:underline md:text-right"
                  >
                    Edit
                  </Link>
                </article>
              ))}
            </div>
          </section>

          {selectedAvailability ? (
            <section className="surface-card overflow-hidden">
              <div className="border-b border-stoneWarm-200 bg-white px-5 py-4">
                <h2 className="text-xl font-semibold">{selectedRoom?.title}</h2>
                <p className="mt-1 text-sm text-oliveMuted-600">Live bookings and payment holds</p>
              </div>
              {selectedAvailability.bookings.length > 0 ? (
                <div className="divide-y divide-stoneWarm-200">
                  {selectedAvailability.bookings.map((booking) => (
                    <article
                      key={booking.reference}
                      className="grid gap-2 px-5 py-4 md:grid-cols-[1fr_1fr_1fr_0.8fr] md:items-center"
                    >
                      <p className="font-semibold">{booking.reference}</p>
                      <p className="text-sm text-oliveMuted-600">{booking.guest_full_name}</p>
                      <p className="text-sm">
                        {booking.check_in} to {booking.check_out}
                      </p>
                      <p className="text-sm capitalize text-oliveMuted-600">
                        {booking.status.replaceAll("_", " ")}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-6 text-sm text-oliveMuted-600">
                  No live bookings or unexpired payment holds for this room type.
                </p>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
