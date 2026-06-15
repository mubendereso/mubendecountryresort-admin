import type { BookingStatus } from "@/lib/bookings/types";
import type { PaymentMethod } from "@/lib/folios/types";

export type NightAuditPaymentMethodTotal = {
  method: PaymentMethod;
  count: number;
  total_ugx: number;
};

export type NightAuditBookingIssue = {
  id: string;
  reference: string;
  guest_full_name: string;
  room_type_title: string;
  room_unit_name: string | null;
  status: BookingStatus;
  check_in: string;
  check_out: string;
  total_charges_ugx: number;
  total_paid_ugx: number;
  balance_due_ugx: number;
  issue_type: "pending_payment" | "open_balance";
};

export type NightAuditSummary = {
  business_date: string;
  total_units: number;
  occupied_room_nights: number;
  occupancy_percent: number;
  arrivals: number;
  departures: number;
  total_charged_ugx: number;
  total_collected_ugx: number;
  cash_total_ugx: number;
  mpesa_total_ugx: number;
  card_total_ugx: number;
  transfer_total_ugx: number;
  pesapal_total_ugx: number;
  pesapal_manual_total_ugx: number;
  receipt_count: number;
  missing_receipt_count: number;
  voided_charges_count: number;
  voided_charges_amount_ugx: number;
  open_balance_count: number;
  open_balance_amount_ugx: number;
  pending_payment_count: number;
  pending_payment_amount_ugx: number;
};

export type NightAuditCloseRecord = NightAuditSummary & {
  id: string;
  closed_by_name: string | null;
  closed_at: string;
  opening_float_ugx: number;
  cash_counted_ugx: number;
  cash_difference_ugx: number;
  notes: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
};

export type NightAuditData = {
  summary: NightAuditSummary;
  paymentMethods: NightAuditPaymentMethodTotal[];
  unsettledBookings: NightAuditBookingIssue[];
  closeRecord: NightAuditCloseRecord | null;
};
