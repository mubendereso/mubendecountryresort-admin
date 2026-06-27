"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBookingCompanyAccountAction } from "@/lib/companies/actions";
import type { CompanySelectOption } from "@/lib/companies/types";

export function BookingCompanyPayerForm({
  bookingId,
  groupId,
  currentCompanyId,
  companies,
  role,
  balanceDueUgx
}: {
  bookingId: string;
  groupId: string | null;
  currentCompanyId: string | null;
  companies: CompanySelectOption[];
  role: "staff" | "admin" | "superadmin";
  balanceDueUgx: number;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(currentCompanyId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = companies.find((company) => company.id === companyId) ?? null;
  const needsOverride = Boolean(selected && (
    selected.credit_status === "overdue" ||
    selected.credit_status === "over_limit" ||
    balanceDueUgx > selected.available_credit_ugx
  ));

  if (groupId) {
    return <p className="text-sm text-oliveMuted-600">Company payer is inherited from the reservation group.</p>;
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await setBookingCompanyAccountAction(formData);
          if (!result.ok) setError(result.error);
          else router.refresh();
        });
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <select name="companyId" value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm">
        <option value="">Guest paid</option>
        {companies.map((company) => (
          <option key={company.id} value={company.id} disabled={!company.is_active || company.is_suspended}>
            {company.company_name}{!company.is_active ? " (inactive)" : company.is_suspended ? " (suspended)" : ""}
          </option>
        ))}
      </select>
      {selected && selected.credit_status !== "clear" && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Credit status {selected.credit_status.replace("_", " ")}; available credit UGX {selected.available_credit_ugx.toLocaleString("en-UG")}.
        </p>
      )}
      {needsOverride && role !== "staff" && (
        <textarea name="creditOverrideReason" minLength={5} maxLength={500} required rows={2} placeholder="Required credit override reason" className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm" />
      )}
      {needsOverride && role === "staff" && <p className="text-xs font-medium text-red-700">Admin approval is required.</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={isPending || (needsOverride && role === "staff")} className="w-fit rounded-2xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {isPending ? "Updating..." : "Update payer"}
      </button>
    </form>
  );
}
