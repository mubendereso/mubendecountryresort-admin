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

export type CompanySelectOption = {
  id: string;
  company_name: string;
  contact_name: string | null;
  is_active: boolean;
};
