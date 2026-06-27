"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadLocalWorkOrders, refreshMaintenanceFromServer, seedMaintenanceCache } from "@/lib/maintenance/offline";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES, type MaintenanceRoomOption, type MaintenanceStaffOption, type MaintenanceWorkOrder } from "@/lib/maintenance/types";

function label(value: string): string { return value.replaceAll("_", " "); }
function formatDate(value: string): string { return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(new Date(value)); }

const priorityTone: Record<string, string> = { low: "bg-stoneWarm-100 text-oliveMuted-600", normal: "bg-blue-50 text-blue-700", high: "bg-amber-100 text-amber-800", urgent: "bg-red-100 text-red-700" };
const statusTone: Record<string, string> = { open: "bg-blue-50 text-blue-700", assigned: "bg-violet-50 text-violet-700", in_progress: "bg-amber-100 text-amber-800", waiting_parts: "bg-orange-100 text-orange-800", on_hold: "bg-stoneWarm-100 text-oliveMuted-600", completed: "bg-green-100 text-green-700", cancelled: "bg-red-50 text-red-700" };

export function MaintenanceClient({ initialWorkOrders, rooms, staff, session }: {
  initialWorkOrders: MaintenanceWorkOrder[];
  rooms: MaintenanceRoomOption[];
  staff: MaintenanceStaffOption[];
  session: { userId: string; email: string | null; role: "staff" | "admin" | "superadmin" };
}) {
  const [orders, setOrders] = useState(initialWorkOrders);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        await seedMaintenanceCache({ workOrders: initialWorkOrders, rooms, staff, currentUser: { id: session.userId, email: session.email, role: session.role } });
        await refreshMaintenanceFromServer();
        if (!cancelled) setOrders(await loadLocalWorkOrders());
      } catch (error) {
        if (!cancelled) setSyncMessage(error instanceof Error ? error.message : "Maintenance sync failed.");
      }
    }
    hydrate();
    window.addEventListener("online", hydrate);
    window.addEventListener("focus", hydrate);
    return () => { cancelled = true; window.removeEventListener("online", hydrate); window.removeEventListener("focus", hydrate); };
  }, [initialWorkOrders, rooms, staff]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (status && order.status !== status) return false;
      if (priority && order.priority !== priority) return false;
      if (category && order.category !== category) return false;
      if (assignedTo && order.assigned_to !== assignedTo) return false;
      if (needle && ![order.work_order_number, order.title, order.room_unit_name].some((value) => value?.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [orders, search, status, priority, category, assignedTo]);

  const counts = orders.reduce((acc, order) => { acc[order.status] = (acc[order.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <section className="grid gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stoneWarm-200 pb-6">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bronze-500">Operations</p><h1 className="mt-2 text-3xl font-semibold">Maintenance Work Orders</h1><p className="mt-2 text-sm text-oliveMuted-600">Faults, repairs, responsibility, vendors, and costs. Tickets do not change room availability.</p></div>
        <Link href="/maintenance/new" className="rounded-md bg-oliveMuted-600 px-4 py-2.5 text-sm font-semibold text-white">Create work order</Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <Summary label="Open" value={(counts.open ?? 0) + (counts.assigned ?? 0)} />
        <Summary label="In progress" value={counts.in_progress ?? 0} />
        <Summary label="Waiting / hold" value={(counts.waiting_parts ?? 0) + (counts.on_hold ?? 0)} />
        <Summary label="Completed" value={counts.completed ?? 0} />
      </div>

      <section className="grid gap-3 border-y border-stoneWarm-200 py-4 lg:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(130px,1fr))]">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search number, room, or title" className="rounded-md border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm" />
        <Filter value={status} onChange={setStatus} label="All statuses" values={MAINTENANCE_STATUSES} />
        <Filter value={priority} onChange={setPriority} label="All priorities" values={MAINTENANCE_PRIORITIES} />
        <Filter value={category} onChange={setCategory} label="All categories" values={MAINTENANCE_CATEGORIES} />
        <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="rounded-md border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm"><option value="">All assignees</option><option value={session.userId}>Assigned to me</option>{staff.filter((person) => person.id !== session.userId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
      </section>

      {syncMessage && <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{syncMessage}</p>}
      <div className="overflow-x-auto border border-stoneWarm-200 bg-white">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="bg-stoneWarm-100 text-[11px] uppercase tracking-[0.12em] text-oliveMuted-500"><tr><th className="px-4 py-3">Work order</th><th className="px-4 py-3">Room</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Assigned to</th><th className="px-4 py-3">Reported</th></tr></thead>
          <tbody className="divide-y divide-stoneWarm-100">
            {filtered.map((order) => <tr key={order.id} className="hover:bg-stoneWarm-50"><td className="px-4 py-4"><Link href={`/maintenance/${order.id}`} className="font-mono text-xs font-semibold text-oliveMuted-700 hover:underline">{order.work_order_number}</Link><p className="mt-1 max-w-72 truncate font-semibold text-[#2a241a]">{order.title}</p></td><td className="px-4 py-4">{order.room_unit_name ?? "General property"}</td><td className="px-4 py-4 capitalize">{label(order.category)}</td><td className="px-4 py-4"><Badge text={label(order.priority)} tone={priorityTone[order.priority]} /></td><td className="px-4 py-4"><Badge text={label(order.status)} tone={statusTone[order.status]} /></td><td className="px-4 py-4">{order.assigned_to_name ?? order.assigned_to_email ?? "Unassigned"}</td><td className="px-4 py-4 text-oliveMuted-600">{formatDate(order.reported_at)}</td></tr>)}
            {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-oliveMuted-600">No work orders match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="border-l-2 border-bronze-400 bg-white px-4 py-3"><p className="text-xs text-oliveMuted-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
function Badge({ text, tone }: { text: string; tone: string }) { return <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${tone}`}>{text}</span>; }
function Filter({ value, onChange, label: emptyLabel, values }: { value: string; onChange: (value: string) => void; label: string; values: readonly string[] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm"><option value="">{emptyLabel}</option>{values.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>; }
