"use client";

import { getLocalDb } from "@/lib/local-db/client";
import type { SqlParam } from "@/lib/local-db/protocol";
import type {
  BookingSnapshot,
  FolioSnapshot,
  OfflineSnapshotData,
  OfflineSnapshotPayload,
  PaymentReceiptSnapshot,
  ReservationGroupSnapshot,
  RoomTypeSnapshot,
  RoomUnitSnapshot
} from "./types";

type SnapshotTable =
  | "bookings_snapshot"
  | "room_types_snapshot"
  | "folios_snapshot"
  | "payment_receipts_snapshot"
  | "reservation_groups_snapshot"
  | "room_units_snapshot";

async function replaceRows<T extends Record<string, SqlParam>>(
  table: SnapshotTable,
  columns: (keyof T & string)[],
  rows: T[]
): Promise<void> {
  const db = getLocalDb();
  await db.exec(`DELETE FROM ${table}`);

  if (rows.length === 0) return;

  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;

  for (const row of rows) {
    await db.exec(sql, columns.map((column) => row[column] ?? null));
  }
}

function asBookingRows(rows: BookingSnapshot[]): Record<string, SqlParam>[] {
  return rows.map((row) => ({ ...row }));
}

function asRoomTypeRows(rows: RoomTypeSnapshot[]): Record<string, SqlParam>[] {
  return rows.map((row) => ({ ...row }));
}

function asFolioRows(rows: FolioSnapshot[]): Record<string, SqlParam>[] {
  return rows.map((row) => ({ ...row }));
}

function asReceiptRows(rows: PaymentReceiptSnapshot[]): Record<string, SqlParam>[] {
  return rows.map((row) => ({ ...row }));
}

function asGroupRows(rows: ReservationGroupSnapshot[]): Record<string, SqlParam>[] {
  return rows.map((row) => ({ ...row }));
}

function asRoomUnitRows(rows: RoomUnitSnapshot[]): Record<string, SqlParam>[] {
  return rows.map((row) => ({ ...row }));
}

export async function storeOfflineSnapshots(payload: OfflineSnapshotPayload): Promise<void> {
  const db = getLocalDb();
  await db.exec("BEGIN");
  try {
    await replaceRows("bookings_snapshot", [
      "id",
      "booking_reference",
      "guest_name",
      "guest_phone",
      "guest_email",
      "room_type_name",
      "room_unit_name",
      "check_in",
      "check_out",
      "status",
      "group_id",
      "group_name",
      "balance_due",
      "updated_at"
    ], asBookingRows(payload.bookings));

    await replaceRows("room_types_snapshot", [
      "id",
      "name",
      "inventory_count",
      "updated_at"
    ], asRoomTypeRows(payload.room_types));

    await replaceRows("folios_snapshot", [
      "booking_id",
      "total_charges",
      "total_paid",
      "balance_due",
      "updated_at"
    ], asFolioRows(payload.folios));

    await replaceRows("payment_receipts_snapshot", [
      "id",
      "booking_id",
      "receipt_number",
      "amount",
      "payment_method",
      "issued_at"
    ], asReceiptRows(payload.payment_receipts));

    await replaceRows("reservation_groups_snapshot", [
      "id",
      "name",
      "status",
      "check_in",
      "check_out",
      "member_booking_count",
      "balance_due",
      "updated_at"
    ], asGroupRows(payload.reservation_groups));

    await replaceRows("room_units_snapshot", [
      "id",
      "room_name",
      "housekeeping_status",
      "room_type_id",
      "updated_at"
    ], asRoomUnitRows(payload.room_units));

    await db.exec(
      `INSERT INTO offline_snapshot_meta (key, value, updated_at)
       VALUES ('last_synced_at', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [payload.generated_at]
    );
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function refreshOfflineSnapshots(): Promise<string> {
  const response = await fetch("/api/sync/snapshots", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: "same-origin",
    body: "{}"
  });

  if (!response.ok) {
    throw new Error(`Snapshot sync failed (${response.status})`);
  }

  const payload = (await response.json()) as OfflineSnapshotPayload;
  await storeOfflineSnapshots(payload);
  return payload.generated_at;
}

export async function getOfflineLastSyncedAt(): Promise<string | null> {
  const rows = await getLocalDb().query<{ value: string }>(
    "SELECT value FROM offline_snapshot_meta WHERE key = 'last_synced_at'"
  );
  return rows[0]?.value ?? null;
}

export async function getOfflineSnapshotData(): Promise<OfflineSnapshotData> {
  const db = getLocalDb();
  const [
    last_synced_at,
    bookings,
    room_types,
    folios,
    payment_receipts,
    reservation_groups,
    room_units
  ] = await Promise.all([
    getOfflineLastSyncedAt(),
    db.query<BookingSnapshot>(
      `SELECT * FROM bookings_snapshot
       ORDER BY check_in ASC, booking_reference ASC`
    ),
    db.query<RoomTypeSnapshot>(
      "SELECT * FROM room_types_snapshot ORDER BY name ASC"
    ),
    db.query<FolioSnapshot>(
      "SELECT * FROM folios_snapshot ORDER BY updated_at DESC"
    ),
    db.query<PaymentReceiptSnapshot>(
      "SELECT * FROM payment_receipts_snapshot ORDER BY issued_at DESC"
    ),
    db.query<ReservationGroupSnapshot>(
      "SELECT * FROM reservation_groups_snapshot ORDER BY updated_at DESC"
    ),
    db.query<RoomUnitSnapshot>(
      "SELECT * FROM room_units_snapshot ORDER BY room_name ASC"
    )
  ]);

  return {
    generated_at: last_synced_at ?? "",
    last_synced_at,
    bookings,
    room_types,
    folios,
    payment_receipts,
    reservation_groups,
    room_units
  };
}
