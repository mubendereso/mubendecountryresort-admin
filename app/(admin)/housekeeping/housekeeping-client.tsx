"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getLocalDb } from "@/lib/local-db/client";
import { enqueueMutation, pushOutbox, sync } from "@/lib/sync/engine";
import type { HousekeepingData } from "@/lib/housekeeping/data";
import {
  HOUSEKEEPING_STATUS_LABELS,
  HOUSEKEEPING_STATUSES,
  type HousekeepingStatus,
  type RoomUnit
} from "@/lib/housekeeping/types";

type Filter = "all" | HousekeepingStatus;

const STATUS_STYLES: Record<HousekeepingStatus, string> = {
  dirty: "border-red-200 bg-red-50 text-red-700",
  cleaning: "border-blue-200 bg-blue-50 text-blue-700",
  clean: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inspected: "border-oliveMuted-200 bg-oliveMuted-50 text-oliveMuted-700",
  out_of_order: "border-stoneWarm-300 bg-stoneWarm-100 text-oliveMuted-700"
};

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusCounts(units: RoomUnit[]): Record<HousekeepingStatus, number> {
  const counts = {
    dirty: 0,
    cleaning: 0,
    clean: 0,
    inspected: 0,
    out_of_order: 0
  } satisfies Record<HousekeepingStatus, number>;

  for (const unit of units) counts[unit.housekeeping_status] += 1;
  return counts;
}

type LocalRoomUnit = Omit<RoomUnit, "room_type_title">;

async function upsertInitialUnits(units: RoomUnit[]) {
  const db = getLocalDb();
  for (const unit of units) {
    await db.exec(
      `INSERT INTO room_units (
        id,
        room_type_id,
        unit_name,
        floor,
        housekeeping_status,
        notes,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        room_type_id = excluded.room_type_id,
        unit_name = excluded.unit_name,
        floor = excluded.floor,
        housekeeping_status = excluded.housekeeping_status,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
      [
        unit.id,
        unit.room_type_id,
        unit.unit_name,
        unit.floor,
        unit.housekeeping_status,
        unit.notes,
        unit.updated_at,
        unit.updated_at
      ]
    );
  }
}

async function loadLocalUnits(initialUnits: RoomUnit[]): Promise<RoomUnit[]> {
  const titleByUnit = new Map(initialUnits.map((unit) => [unit.id, unit.room_type_title]));
  const rows = await getLocalDb().query<LocalRoomUnit>(
    `SELECT
      id,
      room_type_id,
      unit_name,
      floor,
      housekeeping_status,
      notes,
      created_at,
      updated_at
     FROM room_units
     ORDER BY unit_name ASC`
  );

  if (rows.length === 0) return initialUnits;

  return rows.map((row) => ({
    ...row,
    room_type_title: titleByUnit.get(row.id) ?? "Room"
  }));
}

function StatusButton({
  status,
  active,
  disabled,
  onClick
}: {
  status: HousekeepingStatus;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={active || disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed ${
        active
          ? STATUS_STYLES[status]
          : "border-stoneWarm-200 bg-white text-oliveMuted-600 hover:bg-stoneWarm-50 disabled:opacity-50"
      }`}
    >
      {HOUSEKEEPING_STATUS_LABELS[status]}
    </button>
  );
}

function UnitCard({
  unit,
  pending,
  onStatus
}: {
  unit: RoomUnit;
  pending: boolean;
  onStatus: (unit: RoomUnit, status: HousekeepingStatus, notes: string | null) => void;
}) {
  const [notes, setNotes] = useState(unit.notes ?? "");

  return (
    <article className="surface-card grid gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{unit.unit_name}</h3>
          <p className="mt-1 text-sm text-oliveMuted-600">
            {unit.room_type_title}
            {unit.floor !== null ? ` · Floor ${unit.floor}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLES[unit.housekeeping_status]}`}
        >
          {HOUSEKEEPING_STATUS_LABELS[unit.housekeeping_status]}
        </span>
      </div>

      <div className="grid gap-2">
        <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          maxLength={600}
          className="w-full rounded-2xl border border-stoneWarm-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-oliveMuted-400"
          placeholder="Maintenance issue, missing towel, inspection note..."
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {HOUSEKEEPING_STATUSES.map((status) => (
          <StatusButton
            key={status}
            status={status}
            active={unit.housekeeping_status === status}
            disabled={pending}
            onClick={() => onStatus(unit, status, notes)}
          />
        ))}
      </div>

      <p className="text-xs text-oliveMuted-500">
        Updated {formatUpdatedAt(unit.updated_at)}
        {pending ? " · saving..." : ""}
      </p>
    </article>
  );
}

