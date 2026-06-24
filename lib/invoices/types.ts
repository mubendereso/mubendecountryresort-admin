export type InvoiceType = "booking" | "group";
export type InvoiceStatus = "draft" | "issued" | "voided";

export type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  booking_id: string | null;
  group_id: string | null;
  company_account_id: string | null;
  source_reference: string;
  source_title: string;
  bill_to_name: string;
  bill_to_contact: string | null;
  bill_to_email: string | null;
  bill_to_phone: string | null;
  bill_to_address: string | null;
  tax_id: string | null;
  stay_start: string | null;
  stay_end: string | null;
  payment_terms_days: number;
  due_date: string | null;
  total_charges_ugx: number;
  total_paid_ugx: number;
  balance_due_ugx: number;
  current_paid_ugx: number;
  current_balance_due_ugx: number;
  payment_status: "draft" | "voided" | "unpaid" | "part_paid" | "paid" | "overdue";
  days_overdue: number;
  aging_bucket: "draft" | "voided" | "paid" | "current" | "1_30" | "31_60" | "61_90" | "90_plus";
  note: string | null;
  source_snapshot: Record<string, unknown>;
  created_by: string | null;
  created_by_name: string | null;
  issued_by: string | null;
  issued_by_name: string | null;
  voided_by: string | null;
  voided_by_name: string | null;
  created_at: string;
  updated_at: string;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
};

export type InvoiceLine = {
  id: string;
  invoice_id: string;
  line_order: number;
  description: string;
  category: string;
  quantity: number;
  unit_amount_ugx: number;
  amount_ugx: number;
  source_charge_id: string | null;
  created_at: string;
};

export type InvoiceDetail = {
  invoice: InvoiceRow;
  lines: InvoiceLine[];
};

export type InvoiceActionResult =
  | { ok: true; invoiceId: string }
  | { ok: false; error: string };
