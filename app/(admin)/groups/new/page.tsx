import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { GroupCreateForm } from "../group-create-form";

export default async function NewGroupPage() {
  await requireApprovedAdminRole();

  return (
    <section className="grid gap-7">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-bronze-400/15" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-44 w-44 rounded-full border border-oliveMuted-400/10" />
        <div className="relative max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
            Group bookings
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
            New group
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
            Create an umbrella record for a trip, reunion, corporate visit, or any set of bookings that should be tracked together.
          </p>
        </div>
      </header>

      <GroupCreateForm />
    </section>
  );
}

