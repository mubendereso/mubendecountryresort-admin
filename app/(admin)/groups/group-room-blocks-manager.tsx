"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createGroupRoomBlockAction, releaseGroupRoomBlockAction } from "@/lib/groups/room-block-actions";
import type {
  ReservationGroupRoomBlockRow,
  ReservationGroupRoomBlockSummary,
  ReservationGroupStatus
} from "@/lib/groups/types";
import type { RoomTypeRow } from "@/lib/rooms/types";

const FIELD_CLASS =
  "w-full rounded-2xl border border-stoneWarm-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-oliveMuted-400 focus:ring-2 focus:ring-oliveMuted-200";
const LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500";

function fmtUgx(value: number): string {
  return `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(parsed);
}

function statusLabel(status: string): string {
  if (status === "released") return "Released";
  if (status === "expired") return "Expired";
  if (status === "converted") return "Converted";
  return "Active";
}

function statusClasses(status: string): string {
  if (status === "released") {
    return "border-stoneWarm-200 bg-stoneWarm-100 text-oliveMuted-600";
  }
  if (status === "expired") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "converted") {
    return "border-oliveMuted-200 bg-oliveMuted-50 text-oliveMuted-700";
  }
  return "border-oliveMuted-200 bg-oliveMuted-50 text-oliveMuted-700";
}

function RoomBlockCard({
  block,
  onRelease,
  pending
}: {
  block: ReservationGroupRoomBlockRow;
  onRelease: (formData: FormData) => void;
  pending: boolean;
}) {
  const remainingUnits = Math.max(0, block.remaining_units);

  function handleRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onRelease(formData);
  }

  return (
    <article className="grid gap-4 rounded-[22px] border border-stoneWarm-200/80 bg-[#fffdf8] p-4 shadow-[0_12px_30px_rgba(55,43,30,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-serif text-lg font-semibold text-[#2a241a]">
            {block.room_type_title}
          </h3>
          <p className="mt-1 text-sm font-semibold text-oliveMuted-700">
            {block.group_name}
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-oliveMuted-500">
            {block.group_reference}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${statusClasses(block.status)}`}>
          {statusLabel(block.status)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[18px] border border-stoneWarm-200/70 bg-white/70 p-3">
          <p className={LABEL_CLASS}>Window</p>
          <p className="mt-1 text-sm font-semibold text-[#2a241a]">
            {formatDate(block.check_in)} to {formatDate(block.check_out)}
          </p>
          <p className="mt-1 text-xs text-oliveMuted-500">
            {block.room_type_slug}
          </p>
        </div>
        <div className="rounded-[18px] border border-stoneWarm-200/70 bg-white/70 p-3">
          <p className={LABEL_CLASS}>Blocked units</p>
          <p className="mt-1 text-sm font-semibold text-[#2a241a]">
            {block.blocked_units}
          </p>
          <p className="mt-1 text-xs text-oliveMuted-500">
            Remaining {remainingUnits}
          </p>
        </div>
        <div className="rounded-[18px] border border-stoneWarm-200/70 bg-white/70 p-3">
          <p className={LABEL_CLASS}>Released</p>
          <p className="mt-1 text-sm font-semibold text-[#2a241a]">
            {block.released_units}
          </p>
          <p className="mt-1 text-xs text-oliveMuted-500">
            {block.released_at ? formatDate(block.released_at) : "Not released"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stoneWarm-200/70 pt-3">
        <div className="text-xs text-oliveMuted-500">
          {block.release_reason ? `Release note: ${block.release_reason}` : "Inventory hold only. Not a guest booking."}
        </div>
        {block.status === "active" ? (
          <form onSubmit={handleRelease} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="blockId" value={block.id} />
            <input type="hidden" name="releaseReason" value="" />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full border border-[#9c6b63]/20 bg-[#9c6b63]/5 px-3 py-2 text-xs font-semibold text-[#83574f] transition hover:bg-[#9c6b63]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Releasing..." : "Release block"}
            </button>
          </form>
        ) : (
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-oliveMuted-400">
            Read only
          </span>
        )}
      </div>
    </article>
  );
}

export function GroupRoomBlocksManager({
  groupId,
  groupStatus,
  groupReference,
  groupName,
  groupStartDate,
  groupEndDate,
  roomTypes,
  roomBlocks,
  summary
}: {
  groupId: string;
  groupStatus: ReservationGroupStatus;
  groupReference: string;
  groupName: string;
  groupStartDate: string | null;
  groupEndDate: string | null;
  roomTypes: RoomTypeRow[];
  roomBlocks: ReservationGroupRoomBlockRow[];
  summary: ReservationGroupRoomBlockSummary;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("groupId", groupId);

    setPendingCreate(true);
    startTransition(async () => {
      const result = await createGroupRoomBlockAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        form.reset();
        setError(null);
        router.refresh();
      }
      setPendingCreate(false);
    });
  }

  function handleRelease(formData: FormData) {
    setError(null);
    const blockId = String(formData.get("blockId") ?? "");
    setPendingBlockId(blockId);

    startTransition(async () => {
      const result = await releaseGroupRoomBlockAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
      setPendingBlockId(null);
    });
  }

  return (
    <section className="grid gap-5 rounded-[28px] border border-stoneWarm-200/80 bg-[#fffdf8] p-5 shadow-[0_18px_45px_rgba(55,43,30,0.08)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-bronze-500">
            Room Blocks
          </p>
          <h2 className="font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
            Inventory holds for {groupName}
          </h2>
          <p className="text-sm text-oliveMuted-600">
            {isOpen
              ? "Room blocks hold inventory but are not guest bookings."
              : "Collapsed by default. Open only if you need to manage inventory holds."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          aria-expanded={isOpen}
          className="rounded-full border border-stoneWarm-200 bg-stoneWarm-50 px-4 py-2 text-sm font-semibold text-oliveMuted-600 transition hover:bg-white"
        >
          {isOpen ? "Hide room blocks" : "Show room blocks"}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-[18px] border border-stoneWarm-200 bg-stoneWarm-50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Blocks</p>
          <p className="mt-1 text-lg font-semibold text-[#2a241a]">{summary.total_blocks}</p>
        </div>
        <div className="rounded-[18px] border border-stoneWarm-200 bg-stoneWarm-50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Active</p>
          <p className="mt-1 text-lg font-semibold text-[#2a241a]">{summary.active_blocks}</p>
        </div>
        <div className="rounded-[18px] border border-stoneWarm-200 bg-stoneWarm-50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Held units</p>
          <p className="mt-1 text-lg font-semibold text-[#2a241a]">{summary.active_blocked_units}</p>
        </div>
        <div className="rounded-[18px] border border-stoneWarm-200 bg-stoneWarm-50 px-3 py-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-oliveMuted-500">Released</p>
          <p className="mt-1 text-lg font-semibold text-[#2a241a]">{summary.total_released_units}</p>
        </div>
      </div>

      {isOpen && (
        <>
          {groupStatus !== "active" && (
            <p className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This group is {groupStatus}. New room blocks are disabled, but existing blocks remain visible for review.
            </p>
          )}

          {error && (
            <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleCreate} className="grid gap-4 rounded-[24px] border border-stoneWarm-200/80 bg-stoneWarm-50/60 p-4">
            <div className="grid gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                Create block
              </p>
              <p className="text-sm text-oliveMuted-600">
                Use the group dates as the default stay window or override them when the inventory hold needs a different span.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(0,0.8fr))]">
              <div className="grid gap-1.5">
                <label htmlFor="roomTypeId" className={LABEL_CLASS}>
                  Room type
                </label>
                <select
                  id="roomTypeId"
                  name="roomTypeId"
                  defaultValue={roomTypes[0]?.id ?? ""}
                  className={FIELD_CLASS}
                  disabled={roomTypes.length === 0 || groupStatus !== "active"}
                  required
                >
                  <option value="" disabled>
                    {roomTypes.length === 0 ? "No room types available" : "Select a room type"}
                  </option>
                  {roomTypes.map((roomType) => (
                    <option key={roomType.id} value={roomType.id}>
                      {roomType.title} - {roomType.inventory_count} unit{roomType.inventory_count === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="checkIn" className={LABEL_CLASS}>
                  Check-in
                </label>
                <input
                  id="checkIn"
                  name="checkIn"
                  type="date"
                  defaultValue={groupStartDate ?? ""}
                  className={FIELD_CLASS}
                  disabled={groupStatus !== "active"}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="checkOut" className={LABEL_CLASS}>
                  Check-out
                </label>
                <input
                  id="checkOut"
                  name="checkOut"
                  type="date"
                  defaultValue={groupEndDate ?? ""}
                  className={FIELD_CLASS}
                  disabled={groupStatus !== "active"}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="blockedUnits" className={LABEL_CLASS}>
                  Blocked units
                </label>
                <input
                  id="blockedUnits"
                  name="blockedUnits"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={1}
                  className={FIELD_CLASS}
                  disabled={groupStatus !== "active"}
                  required
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-oliveMuted-500">
                {groupReference} • {groupStatus === "active" ? "Creating a block will reduce live availability immediately." : "Create is disabled for non-active groups."}
              </p>
              <button
                type="submit"
                disabled={pendingCreate || groupStatus !== "active" || roomTypes.length === 0}
                className="rounded-full bg-oliveMuted-600 px-5 py-2.5 text-sm font-semibold text-canvas-light shadow-[0_10px_24px_rgba(82,88,69,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-oliveMuted-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingCreate ? "Creating..." : "Create room block"}
              </button>
            </div>
          </form>

          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-oliveMuted-500">
                  Block list
                </p>
                <h3 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-[#2a241a]">
                  Existing room blocks
                </h3>
              </div>
              <p className="text-sm text-oliveMuted-500">
                {roomBlocks.length} block{roomBlocks.length === 1 ? "" : "s"}
              </p>
            </div>

            {roomBlocks.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-stoneWarm-300 bg-[#fffdf8]/70 px-6 py-10 text-sm text-oliveMuted-600">
                No room blocks have been created for this group yet.
              </div>
            ) : (
              <div className="grid gap-3">
                {roomBlocks.map((block) => (
                  <RoomBlockCard
                    key={block.id}
                    block={block}
                    pending={pendingBlockId === block.id}
                    onRelease={handleRelease}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
