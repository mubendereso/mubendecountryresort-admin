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

type Filter = "attention" | "ready" | "all" | HousekeepingStatus;

const STATUS_STYLES: Record<HousekeepingStatus, string> = {
  dirty: "border-[#a4635b]/30 bg-[#a4635b]/10 text-[#8b4d46]",
  cleaning: "border-[#4f7770]/30 bg-[#4f7770]/10 text-[#365d57]",
  inspection_pending: "border-bronze-400/30 bg-bronze-400/10 text-bronze-500",
  clean: "border-[#72805b]/30 bg-[#72805b]/10 text-[#53613f]",
  inspected: "border-oliveMuted-400/30 bg-oliveMuted-400/10 text-oliveMuted-600",
  out_of_order: "border-[#777086]/30 bg-[#777086]/10 text-[#5f586d]"
};

const STATUS_DOT: Record<HousekeepingStatus, string> = {
  dirty: "bg-[#a4635b]",
  cleaning: "bg-[#4f7770]",
  inspection_pending: "bg-bronze-400",
  clean: "bg-[#72805b]",
  inspected: "bg-oliveMuted-600",
  out_of_order: "bg-[#777086]"
};

const ATTENTION_STATUSES = new Set<HousekeepingStatus>([
  "dirty",
  "cleaning",
  "inspection_pending",
  "out_of_order"
]);

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
    inspection_pending: 0,
    clean: 0,
    inspected: 0,
    out_of_order: 0
  } satisfies Record<HousekeepingStatus, number>;

  for (const unit of units) counts[unit.housekeeping_status] += 1;
  return counts;
}

function needsAttention(unit: RoomUnit): boolean {
  return ATTENTION_STATUSES.has(unit.housekeeping_status) || Boolean(unit.notes?.trim());
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

function BedIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M4 18v-7m16 7v-5a3 3 0 0 0-3-3H9a5 5 0 0 0-5 5v3" />
      <path d="M4 14h16M7 10V7h5a3 3 0 0 1 3 3" />
      <path d="M6 18v2m12-2v2" strokeLinecap="round" />
    </svg>
  );
}

function BrushIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="m5 19 4-4m1.5-8.5 7 7M12 5l7 7-4.5 4.5a3.5 3.5 0 0 1-5 0l-2-2a3.5 3.5 0 0 1 0-5L12 5Z" />
      <path d="M4 20h7" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className}>
      <path d="M12 8v5m0 3.5h.01" strokeLinecap="round" />
      <path d="M10.3 4.7 3.5 17a2 2 0 0 0 1.8 3h13.4a2 2 0 0 0 1.8-3L13.7 4.7a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

function CheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m6.5 12.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ToolIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <path d="M14 6.5 17.5 3 21 6.5 17.5 10" />
      <path d="m16 8-8.5 8.5a2.1 2.1 0 0 0 3 3L19 11" />
      <path d="M5 5l4 4" strokeLinecap="round" />
    </svg>
  );
}

function StatusSummaryCard({
  icon,
  label,
  value,
  tone,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-[150px] flex-1 items-center gap-3 px-4 py-3.5 text-left transition hover:bg-stoneWarm-100/35 sm:px-5"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tone}`}>
        {icon}
      </span>
      <span>
        <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">
          {label}
        </span>
        <span className="mt-0.5 block font-serif text-2xl font-semibold text-[#2a241a]">
          {value}
        </span>
      </span>
    </button>
  );
}

