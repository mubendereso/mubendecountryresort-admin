import type { BookingRow } from "@/lib/bookings/types";

export type ReservationGroupRow = {
  id: string;
  reference: string;
  group_name: string;
  organizer_name: string | null;
  organizer_email: string | null;
  organizer_phone: string | null;
  notes: string | null;
  booking_count: number;
  guest_count: number;
  total_charges_ugx: number;
  total_paid_ugx: number;
  balance_due_ugx: number;
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

export type ReservationGroupDetailData = {
  group: ReservationGroupRow;
  bookings: BookingRow[];
  attachableBookings: BookingRow[];
  auditEvents: ReservationGroupAuditEvent[];
};
