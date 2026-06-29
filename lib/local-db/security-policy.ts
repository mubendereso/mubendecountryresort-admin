export const OFFLINE_ACCESS_STORAGE_KEY = "mcr_admin_offline_session";
export const OFFLINE_ACCESS_LOCKED_VALUE = "locked";

export const OFFLINE_OWNER_META_KEY = "offline_owner_id";
export const OFFLINE_SESSION_META_KEY = "offline_session_epoch";

export const LOCAL_ADMIN_DATA_TABLES = [
  "_outbox",
  "contact_submissions",
  "room_units",
  "offline_snapshot_meta",
  "bookings_snapshot",
  "room_types_snapshot",
  "folios_snapshot",
  "payment_receipts_snapshot",
  "reservation_groups_snapshot",
  "room_units_snapshot",
  "maintenance_activity",
  "maintenance_photos",
  "maintenance_work_orders",
  "maintenance_staff",
  "maintenance_rooms"
] as const;

export type OfflineIdentity = {
  user_id: string;
  session_epoch: string;
};

export function shouldReplaceOfflineSession(
  existingOwnerId: string | null,
  existingSessionEpoch: string | null,
  incoming: OfflineIdentity
): boolean {
  // Existing installations predate session binding. Treat missing metadata as
  // untrusted and clear once before accepting a newly authenticated snapshot.
  if (!existingOwnerId || !existingSessionEpoch) return true;
  return (
    existingOwnerId !== incoming.user_id ||
    existingSessionEpoch !== incoming.session_epoch
  );
}

export function isOfflineAccessAuthorized(
  browserSessionEpoch: string | null,
  storedOwnerId: string | null,
  storedSessionEpoch: string | null
): boolean {
  return Boolean(
    browserSessionEpoch &&
      browserSessionEpoch !== OFFLINE_ACCESS_LOCKED_VALUE &&
      storedOwnerId &&
      storedSessionEpoch &&
      browserSessionEpoch === storedSessionEpoch
  );
}
