"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import { getSql } from "@/lib/db/client";
import type {
  CreateGroupRoomBlockResult,
  ReleaseGroupRoomBlockResult,
  ReservationGroupRoomBlockStatus,
  ReservationGroupStatus
} from "./types";
import { validateRoomBlockAvailability } from "./room-blocks";

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

export async function createGroupRoomBlockAction(
  formData: FormData
): Promise<CreateGroupRoomBlockResult> {
  const session = await requireApprovedAdminRole();
  const groupId = normalizeText(formData.get("groupId"));
  const roomTypeId = normalizeText(formData.get("roomTypeId"));
  const checkIn = normalizeText(formData.get("checkIn")) || null;
  const checkOut = normalizeText(formData.get("checkOut")) || null;
  const blockedUnits = parsePositiveInt(normalizeText(formData.get("blockedUnits")));

  if (!groupId) return { ok: false, error: "Missing group reference." };
  if (!roomTypeId) return { ok: false, error: "Please select a room type." };
  if (!blockedUnits) return { ok: false, error: "Please enter at least one blocked unit." };

  const validation = await validateRoomBlockAvailability({
    groupId,
    roomTypeId,
    checkIn,
    checkOut,
    blockedUnits
  });
  if (!validation.ok) return validation;

  const sql = getSql();

  try {
    const rows = (await sql`
      insert into group_room_blocks (
        group_id,
        room_type_id,
        check_in,
        check_out,
        blocked_units,
        status,
        released_units,
        created_by
      )
      values (
        ${validation.data.groupId}::uuid,
        ${validation.data.roomTypeId}::uuid,
        ${validation.data.checkIn}::date,
        ${validation.data.checkOut}::date,
        ${validation.data.blockedUnits},
        'active',
        0,
        ${session.userId}::uuid
      )
      returning id::text
    `) as { id: string }[];

    const block = rows[0];
    if (!block) return { ok: false, error: "Room block could not be created. Please try again." };

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "reservation_group.room_block_created",
      entityType: "reservation_group",
      entityId: validation.data.groupId,
      summary: `Created room block for ${validation.data.roomTypeTitle}.`,
      context: {
        groupId: validation.data.groupId,
        groupReference: validation.data.groupReference,
        groupName: validation.data.groupName,
        groupStatus: validation.data.groupStatus,
        roomBlockId: block.id,
        roomTypeId: validation.data.roomTypeId,
        roomTypeSlug: validation.data.roomTypeSlug,
        roomTypeTitle: validation.data.roomTypeTitle,
        checkIn: validation.data.checkIn,
        checkOut: validation.data.checkOut,
        blockedUnits: validation.data.blockedUnits,
        availableUnits: validation.data.availableUnits
      }
    });

    revalidatePath("/groups");
    revalidatePath(`/groups/${validation.data.groupId}`);
    revalidatePath("/availability");
    revalidatePath("/bookings/new");
    revalidatePath("/bookings/new/group");
    revalidatePath("/front-desk");
    revalidatePath("/calendar");

    return {
      ok: true,
      blockId: block.id,
      groupId: validation.data.groupId,
      roomTypeTitle: validation.data.roomTypeTitle
    };
  } catch (error) {
    console.error("create_group_room_block failed:", error);
    return { ok: false, error: "Room block could not be created. Please try again." };
  }
}

export async function releaseGroupRoomBlockAction(
  formData: FormData
): Promise<ReleaseGroupRoomBlockResult> {
  const session = await requireApprovedAdminRole();
  const blockId = normalizeText(formData.get("blockId"));
  const releaseReason = normalizeText(formData.get("releaseReason")) || null;

  if (!blockId) return { ok: false, error: "Missing room block reference." };
  if (!isUuid(blockId)) return { ok: false, error: "Please select a valid room block." };

  const sql = getSql();
  const existingRows = (await sql`
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
      grb.released_units
    from group_room_blocks grb
    join reservation_groups rg on rg.id = grb.group_id
    join room_types rt on rt.id = grb.room_type_id
    where grb.id = ${blockId}::uuid
    limit 1
  `) as Array<{
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
    released_units: number;
  }>;

  const existing = existingRows[0];
  if (!existing) return { ok: false, error: "Room block not found." };
  if (!isRoomBlockStatus(existing.status)) {
    return { ok: false, error: "Please select a valid room block status." };
  }
  if (existing.status !== "active") {
    return { ok: false, error: "Only active room blocks can be released." };
  }

  try {
    await sql`
      update group_room_blocks
      set
        status = 'released',
        released_units = blocked_units,
        released_at = now(),
        released_by = ${session.userId}::uuid,
        release_reason = ${releaseReason}
      where id = ${blockId}::uuid
    `;

    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: "reservation_group.room_block_released",
      entityType: "reservation_group",
      entityId: existing.group_id,
      summary: `Released room block for ${existing.room_type_title}.`,
      context: {
        groupId: existing.group_id,
        groupReference: existing.group_reference,
        groupName: existing.group_name,
        groupStatus: existing.group_status,
        roomBlockId: existing.id,
        roomTypeId: existing.room_type_id,
        roomTypeSlug: existing.room_type_slug,
        roomTypeTitle: existing.room_type_title,
        checkIn: existing.check_in,
        checkOut: existing.check_out,
        blockedUnits: Number(existing.blocked_units),
        releasedUnits: Number(existing.blocked_units),
        releaseReason
      }
    });

    revalidatePath("/groups");
    revalidatePath(`/groups/${existing.group_id}`);
    revalidatePath("/availability");
    revalidatePath("/bookings/new");
    revalidatePath("/bookings/new/group");
    revalidatePath("/front-desk");
    revalidatePath("/calendar");

    return {
      ok: true,
      blockId: existing.id,
      groupId: existing.group_id,
      status: "released"
    };
  } catch (error) {
    console.error("release_group_room_block failed:", error);
    return { ok: false, error: "Room block could not be released. Please try again." };
  }
}
