import "server-only";

import { getSql } from "@/lib/db/client";
import type { HousekeepingStatus } from "@/lib/housekeeping/types";

export type AssignableUnit = {
  id: string;
  unit_name: string;
  floor: number | null;
  housekeeping_status: HousekeepingStatus;
  has_conflict: boolean;
  is_assigned_here: boolean;
};

// Units of a booking's room type, flagged for whether they are free over
// the booking's stay window. Out-of-order and conflicting units are kept
// in the list (shown disabled) so staff see the full picture; ready and
// free units sort first so the natural top choice is a safe assignment.
export async function listAssignableUnits(bookingId: string): Promise<AssignableUnit[]> {
  const sql = getSql();
  return (await sql`
    WITH b AS (
      SELECT id, room_type_id, check_in, check_out, room_unit_id
      FROM bookings
      WHERE id = ${bookingId}::uuid
    )
    SELECT
      ru.id::text,
      ru.unit_name,
      ru.floor,
      ru.housekeeping_status,
      EXISTS (
        SELECT 1
        FROM bookings other
        WHERE other.room_unit_id = ru.id
          AND other.id <> b.id
          AND other.status IN ('confirmed', 'checked_in')
          AND other.check_in < b.check_out
          AND other.check_out > b.check_in
      ) AS has_conflict,
      (b.room_unit_id = ru.id) AS is_assigned_here
    FROM b
    JOIN room_units ru ON ru.room_type_id = b.room_type_id
    ORDER BY
      (ru.housekeeping_status = 'out_of_order') ASC,
      EXISTS (
        SELECT 1
        FROM bookings other
        WHERE other.room_unit_id = ru.id
          AND other.id <> b.id
          AND other.status IN ('confirmed', 'checked_in')
          AND other.check_in < b.check_out
          AND other.check_out > b.check_in
      ) ASC,
      (ru.housekeeping_status IN ('clean', 'inspected')) DESC,
      ru.floor ASC NULLS LAST,
      ru.unit_name ASC
  `) as AssignableUnit[];
}
