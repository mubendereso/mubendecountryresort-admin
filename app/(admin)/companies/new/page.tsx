import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { CompanyForm } from "../company-form";

export default async function NewCompanyPage() {
  await requireApprovedAdminRole();

  return (
    <section className="grid gap-7">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="relative max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
            Accounts receivable
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
            New company
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
            Create a billing account that can be attached to group stays and statements.
          </p>
        </div>
      </header>

      <CompanyForm />
    </section>
  );
}