function StatusPill({ status }: { status: HousekeepingStatus }) {
  return (
    <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${STATUS_STYLES[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {HOUSEKEEPING_STATUS_LABELS[status]}
    </span>
  );
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
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${
        active
          ? STATUS_STYLES[status]
          : "border-stoneWarm-200 bg-[#fffdf8] text-oliveMuted-600 hover:bg-stoneWarm-100 disabled:opacity-50"
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

  useEffect(() => {
    setNotes(unit.notes ?? "");
  }, [unit.notes, unit.id]);

  return (
    <article className="relative overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_14px_34px_rgba(55,43,30,0.07)] sm:p-5">
      <div className={`absolute inset-y-0 left-0 w-1 ${STATUS_DOT[unit.housekeeping_status]}`} />
      <div className="grid gap-4 pl-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-xl font-semibold tracking-[-0.01em] text-[#2a241a]">
              {unit.unit_name}
            </h3>
            <p className="mt-1 text-sm text-oliveMuted-600">
              {unit.room_type_title}
              {unit.floor !== null ? ` · Floor ${unit.floor}` : ""}
            </p>
          </div>
          <StatusPill status={unit.housekeeping_status} />
        </div>

        <div className="grid gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
            Notes or maintenance issue
          </label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            maxLength={600}
            className="w-full rounded-[18px] border border-stoneWarm-200 bg-white/80 px-3.5 py-3 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-400/10"
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stoneWarm-200/70 pt-3">
          <p className="text-xs text-oliveMuted-500">
            Updated {formatUpdatedAt(unit.updated_at)}
            {pending ? " · saving..." : ""}
          </p>
          <button
            type="button"
            disabled={pending || notes === (unit.notes ?? "")}
            onClick={() => onStatus(unit, unit.housekeeping_status, notes)}
            className="rounded-full border border-stoneWarm-200 px-3 py-1.5 text-xs font-semibold text-oliveMuted-600 transition hover:bg-stoneWarm-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save note
          </button>
        </div>
      </div>
    </article>
  );
}

function AttentionPanel({
  units,
  isPending,
  pendingId,
  onStatus
}: {
  units: RoomUnit[];
  isPending: boolean;
  pendingId: string | null;
  onStatus: (unit: RoomUnit, status: HousekeepingStatus, notes: string | null) => void;
}) {
  return (
    <section className="rounded-[28px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_18px_45px_rgba(55,43,30,0.08)] sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
            Attention required
          </p>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
            Rooms That Need Action
          </h2>
          <p className="mt-2 text-sm leading-6 text-oliveMuted-600">
            Dirty rooms, cleaning work, inspections, out-of-order rooms, and rooms with notes.
          </p>
        </div>
        <span className={`grid h-12 min-w-12 place-items-center rounded-full px-3 font-serif text-xl font-semibold ${
          units.length === 0
            ? "bg-oliveMuted-600 text-canvas-light"
            : "border border-bronze-400/30 bg-bronze-400/10 text-bronze-500"
        }`}>
          {units.length === 0 ? <CheckIcon /> : units.length}
        </span>
      </div>

      {units.length === 0 ? (
        <div className="mt-5 rounded-[22px] border border-oliveMuted-400/15 bg-oliveMuted-400/10 px-5 py-6 text-center">
          <h3 className="font-serif text-xl font-semibold text-[#2a241a]">
            Great. No rooms need attention.
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-oliveMuted-600">
            All rooms are ready or have no open housekeeping notes.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {units.map((unit) => (
            <UnitCard
              key={unit.id}
              unit={unit}
              pending={isPending && pendingId === unit.id}
              onStatus={onStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ReadyRoomsPanel({ units }: { units: RoomUnit[] }) {
  const readyByType = useMemo(() => {
    const grouped = new Map<string, RoomUnit[]>();
    for (const unit of units) {
      const list = grouped.get(unit.room_type_title) ?? [];
      list.push(unit);
      grouped.set(unit.room_type_title, list);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [units]);

  return (
    <section className="grid gap-4">
      <div className="px-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
          Ready rooms
        </p>
        <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
          Compressed Readiness View
        </h2>
      </div>
      {units.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-5 py-8 text-center text-sm text-oliveMuted-600">
          No rooms are marked clean or inspected.
        </div>
      ) : (
        <div className="grid gap-3">
          {readyByType.map(([roomType, roomUnits]) => (
            <div key={roomType} className="rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_10px_24px_rgba(55,43,30,0.05)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-serif text-lg font-semibold text-[#2a241a]">{roomType}</h3>
                <span className="rounded-full bg-stoneWarm-100 px-3 py-1 text-xs font-semibold text-oliveMuted-600">
                  {roomUnits.length} ready
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {roomUnits.map((unit) => (
                  <span key={unit.id} className="rounded-full border border-stoneWarm-200 bg-stoneWarm-100/45 px-3 py-1.5 text-xs font-semibold text-oliveMuted-600">
                    {unit.unit_name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function HousekeepingClient({ initialData }: { initialData: HousekeepingData }) {
  const router = useRouter();
  const [units, setUnits] = useState(initialData.units);
  const [filter, setFilter] = useState<Filter>("ready");
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
  const attentionUnits = useMemo(() => units.filter(needsAttention), [units]);
  const readyUnits = useMemo(
    () =>
      units.filter(
        (unit) =>
          (unit.housekeeping_status === "clean" || unit.housekeeping_status === "inspected") &&
          !unit.notes?.trim()
      ),
    [units]
  );
  const displayed = useMemo(() => {
    if (filter === "attention") return attentionUnits;
    if (filter === "ready") return readyUnits;
    if (filter === "all") return units;
    return units.filter((unit) => unit.housekeeping_status === filter);
  }, [attentionUnits, filter, readyUnits, units]);

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

  const summary = [
    {
      label: "Total Rooms",
      value: units.length,
      icon: <BedIcon />,
      tone: "bg-stoneWarm-100 text-oliveMuted-600",
      filter: "all" as Filter
    },
    {
      label: "Clean",
      value: counts.clean + counts.inspected,
      icon: <CheckIcon />,
      tone: "bg-oliveMuted-600 text-canvas-light",
      filter: "ready" as Filter
    },
    {
      label: "Cleaning",
      value: counts.cleaning,
      icon: <BrushIcon />,
      tone: "bg-[#4f7770]/10 text-[#365d57]",
      filter: "cleaning" as Filter
    },
    {
      label: "Dirty",
      value: counts.dirty,
      icon: <AlertIcon />,
      tone: "bg-[#a4635b]/10 text-[#8b4d46]",
      filter: "dirty" as Filter
    },
    {
      label: "Inspection Pending",
      value: counts.inspection_pending,
      icon: <BedIcon />,
      tone: "bg-bronze-400/10 text-bronze-500",
      filter: "inspection_pending" as Filter
    },
    {
      label: "Out Of Order",
      value: counts.out_of_order,
      icon: <ToolIcon />,
      tone: "bg-[#777086]/10 text-[#5f586d]",
      filter: "out_of_order" as Filter
    }
  ];

  return (
    <section className="grid gap-7 lg:gap-9">
      <header className="relative overflow-hidden rounded-[30px] border border-stoneWarm-200/80 bg-gradient-to-br from-[#fffdf8] via-[#fbf7ef] to-stoneWarm-100/60 px-5 py-7 shadow-[0_20px_50px_rgba(55,43,30,0.09)] sm:px-7 sm:py-8 lg:px-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-bronze-400/15" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-44 w-44 rounded-full border border-oliveMuted-400/10" />
        <div className="relative max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-bronze-500">
            Room readiness
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.035em] text-[#2a241a] sm:text-5xl">
            Housekeeping
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-oliveMuted-600 sm:text-base">
            Operational room readiness focused on rooms that need cleaning, inspection, maintenance, or notes.
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-[24px] border border-stoneWarm-200/80 bg-[#fffdf8] shadow-[0_14px_34px_rgba(55,43,30,0.06)]">
        <div className="flex flex-wrap divide-y divide-stoneWarm-200/70 sm:divide-x sm:divide-y-0">
          {summary.map((item) => (
            <StatusSummaryCard
              key={item.label}
              icon={item.icon}
              label={item.label}
              value={item.value}
              tone={item.tone}
              onClick={() => setFilter(item.filter)}
            />
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-[20px] border border-[#a4635b]/25 bg-[#a4635b]/10 px-5 py-4 text-sm text-[#8b4d46] shadow-sm">
          {error}
        </div>
      )}

      <AttentionPanel
        units={attentionUnits}
        isPending={isPending}
        pendingId={pendingId}
        onStatus={handleStatus}
      />

      <div className="grid gap-5">
        <div className="flex flex-wrap gap-2 rounded-[22px] border border-stoneWarm-200/70 bg-[#fffdf8]/80 p-2 shadow-[0_10px_26px_rgba(55,43,30,0.05)]">
          {[
            { key: "attention" as Filter, label: "Attention", count: attentionUnits.length },
            { key: "ready" as Filter, label: "Ready", count: readyUnits.length },
            { key: "all" as Filter, label: "All", count: units.length },
            ...HOUSEKEEPING_STATUSES.map((status) => ({
              key: status as Filter,
              label: HOUSEKEEPING_STATUS_LABELS[status],
              count: counts[status]
            }))
          ].map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-[15px] px-3.5 py-2.5 text-xs font-semibold transition sm:px-4 ${
                  active
                    ? "bg-oliveMuted-600 text-canvas-light shadow-[0_8px_20px_rgba(82,88,69,0.2)]"
                    : "text-oliveMuted-600 hover:bg-stoneWarm-100"
                }`}
              >
                {tab.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${
                  active ? "bg-white/10 text-canvas-light" : "bg-stoneWarm-100 text-oliveMuted-500"
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {filter === "ready" ? (
          <ReadyRoomsPanel units={readyUnits} />
        ) : displayed.length === 0 ? (
          <div className="rounded-[26px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-6 py-10 text-center shadow-[0_12px_30px_rgba(55,43,30,0.04)]">
            <h2 className="font-serif text-xl font-semibold text-[#2a241a]">No rooms match this view.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-oliveMuted-600">
              Choose another status or return to the attention list.
            </p>
          </div>
        ) : (
          <div className="grid gap-3.5 lg:grid-cols-2">
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
      </div>
    </section>
  );
}
