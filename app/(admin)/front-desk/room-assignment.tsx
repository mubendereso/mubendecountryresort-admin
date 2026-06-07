"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignRoomUnitAction,
  unassignRoomUnitAction,
  loadAssignableUnitsAction
} from "@/lib/assignments/actions";
import type { AssignableUnit } from "@/lib/assignments/data";
import { HOUSEKEEPING_STATUS_LABELS } from "@/lib/housekeeping/types";

export function RoomAssignment({
  bookingId,
  assignedUnitName
}: {
  bookingId: string;
  assignedUnitName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState<AssignableUnit[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openPicker() {
    setError(null);
    setOpen(true);
    if (units === null) {
      startTransition(async () => {
        try {
          const list = await loadAssignableUnitsAction(bookingId);
          setUnits(list);
          const current = list.find((u) => u.is_assigned_here);
          setSelected(current?.id ?? "");
        } catch {
          setError("Could not load rooms.");
        }
      });
    }
  }

  function handleAssign() {
    if (!selected) return;
    setError(null);
    const formData = new FormData();
    formData.set("bookingId", bookingId);
    formData.set("roomUnitId", selected);
    startTransition(async () => {
      const result = await assignRoomUnitAction(formData);
      if (result.ok) {
        setOpen(false);
        setUnits(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function handleUnassign() {
    setError(null);
    const formData = new FormData();
    formData.set("bookingId", bookingId);
    startTransition(async () => {
      const result = await unassignRoomUnitAction(formData);
      if (result.ok) {
        setOpen(false);
        setUnits(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-[18px] border border-stoneWarm-200/70 bg-white/55 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
            Assigned Room
          </p>
          <p className="mt-2 font-semibold text-[#2a241a]">
            {assignedUnitName ?? (
              <span className="font-normal text-oliveMuted-500">Not assigned</span>
            )}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={openPicker}
            className="rounded-full border border-stoneWarm-200 bg-[#fffdf8] px-3 py-1.5 text-[11px] font-semibold text-oliveMuted-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-stoneWarm-100"
          >
            {assignedUnitName ? "Change room" : "Assign room"}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 grid gap-2">
          {isPending && units === null ? (
            <p className="text-oliveMuted-600">Loading rooms…</p>
          ) : units && units.length === 0 ? (
            <p className="text-oliveMuted-600">No rooms configured for this room type.</p>
          ) : (
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-2xl border border-stoneWarm-200 bg-[#fffdf8] px-3 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-400/10"
            >
              <option value="">Select a room…</option>
              {(units ?? []).map((u) => {
                const blocked = u.has_conflict || u.housekeeping_status === "out_of_order";
                const tags: string[] = [HOUSEKEEPING_STATUS_LABELS[u.housekeeping_status]];
                if (u.has_conflict) tags.push("booked");
                return (
                  <option key={u.id} value={u.id} disabled={blocked && !u.is_assigned_here}>
                    {u.unit_name}
                    {u.floor != null ? ` · Floor ${u.floor}` : ""} — {tags.join(", ")}
                  </option>
                );
              })}
            </select>
          )}

          {error && <p className="text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {assignedUnitName && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleUnassign}
                className="rounded-full border border-stoneWarm-200 px-3 py-1.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100 disabled:opacity-50"
              >
                Unassign
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-full border border-stoneWarm-200 px-3 py-1.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending || !selected}
              onClick={handleAssign}
              className="rounded-full bg-oliveMuted-600 px-4 py-1.5 text-xs font-semibold text-canvas-light transition hover:bg-oliveMuted-500 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
