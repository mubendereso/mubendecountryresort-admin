"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import {
  createCompanyAccountAction,
  updateCompanyAccountAction
} from "@/lib/companies/actions";
import type { CompanyAccount } from "@/lib/companies/types";

const FIELD_CLASS =
  "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500";

export function CompanyForm({ company }: { company?: CompanyAccount }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = company
        ? await updateCompanyAccountAction(formData)
        : await createCompanyAccountAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/companies/${result.companyId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      {company && <input type="hidden" name="companyId" value={company.id} />}
      {error && (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      <div className="surface-card grid gap-4 p-5 sm:p-6">
        <div className="grid gap-1.5">
          <label htmlFor="companyName" className={LABEL_CLASS}>
            Company name
          </label>
          <input
            id="companyName"
            name="companyName"
            defaultValue={company?.company_name ?? ""}
            className={FIELD_CLASS}
            required
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <label htmlFor="contactName" className={LABEL_CLASS}>
              Contact person
            </label>
            <input id="contactName" name="contactName" defaultValue={company?.contact_name ?? ""} className={FIELD_CLASS} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="contactEmail" className={LABEL_CLASS}>
              Billing email
            </label>
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={company?.contact_email ?? ""} className={FIELD_CLASS} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="contactPhone" className={LABEL_CLASS}>
              Billing phone
            </label>
            <input id="contactPhone" name="contactPhone" defaultValue={company?.contact_phone ?? ""} className={FIELD_CLASS} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <label htmlFor="paymentTermsDays" className={LABEL_CLASS}>
              Terms days
            </label>
            <input
              id="paymentTermsDays"
              name="paymentTermsDays"
              type="number"
              min={0}
              defaultValue={company?.payment_terms_days ?? 14}
              className={FIELD_CLASS}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="creditLimitUgx" className={LABEL_CLASS}>
              Credit limit
            </label>
            <UgxAmountInput
              id="creditLimitUgx"
              name="creditLimitUgx"
              defaultValue={company?.credit_limit_ugx ?? 0}
              placeholder="0"
              className={FIELD_CLASS}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="taxId" className={LABEL_CLASS}>
              Tax ID / TIN
            </label>
            <input id="taxId" name="taxId" defaultValue={company?.tax_id ?? ""} className={FIELD_CLASS} />
          </div>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="billingAddress" className={LABEL_CLASS}>
            Billing address
          </label>
          <textarea
            id="billingAddress"
            name="billingAddress"
            rows={3}
            defaultValue={company?.billing_address ?? ""}
            className={FIELD_CLASS}
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="notes" className={LABEL_CLASS}>
            Notes
          </label>
          <textarea id="notes" name="notes" rows={4} defaultValue={company?.notes ?? ""} className={FIELD_CLASS} />
        </div>

        <div>
          <input type="hidden" name="isActive" value="false" />
          <label className="flex items-center gap-3 text-sm font-semibold text-oliveMuted-700">
            <input
              type="checkbox"
              name="isActive"
              value="true"
              defaultChecked={company?.is_active ?? true}
              className="h-4 w-4 rounded border-stoneWarm-300 text-oliveMuted-600"
            />
            Active company account
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-oliveMuted-600">
          Company accounts are billing profiles for group statements and accounts receivable.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(company ? `/companies/${company.id}` : "/companies")}
            className="rounded-2xl border border-stoneWarm-200 px-5 py-3 text-sm font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-2xl bg-oliveMuted-600 px-6 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving..." : company ? "Save company" : "Create company"}
          </button>
        </div>
      </div>
    </form>
  );
}
