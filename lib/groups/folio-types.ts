import type { BookingRow } from "@/lib/bookings/types";
import type { FolioCharge, FolioPayment, PaymentMethod } from "@/lib/folios/types";
import type { ReservationGroupRow } from "./types";

export type GroupFolioPayment = {
  id: string;
  group_id: string;
  amount_ugx: number;
  method: Exclude<PaymentMethod, "pesapal">;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  recorded_at: string;
  allocated_amount_ugx: number;
  allocation_count: number;
};

export type GroupFolioAllocation = {
  id: string;
  group_payment_id: string;
  booking_id: string;
  booking_reference: string;
  guest_full_name: string;
  folio_payment_id: string;
  receipt_id: string | null;
  receipt_number: string | null;
  amount_ugx: number;
  created_at: string;
};

export type GroupFolioBooking = BookingRow & {
  charges: FolioCharge[];
  payments: FolioPayment[];
};

export type GroupFolioData = {
  group: ReservationGroupRow;
  bookings: GroupFolioBooking[];
  groupPayments: GroupFolioPayment[];
  allocations: GroupFolioAllocation[];
};
