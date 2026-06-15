export type FolioCategory =
  | "accommodation"
  | "food"
  | "beverage"
  | "other"
  | "tax"
  | "discount";

export type PaymentMethod =
  | "pesapal"
  | "pesapal_manual"
  | "cash"
  | "mpesa"
  | "card"
  | "transfer";

export type FolioCharge = {
  id: string;
  booking_id: string;
  description: string;
  amount_ugx: number;
  category: FolioCategory;
  discount_scope: "room_price" | null;
  posted_by: string | null;
  posted_by_name: string | null;
  posted_at: string; // ISO 8601 UTC
  voided_at: string | null;
  voided_by: string | null;
};

export type FolioPayment = {
  id: string;
  booking_id: string;
  amount_ugx: number;
  method: PaymentMethod;
  reference: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  recorded_at: string; // ISO 8601 UTC
};

export type FolioData = {
  charges: FolioCharge[];
  payments: FolioPayment[];
};
