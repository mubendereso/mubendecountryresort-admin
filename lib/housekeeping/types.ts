export type HousekeepingStatus = "dirty" | "cleaning" | "clean" | "inspected" | "out_of_order";

export type RoomUnit = {
  id: string;
  room_type_id: string;
  room_type_title: string;
  unit_name: string;
  floor: number | null;
  housekeeping_status: HousekeepingStatus;
  notes: string | null;
  updated_at: string;
};

export const HOUSEKEEPING_STATUSES: HousekeepingStatus[] = [
  "dirty",
  "cleaning",
  "clean",
  "inspected",
  "out_of_order"
];

export const HOUSEKEEPING_STATUS_LABELS: Record<HousekeepingStatus, string> = {
  dirty: "Dirty",
  cleaning: "Cleaning",
  clean: "Clean",
  inspected: "Inspected",
  out_of_order: "Out of order"
};
