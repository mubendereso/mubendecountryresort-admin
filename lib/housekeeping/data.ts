import "server-only";

import { getSql } from "@/lib/db/client";
import type { HousekeepingStatus, RoomUnit } from "./types";

export type HousekeepingData = {
  units: RoomUnit[];
  statusCounts: Record<HousekeepingStatus, number>;
  totalUnits: number;
  readyUnits: number;
};

export async function getHousekeepingData(): Promise<HousekeepingData> {
  const sql = getSql();

  const units = (await sql`
    SELECT
      ru.id::text,
      ru.room_type_id::text,
      rt.title AS room_type_title,
      ru.unit_name,
      ru.floor,
      ru.housekeeping_status,
      ru.notes,
      to_char(ru.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
    FROM room_units ru
    JOIN room_types rt ON rt.id = ru.room_type_id
    ORDER BY
      rt.sort_order ASC,
      rt.title ASC,
      ru.floor ASC NULLS LAST,
      ru.unit_name ASC
  `) as RoomUnit[];

  const statusCounts = {
    dirty: 0,
    cleaning: 0,
    clean: 0,
    inspected: 0,
    out_of_order: 0
  } satisfies Record<HousekeepingStatus, number>;

  for (const unit of units) {
    statusCounts[unit.housekeeping_status] += 1;
  }

  return {
    units,
    statusCounts,
    totalUnits: units.length,
    readyUnits: statusCounts.clean + statusCounts.inspected
  };
}
