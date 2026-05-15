import "server-only";

import { getSql } from "@/lib/db/client";
import type { AvailabilityBookingRow, RoomTypeRow } from "@/lib/rooms/types";

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
      sort_order,
      created_at,
      updated_at
    from room_types
    where slug = ${slug}
    limit 1
  `) as RoomTypeRow[];

  return rows[0] ?? null;
}

export async function getAvailabilityForRoomType(roomTypeId: string, checkIn: string, checkOut: string) {
  const sql = getSql();
  const availabilityRows = (await sql`
    select room_type_units_available(${roomTypeId}, ${checkIn}, ${checkOut})::int as units_available
  `) as { units_available: number }[];
  const bookings = (await sql`
    select reference, check_in, check_out, guest_full_name, status, expires_at
    from bookings
    where room_type_id = ${roomTypeId}
      and check_in < ${checkOut}
      and check_out > ${checkIn}
      and (
        status in ('awaiting_confirmation', 'confirmed', 'checked_in')
        or (status = 'pending_payment' and expires_at > now())
      )
    order by check_in asc, created_at asc
  `) as AvailabilityBookingRow[];

  return {
    unitsAvailable: availabilityRows[0]?.units_available ?? 0,
    bookings
  };
}
