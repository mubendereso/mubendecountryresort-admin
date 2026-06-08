export type HousekeepingStatus =
  | "dirty"
  | "cleaning"
  | "inspection_pending"
  | "clean"
  | "inspected"
  | "out_of_order";

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
  "inspection_pending",
  "clean",
  "inspected",
  "out_of_order"
];

export const HOUSEKEEPING_STATUS_LABELS: Record<HousekeepingStatus, string> = {
  dirty: "Dirty",
  cleaning: "Cleaning",
  inspection_pending: "Inspection pending",
  clean: "Clean",
  inspected: "Inspected",
  out_of_order: "Out of order"
};
