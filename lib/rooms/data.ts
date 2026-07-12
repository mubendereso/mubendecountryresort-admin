import "server-only";

import { getSql } from "@/lib/db/client";
import type {
  GroupBookingRoomOption,
  RoomManagementRow,
  RoomManagementSummary,
  RoomTypeRow
} from "@/lib/rooms/types";

export async function getRoomTypes() {
  const sql = getSql();

  return (await sql`
    select
      id,
      slug,
      title,
      description,
      overview,
      price_ugx,
      cover_image_url,
      details,
      amenities,
      dining_hours,
      gallery,
      inventory_count,
      is_published,
      archived_at,
      sort_order,
      created_at,
      updated_at
    from room_types
    order by sort_order asc, title asc
  `) as RoomTypeRow[];
}

export async function getRoomTypeBySlug(slug: string) {
  const sql = getSql();
  const rows = (await sql`
    select
      id,
      slug,
      title,
      description,
      overview,
      price_ugx,
      cover_image_url,
      details,
      amenities,
      dining_hours,
      gallery,
      inventory_count,
      is_published,
      archived_at,
      sort_order,
      created_at,
      updated_at
    from room_types
    where slug = ${slug}
    limit 1
  `) as RoomTypeRow[];

  return rows[0] ?? null;
}

export async function getGroupBookingRoomOptions(checkIn: string, checkOut: string) {
  const sql = getSql();
  const rows = (await sql`
    select
      rt.id::text,
      rt.slug,
      rt.title,
      rt.price_ugx,
      rt.inventory_count,
      room_type_units_available(rt.id, ${checkIn}::date, ${checkOut}::date)::int as available_count,
      rt.is_published,
      rt.archived_at::text,
      rt.sort_order
    from room_types rt
    where rt.is_published = true
      and rt.archived_at is null
    order by rt.sort_order asc, rt.title asc
  `) as GroupBookingRoomOption[];

  return rows.map((room) => ({
    ...room,
    price_ugx: Number(room.price_ugx),
    inventory_count: Number(room.inventory_count),
    available_count: Number(room.available_count),
    sort_order: Number(room.sort_order)
  }));
}

export async function getRoomsManagementData(): Promise<{
  rooms: RoomManagementRow[];
  summary: RoomManagementSummary;
}> {
  const sql = getSql();
  const rows = (await sql`
    WITH context AS (
      SELECT (now() AT TIME ZONE 'Africa/Kampala')::date AS today
    ),
    occupancy AS (
      SELECT
        b.room_type_id,
        count(*)::int AS occupied_count
      FROM bookings b
      CROSS JOIN context c
      WHERE b.check_in <= c.today
        AND b.check_out > c.today
        AND (
          b.status IN ('awaiting_confirmation', 'confirmed', 'checked_in')
          OR (b.status = 'pending_payment' AND b.expires_at > now())
        )
      GROUP BY b.room_type_id
    ),
    room_condition AS (
      SELECT
        ru.room_type_id,
        count(*) FILTER (WHERE ru.housekeeping_status = 'out_of_order')::int AS out_of_order_count
      FROM room_units ru
      GROUP BY ru.room_type_id
    )
    SELECT
      rt.id::text,
      rt.slug,
      rt.title,
      rt.description,
      rt.overview,
      rt.price_ugx,
      rt.cover_image_url,
      rt.details,
      rt.amenities,
      rt.dining_hours,
      rt.gallery,
      rt.inventory_count,
      rt.is_published,
      rt.archived_at::text,
      rt.sort_order,
      rt.created_at::text,
      rt.updated_at::text,
      COALESCE(NULLIF(rt.gallery[1], ''), NULLIF(rt.cover_image_url, '')) AS image_url,
      COALESCE(o.occupied_count, 0)::int AS occupied_count,
      greatest(
        rt.inventory_count
          - COALESCE(rc.out_of_order_count, 0)
          - COALESCE(o.occupied_count, 0),
        0
      )::int AS available_count,
      COALESCE(rc.out_of_order_count, 0)::int AS out_of_order_count
    FROM room_types rt
    LEFT JOIN occupancy o ON o.room_type_id = rt.id
    LEFT JOIN room_condition rc ON rc.room_type_id = rt.id
    ORDER BY
      (rt.archived_at IS NOT NULL) ASC,
      rt.sort_order ASC,
      rt.title ASC
  `) as RoomManagementRow[];

  const rooms = rows.map((room) => ({
    ...room,
    price_ugx: Number(room.price_ugx),
    inventory_count: Number(room.inventory_count),
    occupied_count: Number(room.occupied_count),
    available_count: Number(room.available_count),
    out_of_order_count: Number(room.out_of_order_count)
  }));

  return {
    rooms,
    summary: {
      roomTypes: rooms.filter((room) => !room.archived_at).length,
      totalRooms: rooms
        .filter((room) => !room.archived_at)
        .reduce((sum, room) => sum + room.inventory_count, 0),
      availableRooms: rooms
        .filter((room) => !room.archived_at)
        .reduce((sum, room) => sum + room.available_count, 0),
      occupiedRooms: rooms
        .filter((room) => !room.archived_at)
        .reduce((sum, room) => sum + room.occupied_count, 0),
      outOfOrderRooms: rooms
        .filter((room) => !room.archived_at)
        .reduce((sum, room) => sum + room.out_of_order_count, 0),
      publishedRoomTypes: rooms.filter((room) => room.is_published && !room.archived_at).length,
      draftRoomTypes: rooms.filter((room) => !room.is_published && !room.archived_at).length,
      archivedRoomTypes: rooms.filter((room) => Boolean(room.archived_at)).length
    }
  };
}
