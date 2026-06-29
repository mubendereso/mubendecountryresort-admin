export type BookingSnapshot = {
  id: string;
  booking_reference: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  room_type_name: string;
  room_unit_name: string | null;
  check_in: string;
  check_out: string;
  status: string;
  group_id: string | null;
  group_name: string | null;
  balance_due: number;
  updated_at: string;
};

export type RoomTypeSnapshot = {
  id: string;
  name: string;
  inventory_count: number;
  updated_at: string;
};

export type FolioSnapshot = {
  booking_id: string;
  total_charges: number;
  total_paid: number;
  balance_due: number;
  updated_at: string;
};

export type PaymentReceiptSnapshot = {
  id: string;
  booking_id: string;
  receipt_number: string;
  amount: number;
  payment_method: string;
  issued_at: string;
};

export type ReservationGroupSnapshot = {
  id: string;
  name: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  member_booking_count: number;
  balance_due: number;
  updated_at: string;
};

export type RoomUnitSnapshot = {
  id: string;
  room_name: string;
  housekeeping_status: string;
  room_type_id: string;
  updated_at: string;
};

export type OfflineSnapshotPayload = {
  offline_identity: {
    user_id: string;
    session_epoch: string;
  };
  generated_at: string;
  bookings: BookingSnapshot[];
  room_types: RoomTypeSnapshot[];
  folios: FolioSnapshot[];
  payment_receipts: PaymentReceiptSnapshot[];
  reservation_groups: ReservationGroupSnapshot[];
  room_units: RoomUnitSnapshot[];
};

export type OfflineSnapshotData = Omit<OfflineSnapshotPayload, "offline_identity"> & {
  last_synced_at: string | null;
};
