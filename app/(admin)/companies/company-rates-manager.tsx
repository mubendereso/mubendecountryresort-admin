"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import { archiveCompanyRoomRateAction, saveCompanyRoomRateAction } from "@/lib/companies/actions";
import type { CompanyRoomRate } from "@/lib/companies/types";

type RoomOption = { id: string; title: string; publicRateUgx: number };

export function CompanyRatesManager({ companyId, rates, rooms, canManage }: { companyId: string; rates: CompanyRoomRate[]; rooms: RoomOption[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CompanyRoomRate | null>(null);
  const [rateUgx, setRateUgx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEditing(null);
    setRateUgx(0);
    setError(null);
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">Negotiated rates</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#2a241a]">Corporate room rates</h2>
        </div>
        <p className="text-sm text-oliveMuted-500">{rates.filter((rate) => rate.status === "active").length} active</p>
      </div>

      {canManage && (
        <form
          key={editing?.id ?? "new"}
          className="surface-card grid gap-3 p-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await saveCompanyRoomRateAction(formData);
              if (!result.ok) setError(result.error);
              else { reset(); router.refresh(); }
            });
          }}
        >
          <input type="hidden" name="companyId" value={companyId} />
          {editing && <input type="hidden" name="rateId" value={editing.id} />}
          <label className="grid gap-1 text-xs font-semibold text-oliveMuted-600">Room type
            <select name="roomTypeId" defaultValue={editing?.room_type_id ?? ""} required className="rounded-xl border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm font-normal">
              <option value="" disabled>Select room type</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.title} - public UGX {room.publicRateUgx.toLocaleString("en-UG")}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-oliveMuted-600">Nightly rate (UGX)
            <UgxAmountInput name="rateUgx" value={rateUgx || editing?.rate_ugx || 0} onValueChange={(value) => { setRateUgx(value); if (editing) setEditing({ ...editing, rate_ugx: value }); }} required className="rounded-xl border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm font-normal" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-oliveMuted-600">Valid from
            <input type="date" name="validFrom" defaultValue={editing?.valid_from ?? new Date().toISOString().slice(0, 10)} required className="rounded-xl border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm font-normal" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-oliveMuted-600">Valid to
            <input type="date" name="validTo" defaultValue={editing?.valid_to ?? ""} className="rounded-xl border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm font-normal" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-oliveMuted-600 md:col-span-2">Notes
            <input name="notes" defaultValue={editing?.notes ?? ""} maxLength={500} className="rounded-xl border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm font-normal" />
          </label>
          {error && <p className="text-sm text-red-700 md:col-span-2">{error}</p>}
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={isPending} className="rounded-xl bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : editing ? "Update rate" : "Add rate"}</button>
            {editing && <button type="button" onClick={reset} className="rounded-xl border border-stoneWarm-200 px-4 py-2 text-sm font-semibold">Cancel</button>}
          </div>
        </form>
      )}

      <div className="surface-card divide-y divide-stoneWarm-200 p-0">
        {rates.length === 0 ? <p className="px-5 py-8 text-sm text-oliveMuted-600">No negotiated room rates yet.</p> : rates.map((rate) => (
          <div key={rate.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-semibold text-[#2a241a]">{rate.room_type_title} - UGX {rate.rate_ugx.toLocaleString("en-UG")} nightly</p>
              <p className="mt-1 text-xs text-oliveMuted-500">{rate.valid_from} to {rate.valid_to ?? "open ended"} - {rate.status} - discount UGX {Math.max(0, rate.public_rate_ugx - rate.rate_ugx).toLocaleString("en-UG")}</p>
            </div>
            {canManage && rate.status === "active" && <div className="flex gap-2">
              <button type="button" onClick={() => { setEditing(rate); setRateUgx(rate.rate_ugx); }} className="rounded-xl border border-stoneWarm-200 px-3 py-2 text-xs font-semibold">Edit</button>
              <form action={archiveCompanyRoomRateAction}><input type="hidden" name="companyId" value={companyId} /><input type="hidden" name="rateId" value={rate.id} /><button type="submit" className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Archive</button></form>
            </div>}
          </div>
        ))}
      </div>
    </section>
  );
}
