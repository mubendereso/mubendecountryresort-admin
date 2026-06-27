"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { UgxAmountInput } from "@/components/ugx-amount-input";
import { shrinkImage } from "@/lib/images/shrink-image";
import { getLocalDb } from "@/lib/local-db/client";
import { addLocalActivity, loadLocalMaintenanceDetail, queueMaintenanceMutation, queueMaintenancePhoto, refreshMaintenanceFromServer, seedMaintenanceCache } from "@/lib/maintenance/offline";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, type MaintenanceDetail, type MaintenanceRoomOption, type MaintenanceStaffOption, type MaintenanceStatus } from "@/lib/maintenance/types";

const field = "w-full rounded-md border border-stoneWarm-200 bg-white px-3 py-2.5 text-sm";
function label(value: string): string { return value.replaceAll("_", " "); }
function fmtUgx(value: number | null): string { return value === null ? "Not recorded" : `UGX ${value.toLocaleString("en-UG")}`; }
function fmtDate(value: string | null): string { if (!value) return "Not set"; return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(value)); }
function toLocalInput(value: string | null): string { if (!value) return ""; const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function readMoney(value: FormDataEntryValue | null): number | null { const normalized = String(value ?? "").replace(/[,\s]/g, ""); return normalized ? Number(normalized) : null; }

export function MaintenanceDetailClient({ workOrderId, initialDetail, rooms, staff, session }: {
  workOrderId: string; initialDetail: MaintenanceDetail | null; rooms: MaintenanceRoomOption[]; staff: MaintenanceStaffOption[];
  session: { userId: string; email: string | null; role: "staff" | "admin" | "superadmin" };
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [error, setError] = useState<string | null>(null);
  const [actualCost, setActualCost] = useState(initialDetail?.workOrder.actual_cost_ugx ?? 0);
  const [estimatedCost, setEstimatedCost] = useState(initialDetail?.workOrder.estimated_cost_ugx ?? 0);
  const [isPending, startTransition] = useTransition();
  const manager = session.role !== "staff";

  async function reloadLocal() { setDetail(await loadLocalMaintenanceDetail(workOrderId)); }
  async function reconcile() { if (navigator.onLine) await refreshMaintenanceFromServer(); await reloadLocal(); }

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        await seedMaintenanceCache({ workOrders: initialDetail ? [initialDetail.workOrder] : [], activity: initialDetail?.activity, photos: initialDetail?.photos, rooms, staff, currentUser: { id: session.userId, email: session.email, role: session.role } });
        if (navigator.onLine) await refreshMaintenanceFromServer();
        if (!cancelled) setDetail(await loadLocalMaintenanceDetail(workOrderId));
      } catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Maintenance sync failed."); }
    }
    hydrate(); window.addEventListener("online", hydrate);
    return () => { cancelled = true; window.removeEventListener("online", hydrate); };
  }, [initialDetail, rooms, staff, workOrderId]);

  if (!detail) return <section className="grid gap-4"><Link href="/maintenance" className="text-sm hover:underline">Back to work orders</Link><div className="border border-dashed border-stoneWarm-300 p-8 text-sm text-oliveMuted-600">This work order is not available in the local cache.</div></section>;
  const order = detail.workOrder;
  const canProgress = manager || order.assigned_to === session.userId;
  const closed = order.status === "completed" || order.status === "cancelled";

  function run(task: () => Promise<void>) { setError(null); startTransition(async () => { try { await task(); await reconcile(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Maintenance action failed."); } }); }

  async function changeStatus(status: MaintenanceStatus, note: string | null, resolutionNotes: string | null = null, cost: number | null = null) {
    const previous = order.status;
    await queueMaintenanceMutation("maintenance.status", { workOrderId, status, note, resolutionNotes, actualCostUgx: cost }, async (activityId) => {
      const db = getLocalDb(); const now = new Date().toISOString();
      await db.exec(`UPDATE maintenance_work_orders SET status=?, started_at=CASE WHEN ?='in_progress' AND started_at IS NULL THEN ? ELSE started_at END, completed_at=CASE WHEN ?='completed' THEN ? ELSE completed_at END, resolution_notes=CASE WHEN ?='completed' THEN ? ELSE resolution_notes END, actual_cost_ugx=CASE WHEN ?='completed' THEN ? ELSE actual_cost_ugx END, updated_at=? WHERE id=?`, [status, status, now, status, now, status, resolutionNotes, status, cost, now, workOrderId]);
      await addLocalActivity({ id: activityId, workOrderId, actorId: session.userId, action: status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : `status_${status}`, previousStatus: previous, newStatus: status, notes: note ?? resolutionNotes });
    });
  }

  return <section className="grid gap-7">
    <nav className="text-sm text-oliveMuted-500"><Link href="/maintenance" className="hover:underline">Maintenance</Link><span className="mx-2">{">"}</span><span className="font-mono">{order.work_order_number}</span></nav>
    <header className="flex flex-wrap items-start justify-between gap-5 border-b border-stoneWarm-200 pb-6"><div><p className="font-mono text-xs font-semibold text-bronze-600">{order.work_order_number}</p><h1 className="mt-2 text-3xl font-semibold">{order.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-oliveMuted-600">{order.description}</p></div><div className="flex gap-2"><Badge text={label(order.priority)} tone={order.priority === "urgent" ? "bg-red-100 text-red-700" : order.priority === "high" ? "bg-amber-100 text-amber-800" : "bg-stoneWarm-100 text-oliveMuted-700"} /><Badge text={label(order.status)} tone={order.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-50 text-blue-700"} /></div></header>
    <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">This work order is operational only. It has not changed housekeeping status or room availability.</p>
    {error && <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Fact label="Room" value={order.room_unit_name ? `${order.room_type_title} - ${order.room_unit_name}` : "General property"} />
      <Fact label="Reporter" value={order.reported_by_name ?? order.reported_by_email ?? "Unknown"} />
      <Fact label="Assigned to" value={order.assigned_to_name ?? order.assigned_to_email ?? "Unassigned"} />
      <Fact label="Vendor" value={order.external_vendor_name ?? "Internal team"} />
      <Fact label="Reported" value={fmtDate(order.reported_at)} />
      <Fact label="Scheduled" value={fmtDate(order.scheduled_for)} />
      <Fact label="Expected return" value={fmtDate(order.expected_return_at)} />
      <Fact label="Started" value={fmtDate(order.started_at)} />
      <Fact label="Estimated cost" value={fmtUgx(order.estimated_cost_ugx)} />
      <Fact label="Actual cost" value={fmtUgx(order.actual_cost_ugx)} />
      <Fact label="Category" value={label(order.category)} />
      <Fact label="Completed" value={fmtDate(order.completed_at)} />
    </section>

    {!closed && <section className="grid gap-4 border-y border-stoneWarm-200 py-5">
      <h2 className="text-xl font-semibold">Workflow</h2>
      {manager && <form onSubmit={(event) => { event.preventDefault(); const fd=new FormData(event.currentTarget); const assignedTo=String(fd.get("assignedTo")??"")||null; run(async()=>{ const nextStatus=assignedTo && order.status==="open" ? "assigned" : !assignedTo ? "open" : order.status; await queueMaintenanceMutation("maintenance.assign", { workOrderId, assignedTo, note: String(fd.get("note")??"").trim()||null }, async(activityId)=>{ const db=getLocalDb(); await db.exec("UPDATE maintenance_work_orders SET assigned_to=?, status=?, updated_at=? WHERE id=?",[assignedTo,nextStatus,new Date().toISOString(),workOrderId]); await addLocalActivity({id:activityId,workOrderId,actorId:session.userId,action:"assigned",previousStatus:order.status,newStatus:nextStatus,notes:String(fd.get("note")??"").trim()||null}); }); }); }} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><select name="assignedTo" defaultValue={order.assigned_to ?? ""} className={field}><option value="">Unassigned</option>{staff.map((person)=><option key={person.id} value={person.id}>{person.name}</option>)}</select><input name="note" placeholder="Assignment note" maxLength={500} className={field}/><button disabled={isPending} className="rounded-md bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-white">Assign</button></form>}
      {canProgress && <div className="flex flex-wrap gap-2">
        {(order.status==="open"||order.status==="assigned"||order.status==="waiting_parts"||order.status==="on_hold")&&<Action label={order.status==="waiting_parts"||order.status==="on_hold"?"Resume":"Start work"} onClick={()=>run(()=>changeStatus("in_progress", "Work started."))}/>}
        {order.status==="in_progress"&&<><Action label="Waiting for parts" onClick={()=>run(()=>changeStatus("waiting_parts", "Waiting for parts."))}/><Action label="Pause" onClick={()=>run(()=>changeStatus("on_hold", "Work placed on hold."))}/></>}
      </div>}
      {manager && <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={(event)=>{event.preventDefault(); const fd=new FormData(event.currentTarget); run(()=>changeStatus("completed", null, String(fd.get("resolutionNotes")??"").trim(), actualCost||null));}} className="grid gap-2 border border-green-200 bg-green-50 p-4"><h3 className="font-semibold text-green-800">Complete work order</h3><textarea name="resolutionNotes" required minLength={3} maxLength={3000} rows={3} placeholder="Resolution notes" className={field}/><UgxAmountInput name="actualCostUgx" value={actualCost} onValueChange={setActualCost} placeholder="Actual cost UGX" className={field}/><button disabled={isPending} className="w-fit rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white">Complete</button></form>
        <form onSubmit={(event)=>{event.preventDefault(); const fd=new FormData(event.currentTarget); run(()=>changeStatus("cancelled", String(fd.get("note")??"").trim()));}} className="grid gap-2 border border-red-200 bg-red-50 p-4"><h3 className="font-semibold text-red-800">Cancel work order</h3><textarea name="note" required minLength={3} maxLength={500} rows={3} placeholder="Cancellation reason" className={field}/><button disabled={isPending} className="w-fit rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700">Cancel</button></form>
      </div>}
    </section>}

    {!closed && <details className="border-b border-stoneWarm-200 pb-5"><summary className="cursor-pointer text-lg font-semibold">Edit work order</summary><form onSubmit={(event)=>{event.preventDefault(); const fd=new FormData(event.currentTarget); run(async()=>{const payload={workOrderId,title:String(fd.get("title")),description:String(fd.get("description")),category:String(fd.get("category")),priority:String(fd.get("priority")),externalVendorName:manager?String(fd.get("externalVendorName")??"").trim()||null:order.external_vendor_name,scheduledFor:manager?String(fd.get("scheduledFor")??"")||null:order.scheduled_for,expectedReturnAt:manager?String(fd.get("expectedReturnAt")??"")||null:order.expected_return_at,estimatedCostUgx:manager?(estimatedCost||null):order.estimated_cost_ugx}; await queueMaintenanceMutation("maintenance.edit",payload,async(activityId)=>{const db=getLocalDb();await db.exec("UPDATE maintenance_work_orders SET title=?, description=?, category=?, priority=?, external_vendor_name=?, scheduled_for=?, expected_return_at=?, estimated_cost_ugx=?, updated_at=? WHERE id=?",[payload.title,payload.description,payload.category,payload.priority,payload.externalVendorName,payload.scheduledFor,payload.expectedReturnAt,payload.estimatedCostUgx,new Date().toISOString(),workOrderId]);await addLocalActivity({id:activityId,workOrderId,actorId:session.userId,action:"edited",previousStatus:order.status,newStatus:order.status,notes:"Work order details updated."});});});}} className="mt-4 grid gap-3 sm:grid-cols-2"><input name="title" defaultValue={order.title} required minLength={3} maxLength={180} className={field}/><select name="category" defaultValue={order.category} className={field}>{MAINTENANCE_CATEGORIES.map(item=><option key={item} value={item}>{label(item)}</option>)}</select><select name="priority" defaultValue={order.priority} className={field}>{MAINTENANCE_PRIORITIES.map(item=><option key={item} value={item}>{item}</option>)}</select>{manager&&<input name="externalVendorName" defaultValue={order.external_vendor_name??""} placeholder="External vendor" className={field}/>}<textarea name="description" defaultValue={order.description} required minLength={5} maxLength={5000} rows={4} className={`${field} sm:col-span-2`}/>{manager&&<><input name="scheduledFor" type="datetime-local" defaultValue={toLocalInput(order.scheduled_for)} className={field}/><input name="expectedReturnAt" type="datetime-local" defaultValue={toLocalInput(order.expected_return_at)} className={field}/><UgxAmountInput name="estimatedCostUgx" value={estimatedCost} onValueChange={setEstimatedCost} className={field}/></>}<button disabled={isPending} className="w-fit rounded-md bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-white">Save changes</button></form></details>}

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-4"><h2 className="text-xl font-semibold">Photos</h2><form onSubmit={(event)=>{event.preventDefault();const input=event.currentTarget.elements.namedItem("image") as HTMLInputElement;const file=input.files?.[0];if(!file){setError("Choose a photo.");return;}run(async()=>{const processed=await shrinkImage(file);const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(processed);});const base64=dataUrl.split(",")[1]??"";await queueMaintenancePhoto({photoId:crypto.randomUUID(),workOrderId,actorId:session.userId,filename:processed.name,mimeType:processed.type,dataUrl,base64});input.value="";});}} className="flex flex-wrap gap-2"><input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className={field}/><button disabled={isPending} className="rounded-md border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold">Queue photo</button></form><div className="grid gap-3 sm:grid-cols-2">{detail.photos.map(photo=><figure key={photo.id} className="overflow-hidden border border-stoneWarm-200 bg-white"><img src={photo.storage_path} alt={photo.filename} className="aspect-video w-full object-cover"/><figcaption className="px-3 py-2 text-xs text-oliveMuted-600">{photo.filename}</figcaption></figure>)}{detail.photos.length===0&&<p className="text-sm text-oliveMuted-600">No photos attached.</p>}</div></div>
      <div className="grid content-start gap-4"><h2 className="text-xl font-semibold">Activity Timeline</h2><form onSubmit={(event)=>{event.preventDefault();const form=event.currentTarget;const fd=new FormData(form);const note=String(fd.get("note")??"").trim();run(async()=>{await queueMaintenanceMutation("maintenance.note",{workOrderId,note},(activityId)=>addLocalActivity({id:activityId,workOrderId,actorId:session.userId,action:"note_added",previousStatus:order.status,newStatus:order.status,notes:note}));form.reset();});}} className="flex gap-2"><input name="note" required maxLength={2000} placeholder="Add operational note" className={field}/><button disabled={isPending} className="rounded-md bg-oliveMuted-600 px-4 py-2 text-sm font-semibold text-white">Add</button></form><ol className="grid gap-3 border-l border-stoneWarm-300 pl-5">{[...detail.activity].reverse().map(item=><li key={item.id} className="relative"><span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-bronze-500"/><p className="text-sm font-semibold capitalize">{label(item.action)}</p><p className="mt-1 text-sm text-oliveMuted-600">{item.notes??(item.previous_status&&item.new_status?`${label(item.previous_status)} to ${label(item.new_status)}`:"")}</p><p className="mt-1 text-xs text-oliveMuted-500">{item.actor_name??item.actor_email??"System"} - {fmtDate(item.created_at)}</p></li>)}</ol></div>
    </section>
    {order.resolution_notes&&<section className="border-l-2 border-green-500 bg-green-50 px-5 py-4"><p className="text-xs font-semibold uppercase text-green-700">Resolution</p><p className="mt-2 text-sm text-green-900">{order.resolution_notes}</p></section>}
  </section>;
}

function Badge({text,tone}:{text:string;tone:string}){return <span className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${tone}`}>{text}</span>}
function Fact({label:caption,value}:{label:string;value:string}){return <div className="border-l-2 border-stoneWarm-300 px-3"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-oliveMuted-500">{caption}</p><p className="mt-1 text-sm font-semibold capitalize">{value}</p></div>}
function Action({label:caption,onClick}:{label:string;onClick:()=>void}){return <button type="button" onClick={onClick} className="rounded-md border border-stoneWarm-200 bg-white px-4 py-2 text-sm font-semibold">{caption}</button>}
