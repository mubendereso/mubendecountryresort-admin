export type GuestSummary = {
  guest_email: string;
  guest_full_name: string;
  guest_phone: string | null;
  total_bookings: number;
  total_stays: number;       // confirmed + checked_in + checked_out
  total_spend_ugx: number;   // sum of quoted_total_ugx for completed stays
  first_visit: string | null; // YYYY-MM-DD
  last_visit: string | null;  // YYYY-MM-DD
};
