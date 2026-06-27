"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import { createLocalMaintenance, refreshMaintenanceFromServer, seedMaintenanceCache } from "@/lib/maintenance/offline";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, type MaintenanceRoomOption, type MaintenanceStaffOption } from "@/lib/maintenance/types";

const field = "w-full rounded-md border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm";
const labelClass = "text-[11px] font-semibold uppercase tracking-[0.14em] text-oliveMuted-500";
function nullable(value: FormDataEntryValue | null): string | null { const text = String(value ?? "").trim(); return text || null; }
function isoDateTime(value: FormDataEntryValue | null): string | null { const text = nullable(value); return text ? new Date(text).toISOString() : null; }

export function MaintenanceCreateForm({ rooms, staff, session }: { rooms: MaintenanceRoomOption[]; staff: MaintenanceStaffOption[]; session: { userId: string; email: string | null; role: "staff" | "admin" | "superadmin" } }) {
  const router = useRouter();
  const manager = session.role !== "staff";
  const [roomId, setRoomId] = useState("");
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return <section className="mx-auto grid max-w-4xl gap-6">
    <header className="flex items-end justify-between gap-4 border-b border-stoneWarm-200 pb-5"><div><p className={labelClass}>Maintenance</p><h1 className="mt-2 text-3xl font-semibold">Create Work Order</h1><p className="mt-2 text-sm text-oliveMuted-600">Report the fault without changing room availability.</p></div><Link href="/maintenance" className="rounded-md border border-stoneWarm-200 px-4 py-2 text-sm font-semibold">Cancel</Link></header>
    <form onSubmit={(event) => { event.preventDefault(); setError(null); const formData = new FormData(event.currentTarget); startTransition(async () => { try {
      const selectedRoom = rooms.find((room) => room.id === roomId) ?? null;
      const id = crypto.randomUUID();
      await seedMaintenanceCache({ workOrders: [], rooms, staff, currentUser: { id: session.userId, email: session.email, role: session.role } });
      await createLocalMaintenance({ id, actorId: session.userId, roomUnitId: selectedRoom?.id ?? null, roomTypeId: selectedRoom?.room_type_id ?? null, assignedTo: manager ? nullable(formData.get("assignedTo")) : null, externalVendorName: manager ? nullable(formData.get("externalVendorName")) : null, category: String(formData.get("category")), priority: String(formData.get("priority")), title: String(formData.get("title") ?? "").trim(), description: String(formData.get("description") ?? "").trim(), scheduledFor: manager ? isoDateTime(formData.get("scheduledFor")) : null, expectedReturnAt: manager ? isoDateTime(formData.get("expectedReturnAt")) : null, estimatedCostUgx: manager && estimatedCost > 0 ? estimatedCost : null });
      if (navigator.onLine) { await refreshMaintenanceFromServer(); router.push(`/maintenance/${id}`); } else router.push("/offline?tab=maintenance");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create work order."); } }); }} className="grid gap-5">
      <section className="grid gap-4 border-b border-stoneWarm-200 pb-5 sm:grid-cols-2"><Field label="Title"><input name="title" minLength={3} maxLength={180} required className={field} /></Field><Field label="Room"><select name="roomUnitId" value={roomId} onChange={(event) => setRoomId(event.target.value)} className={field}><option value="">General property maintenance</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.room_type_title} - {room.unit_name}</option>)}</select></Field><Field label="Category"><select name="category" defaultValue="other" className={field}>{MAINTENANCE_CATEGORIES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></Field><Field label="Priority"><select name="priority" defaultValue="normal" className={field}>{MAINTENANCE_PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Description"><textarea name="description" minLength={5} maxLength={5000} rows={5} required className={field} /></Field></div></section>
      {manager && <section className="grid gap-4 border-b border-stoneWarm-200 pb-5 sm:grid-cols-2"><Field label="Assign to"><select name="assignedTo" className={field}><option value="">Unassigned</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field><Field label="External vendor"><input name="externalVendorName" maxLength={500} className={field} /></Field><Field label="Scheduled for"><input name="scheduledFor" type="datetime-local" className={field} /></Field><Field label="Expected return"><input name="expectedReturnAt" type="datetime-local" className={field} /></Field><Field label="Estimated cost (UGX)"><UgxAmountInput name="estimatedCostUgx" value={estimatedCost} onValueChange={setEstimatedCost} className={field} /></Field></section>}
      <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">Creating this work order will not mark the room out of order or alter sellable inventory.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={isPending} className="w-fit rounded-md bg-oliveMuted-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : "Create work order"}</button>
    </form>
  </section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5"><span className={labelClass}>{label}</span>{children}</label>; }
