import type { ReservationGroupRow } from "@/lib/groups/types";

export type CompanyAccount = {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_address: string | null;
  tax_id: string | null;
  payment_terms_days: number;
  credit_limit_ugx: number;
  notes: string | null;
  is_active: boolean;
  is_suspended: boolean;
  suspended_at: string | null;
  suspended_by: string | null;
  suspended_by_name: string | null;
  suspension_reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  linked_group_count: number;
  active_group_count: number;
  outstanding_balance_ugx: number;
};

export type CompanyCreditStatus = "clear" | "warning" | "over_limit" | "overdue" | "suspended";

export type CompanyCreditAssessment = {
  company_account_id: string;
  is_active: boolean;
  is_suspended: boolean;
  credit_status: CompanyCreditStatus;
  credit_limit_ugx: number;
  total_open_invoices_ugx: number;
  overdue_invoices_ugx: number;
  overdue_invoice_count: number;
  current_group_exposure_ugx: number;
  current_booking_exposure_ugx: number;
  unbilled_group_exposure_ugx: number;
  unbilled_booking_exposure_ugx: number;
  total_credit_exposure_ugx: number;
  available_credit_ugx: number;
  aging_current_ugx: number;
  aging_1_30_ugx: number;
  aging_31_60_ugx: number;
  aging_61_90_ugx: number;
  aging_90_plus_ugx: number;
};

export type CompanyRoomRate = {
  id: string;
  company_account_id: string;
  room_type_id: string;
  room_type_slug: string;
  room_type_title: string;
  public_rate_ugx: number;
  rate_ugx: number;
  valid_from: string;
  valid_to: string | null;
  status: "active" | "archived";
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyBookingExposure = {
  id: string;
  reference: string;
  guest_full_name: string;
  room_type_title: string;
  check_in: string;
  check_out: string;
  status: string;
  total_charges_ugx: number;
  total_paid_ugx: number;
  balance_due_ugx: number;
};

export type CompanyAccountDetail = {
  company: CompanyAccount;
  groups: ReservationGroupRow[];
  bookings: CompanyBookingExposure[];
  rates: CompanyRoomRate[];
  credit: CompanyCreditAssessment;
};

export type CompanyPaymentAllocation = {
  id: string;
  company_payment_id: string;
  invoice_id: string;
  invoice_number: string | null;
  invoice_source_reference: string;
  group_id: string | null;
  group_reference: string | null;
  group_name: string | null;
  group_payment_id: string | null;
  booking_id: string | null;
  booking_reference: string | null;
  guest_name: string | null;
  folio_payment_id: string | null;
  amount_ugx: number;
  created_at: string;
};

export type CompanyPayment = {
  id: string;
  company_account_id: string;
  amount_ugx: number;
  method: string;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  recorded_at: string;
  allocated_amount_ugx: number;
  allocation_count: number;
  allocations: CompanyPaymentAllocation[];
};

export type CompanySelectOption = {
  id: string;
  company_name: string;
  contact_name: string | null;
  is_active: boolean;
  is_suspended: boolean;
  credit_status: CompanyCreditStatus;
  available_credit_ugx: number;
  overdue_invoices_ugx: number;
};
