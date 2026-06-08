import Link from "next/link";
import { redirect } from "next/navigation";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { bulkUpdateRoomRatesAction } from "@/lib/rooms/actions";
import { getRoomTypes } from "@/lib/rooms/data";
import { formatUgx } from "@/lib/rooms/format";

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BulkRatesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, rooms, query] = await Promise.all([
    requireApprovedAdminRole(),
    getRoomTypes(),
    searchParams
  ]);
  if (session.role === "staff") redirect("/rooms");
  const message = first(query.message);
  const activeRooms = rooms.filter((room) => !room.archived_at);

  return (
    <section className="grid gap-6">
      <header className="rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] to-stoneWarm-100/55 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-8">
        <Link href="/rooms" className="text-sm font-semibold text-oliveMuted-600 hover:underline">Back to rooms</Link>
        <h1 className="mt-5 font-serif text-3xl font-semibold text-[#2a241a]">Bulk Update Rates</h1>
        <p className="mt-3 text-sm text-oliveMuted-600">Review and update base rates across the active room portfolio.</p>
      </header>
      {message && <div className="rounded-[18px] border border-[#a4635b]/25 bg-[#a4635b]/10 px-4 py-3 text-sm text-[#8b4d46]">{message}</div>}
      <form action={bulkUpdateRoomRatesAction} className="grid gap-4">
        {activeRooms.map((room) => (
          <label key={room.id} className="flex flex-col gap-3 rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_10px_24px_rgba(55,43,30,0.05)] sm:flex-row sm:items-center sm:justify-between">
            <span>
              <span className="block font-serif text-lg font-semibold text-[#2a241a]">{room.title}</span>
              <span className="mt-1 block text-xs text-oliveMuted-500">Current: {formatUgx(Number(room.price_ugx))}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-xs font-semibold text-oliveMuted-500">UGX</span>
              <UgxAmountInput
                name={`rate_${room.id}`}
                required
                defaultValue={Number(room.price_ugx)}
                className="w-full rounded-[15px] border border-stoneWarm-200 bg-white/75 px-4 py-2.5 text-sm outline-none focus:border-oliveMuted-400 sm:w-48"
              />
            </span>
          </label>
        ))}
        <div className="flex justify-end">
          <button type="submit" className="rounded-[17px] bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light shadow-[0_12px_26px_rgba(82,88,69,0.22)]">
            Save All Rates
          </button>
        </div>
      </form>
    </section>
  );
}
