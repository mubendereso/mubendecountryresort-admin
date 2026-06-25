"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import { recordCompanyPaymentAction } from "@/lib/companies/actions";

const FIELD_CLASS =
  "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

export function CompanyPaymentForm({
  companyId,
  openInvoiceBalanceUgx,
  canRecord
}: {
  companyId: string;
  openInvoiceBalanceUgx: number;
  canRecord: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await recordCompanyPaymentAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      formRef.current?.reset();
      setMessage(
        `Allocated ${fmtUgx(result.allocatedAmountUgx)} across ${result.allocationCount} invoice${result.allocationCount === 1 ? "" : "s"}.`
      );
      router.refresh();
    });
  }

  if (!canRecord) {
    return (
      <div className="surface-card px-6 py-8 text-sm text-oliveMuted-600">
        Staff can view company AR, but only admin and superadmin users can record company payments.
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="surface-card grid gap-4 p-5 sm:p-6">
      <input type="hidden" name="companyId" value={companyId} />
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
          Company payment
        </p>
        <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
          Allocate to issued invoices
        </h2>
        <p className="mt-2 text-sm text-oliveMuted-600">
          Current issued invoice AR: {fmtUgx(openInvoiceBalanceUgx)}
        </p>
      </div>

      {error && (
        <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-[18px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-1.5">
          <label htmlFor="amountUgx" className={LABEL_CLASS}>
            Amount received
          </label>
          <UgxAmountInput
            id="amountUgx"
            name="amountUgx"
            placeholder="0"
            className={FIELD_CLASS}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="method" className={LABEL_CLASS}>
            Method
          </label>
          <select id="method" name="method" className={FIELD_CLASS} defaultValue="transfer">
            <option value="transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="card">Card</option>
            <option value="pesapal_manual">Pesapal verified</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="reference" className={LABEL_CLASS}>
            Reference
          </label>
          <input id="reference" name="reference" className={FIELD_CLASS} placeholder="Transaction / bank reference" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor="note" className={LABEL_CLASS}>
          Note
        </label>
        <textarea id="note" name="note" rows={3} className={FIELD_CLASS} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-oliveMuted-600">
          Payments are allocated oldest issued invoice first and create ordinary folio payments underneath.
        </p>
        <button
          type="submit"
          disabled={isPending || openInvoiceBalanceUgx <= 0}
          className="rounded-2xl bg-oliveMuted-600 px-6 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Recording..." : "Record payment"}
        </button>
      </div>
    </form>
  );
}
