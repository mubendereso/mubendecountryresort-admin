import "server-only";

import { getSql } from "@/lib/db/client";
import type {
  ReservationGroupRoomBlockRow,
  ReservationGroupRoomBlockStatus,
  ReservationGroupRoomBlockSummary,
  ReservationGroupStatus
} from "./types";

type RoomBlockResolvedInput = {
  groupId: string;
  groupReference: string;
  groupName: string;
  groupStatus: ReservationGroupStatus;
  roomTypeId: string;
  roomTypeSlug: string;
  roomTypeTitle: string;
  checkIn: string;
  checkOut: string;
  blockedUnits: number;
  availableUnits: number;
};

type ReservationGroupRow = {
  id: string;
  reference: string;
  group_name: string;
  status: ReservationGroupStatus;
  first_check_in: string | null;
  last_check_out: string | null;
};

type RoomTypeRow = {
  id: string;
  slug: string;
  title: string;
  inventory_count: number;
  is_published: boolean;
  archived_at: string | null;
};

type RoomBlockRow = {
  id: string;
  group_id: string;
  group_reference: string;
  group_name: string;
  group_status: ReservationGroupStatus;
  room_type_id: string;
  room_type_slug: string;
  room_type_title: string;
  check_in: string;
  check_out: string;
  blocked_units: number;
  status: ReservationGroupRoomBlockStatus;
  remaining_units: number;
  released_units: number;
  released_at: string | null;
  released_by: string | null;
  released_by_name: string | null;
  release_reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

type RoomBlockSummaryRow = {
  total_blocks: number;
  active_blocks: number;
  released_blocks: number;
  expired_blocks: number;
  converted_blocks: number;
  total_blocked_units: number;
  active_blocked_units: number;
  total_released_units: number;
};

function normalizeText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePositiveInt(value: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function isRoomBlockStatus(value: string): value is ReservationGroupRoomBlockStatus {
  return value === "active" || value === "released" || value === "expired" || value === "converted";
}

async function resolveRoomBlockInput(input: {
  groupId: string;
  roomTypeId: string;
  checkIn?: string | null;
  checkOut?: string | null;
  blockedUnits: number;
}): Promise<{ ok: true; data: RoomBlockResolvedInput } | { ok: false; error: string }> {
  const sql = getSql();

  const groupRows = (await sql`
    select
      id::text,
      reference,
      group_name,
      status,
      first_check_in::text,
      last_check_out::text
    from reservation_groups
    where id = ${input.groupId}::uuid
    limit 1
  `) as ReservationGroupRow[];

  const group = groupRows[0];
  if (!group) return { ok: false, error: "Group not found." };
  if (group.status !== "active") {
    return { ok: false, error: "Room blocks can only be created for active groups." };
  }

  const roomTypeRows = (await sql`
    select
      id::text,
      slug,
      title,
      inventory_count,
      is_published,
      archived_at::text
    from room_types
    where id = ${input.roomTypeId}::uuid
    limit 1
  `) as RoomTypeRow[];

  const roomType = roomTypeRows[0];
  if (!roomType) return { ok: false, error: "Room type not found." };
  if (!roomType.is_published || roomType.archived_at) {
    return { ok: false, error: "Please select a published room type that is still active." };
  }

  const checkIn = normalizeText(input.checkIn ?? null) || group.first_check_in || "";
  const checkOut = normalizeText(input.checkOut ?? null) || group.last_check_out || "";
  if (!checkIn || !checkOut) {
    return {
      ok: false,
      error: "Please enter room block check-in and check-out dates or keep the group dates available."
    };
  }
  if (checkOut <= checkIn) {
    return { ok: false, error: "Room block check-out must be after check-in." };
  }

  const availabilityRows = (await sql`
    select room_type_units_available(${roomType.id}::uuid, ${checkIn}::date, ${checkOut}::date)::int as units_available
  `) as { units_available: number }[];
  const availableUnits = Number(availabilityRows[0]?.units_available ?? 0);

  if (input.blockedUnits > availableUnits) {
    return {
      ok: false,
      error: `Only ${availableUnits} unit${availableUnits === 1 ? "" : "s"} are available for those dates.`
    };
  }

  return {
    ok: true,
    data: {
      groupId: group.id,
      groupReference: group.reference,
      groupName: group.group_name,
      groupStatus: group.status,
      roomTypeId: roomType.id,
      roomTypeSlug: roomType.slug,
      roomTypeTitle: roomType.title,
      checkIn,
      checkOut,
      blockedUnits: input.blockedUnits,
      availableUnits
    }
  };
}

export async function listGroupRoomBlocks(groupId: string): Promise<ReservationGroupRoomBlockRow[]> {
  const sql = getSql();
  const rows = (await sql`
    select
      grb.id::text,
      grb.group_id::text,
      rg.reference as group_reference,
      rg.group_name,
      rg.status as group_status,
      grb.room_type_id::text,
      rt.slug as room_type_slug,
      rt.title as room_type_title,
      grb.check_in::text,
      grb.check_out::text,
      grb.blocked_units,
      grb.status,
      greatest(grb.blocked_units - grb.released_units, 0)::int as remaining_units,
      grb.released_units,
      to_char(grb.released_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as released_at,
      grb.released_by::text,
      released_by_user.full_name as released_by_name,
      grb.release_reason,
      grb.created_by::text,
      created_by_user.full_name as created_by_name,
      to_char(grb.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
      to_char(grb.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
    from group_room_blocks grb
    join reservation_groups rg on rg.id = grb.group_id
    join room_types rt on rt.id = grb.room_type_id
    left join admin_users released_by_user on released_by_user.id = grb.released_by
    left join admin_users created_by_user on created_by_user.id = grb.created_by
    where grb.group_id = ${groupId}::uuid
    order by grb.created_at desc, grb.check_in asc, rt.title asc
  `) as RoomBlockRow[];

  return rows.map((row) => ({
    ...row,
    blocked_units: Number(row.blocked_units),
    remaining_units: Number(row.remaining_units),
    released_units: Number(row.released_units)
  }));
}

export async function getGroupRoomBlockSummary(groupId: string): Promise<ReservationGroupRoomBlockSummary> {
  const sql = getSql();
  const rows = (await sql`
    select
      count(*)::int as total_blocks,
      count(*) filter (where status = 'active')::int as active_blocks,
      count(*) filter (where status = 'released')::int as released_blocks,
      count(*) filter (where status = 'expired')::int as expired_blocks,
      count(*) filter (where status = 'converted')::int as converted_blocks,
      coalesce(sum(blocked_units), 0)::int as total_blocked_units,
      coalesce(sum(blocked_units) filter (where status = 'active'), 0)::int as active_blocked_units,
      coalesce(sum(released_units), 0)::int as total_released_units
    from group_room_blocks
    where group_id = ${groupId}::uuid
  `) as RoomBlockSummaryRow[];

  const summary = rows[0] ?? {
    total_blocks: 0,
    active_blocks: 0,
    released_blocks: 0,
    expired_blocks: 0,
    converted_blocks: 0,
    total_blocked_units: 0,
    active_blocked_units: 0,
    total_released_units: 0
  };

  return {
    total_blocks: Number(summary.total_blocks),
    active_blocks: Number(summary.active_blocks),
    released_blocks: Number(summary.released_blocks),
    expired_blocks: Number(summary.expired_blocks),
    converted_blocks: Number(summary.converted_blocks),
    total_blocked_units: Number(summary.total_blocked_units),
    active_blocked_units: Number(summary.active_blocked_units),
    total_released_units: Number(summary.total_released_units)
  };
}

export async function validateRoomBlockAvailability(input: {
  groupId: string;
  roomTypeId: string;
  checkIn?: string | null;
  checkOut?: string | null;
  blockedUnits: number;
}): Promise<{ ok: true; data: RoomBlockResolvedInput } | { ok: false; error: string }> {
  if (!isUuid(input.groupId)) return { ok: false, error: "Please select a valid group." };
  if (!isUuid(input.roomTypeId)) return { ok: false, error: "Please select a valid room type." };
  if (!Number.isInteger(input.blockedUnits) || input.blockedUnits <= 0) {
    return { ok: false, error: "Please enter at least one blocked unit." };
  }

  return resolveRoomBlockInput(input);
}
