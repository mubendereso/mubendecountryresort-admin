export type BookingStatus =
  | "pending_payment"
  | "awaiting_confirmation"
  | "confirmed"
  | "cancelled"
  | "checked_in"
  | "checked_out"
  | "no_show"
  | "refunded";

export type BookingRow = {
  id: string;
  reference: string;
  room_type_id: string;
  room_type_title: string;
  room_image_url: string | null;
  group_id: string | null;
  group_reference: string | null;
  group_name: string | null;
  company_account_id: string | null;
  company_name: string | null;
  group_company_account_id: string | null;
  group_company_name: string | null;
  effective_company_account_id: string | null;
  effective_company_name: string | null;
  check_in: string;   // YYYY-MM-DD
  check_out: string;  // YYYY-MM-DD
  guests_adults: number;
  guests_children: number;
  guest_full_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  special_requests: string | null;
  status: BookingStatus;
  expires_at: string | null;
  quoted_total_ugx: number;
  total_charges_ugx: number;
  total_paid_ugx: number;
  notes: string | null;
  room_unit_id: string | null;
  room_unit_name: string | null;
  created_at: string; // ISO 8601 UTC
};
