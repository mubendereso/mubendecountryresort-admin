// Keep the complete room inventory snapshot bounded until incremental room
// unit synchronization is implemented.
export const MAX_OFFLINE_ROOM_UNITS = 1_000;

export function roomUnitSnapshotExceedsLimit(count: number): boolean {
  return count > MAX_OFFLINE_ROOM_UNITS;
}
