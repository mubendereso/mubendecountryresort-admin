import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { importRoomTypesAction } from "@/lib/rooms/actions";

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

const SAMPLE = `slug,title,price_ugx,inventory_count,is_published,description
garden-suite,Garden Suite,480000,2,false,"Quiet suite overlooking the gardens"`;

export default async function ImportRoomsPage({
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
        <h1 className="mt-5 font-serif text-3xl font-semibold text-[#2a241a]">Import Room Types</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-oliveMuted-600">
          Paste CSV data to create up to 100 room products. Existing slugs are skipped, and imported photos can be added afterward.
        </p>
      </header>
      {message && <div className="rounded-[18px] border border-[#a4635b]/25 bg-[#a4635b]/10 px-4 py-3 text-sm text-[#8b4d46]">{message}</div>}
      <form action={importRoomTypesAction} className="grid gap-5 rounded-[26px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_16px_38px_rgba(55,43,30,0.07)] sm:p-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Required column order</p>
          <p className="mt-2 font-mono text-xs leading-6 text-oliveMuted-600">slug, title, price_ugx, inventory_count, is_published, description</p>
        </div>
        <textarea
          name="csv"
          required
          rows={12}
          defaultValue={SAMPLE}
          className="resize-y rounded-[18px] border border-stoneWarm-200 bg-white/75 p-4 font-mono text-xs leading-6 outline-none focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-400/10"
        />
        <div className="flex justify-end">
          <button type="submit" className="rounded-[17px] bg-oliveMuted-600 px-5 py-3 text-sm font-semibold text-canvas-light shadow-[0_12px_26px_rgba(82,88,69,0.22)]">
            Import Room Types
          </button>
        </div>
      </form>
    </section>
  );
}
