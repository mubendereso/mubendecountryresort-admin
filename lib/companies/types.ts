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
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  linked_group_count: number;
  active_group_count: number;
  outstanding_balance_ugx: number;
};

export type CompanyAccountDetail = {
  company: CompanyAccount;
  groups: ReservationGroupRow[];
};

export type CompanyPaymentAllocation = {
  id: string;
  company_payment_id: string;
  invoice_id: string;
  invoice_number: string | null;
  invoice_source_reference: string;
  group_id: string;
  group_reference: string;
  group_name: string;
  group_payment_id: string;
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
};