export function HousekeepingClient({ initialData }: { initialData: HousekeepingData }) {
  const router = useRouter();
  const [units, setUnits] = useState(initialData.units);
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        await upsertInitialUnits(initialData.units);
        await sync();
        if (cancelled) return;
        setUnits(await loadLocalUnits(initialData.units));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Housekeeping sync failed.");
        }
      }
    }

    hydrate();

    function onFocus() {
      hydrate();
    }

    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [initialData.units]);

  const counts = useMemo(() => statusCounts(units), [units]);
  const roomTypeCount = useMemo(
    () => new Set(units.map((unit) => unit.room_type_id)).size,
    [units]
  );
  const displayed = useMemo(
    () => (filter === "all" ? units : units.filter((unit) => unit.housekeeping_status === filter)),
    [filter, units]
  );

  function handleStatus(unit: RoomUnit, status: HousekeepingStatus, notes: string | null) {
    setError(null);
    setPendingId(unit.id);

    const previous = units;
    const updatedAt = new Date().toISOString();
    setUnits((current) =>
      current.map((item) =>
        item.id === unit.id
          ? { ...item, housekeeping_status: status, notes: notes || null, updated_at: updatedAt }
          : item
      )
    );

    startTransition(async () => {
      try {
        const db = getLocalDb();
        await db.exec(
          `UPDATE room_units
           SET housekeeping_status = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          [status, notes || null, updatedAt, unit.id]
        );
        await enqueueMutation("room_unit.update_housekeeping", {
          unitId: unit.id,
          status,
          notes: notes || null
        });
        await pushOutbox();
        router.refresh();
      } catch (err) {
        try {
          setUnits(await loadLocalUnits(initialData.units));
        } catch {
          setUnits(previous);
        }
        setError(
          err instanceof Error
            ? `${err.message} The change is saved locally if you are offline.`
            : "Failed to update room status."
        );
      }
      setPendingId(null);
    });
  }

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Housekeeping</h1>
          <p className="mt-2 text-sm text-oliveMuted-600">
            Track room readiness across physical resort units.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="surface-card px-4 py-2 text-sm">
            <span className="font-semibold">{initialData.totalUnits}</span>{" "}
            <span className="text-oliveMuted-600">rooms</span>
          </div>
          <div className="surface-card px-4 py-2 text-sm">
            <span className="font-semibold">{roomTypeCount}</span>{" "}
            <span className="text-oliveMuted-600">room types</span>
          </div>
          <div className="surface-card px-4 py-2 text-sm">
            <span className="font-semibold">{counts.clean + counts.inspected}</span>{" "}
            <span className="text-oliveMuted-600">ready</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
            filter === "all"
              ? "border-oliveMuted-300 bg-oliveMuted-50 text-oliveMuted-700"
              : "border-stoneWarm-200 bg-white text-oliveMuted-600 hover:bg-stoneWarm-50"
          }`}
        >
          All {units.length}
        </button>
        {HOUSEKEEPING_STATUSES.map((status) => (
          <button
            type="button"
            key={status}
            onClick={() => setFilter(status)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              filter === status
                ? STATUS_STYLES[status]
                : "border-stoneWarm-200 bg-white text-oliveMuted-600 hover:bg-stoneWarm-50"
            }`}
          >
            {HOUSEKEEPING_STATUS_LABELS[status]} {counts[status]}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="surface-card px-5 py-6 text-sm text-oliveMuted-600">
          No rooms match this filter.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {displayed.map((unit) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              pending={isPending && pendingId === unit.id}
              onStatus={handleStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}
