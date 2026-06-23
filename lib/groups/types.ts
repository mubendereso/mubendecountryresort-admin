import type { BookingRow } from "@/lib/bookings/types";

export type ReservationGroupStatus = "active" | "archived" | "closed";

export type ReservationGroupRow = {
  id: string;
  reference: string;
  status: ReservationGroupStatus;
  group_name: string;
  organizer_name: string | null;
  organizer_email: string | null;
  organizer_phone: string | null;
  notes: string | null;
  company_account_id: string | null;
  company_name: string | null;
  company_contact_name: string | null;
  company_contact_email: string | null;
  company_contact_phone: string | null;
  company_payment_terms_days: number | null;
  company_credit_limit_ugx: number | null;
  booking_count: number;
  historical_booking_count: number;
  inactive_booking_count: number;
  guest_count: number;
  historical_guest_count: number;
  inactive_guest_count: number;
  total_charges_ugx: number;
  total_paid_ugx: number;
  balance_due_ugx: number;
  historical_total_charges_ugx: number;
  historical_total_paid_ugx: number;
  historical_balance_due_ugx: number;
  // Group dates are the default event/stay window for the umbrella record.
  // They do not force individual member booking dates to match.
  first_check_in: string | null;
  last_check_out: string | null;
  created_at: string;
  updated_at: string;
};

export type ReservationGroupAuditEvent = {
  id: string;
  title: string;
  detail: string;
  at: string;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
};

export type ReservationGroupSettlementBooking = {
  id: string;
  reference: string;
  guest_full_name: string;
  status: string;
  balance_due_ugx: number;
};

export type ReservationGroupSettlementReceiptGap = {
  booking_id: string;
  booking_reference: string;
  missing_receipt_count: number;
};

export type ReservationGroupSettlement = {
  total_bookings: number;
  terminal_booking_count: number;
  open_booking_count: number;
  unsettled_booking_count: number;
  balance_due_ugx: number;
  missing_receipt_count: number;
  can_close: boolean;
  blockers: string[];
  open_bookings: ReservationGroupSettlementBooking[];
  unsettled_bookings: ReservationGroupSettlementBooking[];
  receipt_gaps: ReservationGroupSettlementReceiptGap[];
};

export type ReservationGroupRoomBlockStatus = "active" | "released" | "expired" | "converted";

export type ReservationGroupRoomBlockRow = {
  id: string;
  group_id: string;
  group_reference: string;
  group_name: string;
  group_status: ReservationGroupStatus;
  room_type_id: string;
  room_type_slug: string;
  room_type_title: string;
  check_in: string;
  check_out: string;
  blocked_units: number;
  status: ReservationGroupRoomBlockStatus;
  remaining_units: number;
  released_units: number;
  released_at: string | null;
  released_by: string | null;
  released_by_name: string | null;
  release_reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ReservationGroupRoomBlockSummary = {
  total_blocks: number;
  active_blocks: number;
  released_blocks: number;
  expired_blocks: number;
  converted_blocks: number;
  total_blocked_units: number;
  active_blocked_units: number;
  total_released_units: number;
};

export type CreateGroupRoomBlockResult =
  | { ok: true; blockId: string; groupId: string; roomTypeTitle: string }
  | { ok: false; error: string };

export type ReleaseGroupRoomBlockResult =
  | { ok: true; blockId: string; groupId: string; status: ReservationGroupRoomBlockStatus }
  | { ok: false; error: string };

export type ReservationGroupDetailData = {
  group: ReservationGroupRow;
  roomBlocks: ReservationGroupRoomBlockRow[];
  roomBlockSummary: ReservationGroupRoomBlockSummary;
  bookings: BookingRow[];
  attachableBookings: BookingRow[];
  auditEvents: ReservationGroupAuditEvent[];
  settlement: ReservationGroupSettlement;
};
