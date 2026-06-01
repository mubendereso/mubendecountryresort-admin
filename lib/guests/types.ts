export type GuestSummary = {
  // Stable identity used for routing/lookup: email when present, else phone.
  // Walk-in guests often have no email, so they are keyed by phone instead.
  guest_key: string;
  guest_email: string | null;
  guest_full_name: string;
  guest_phone: string | null;
  total_bookings: number;
  total_stays: number;       // confirmed + checked_in + checked_out
  total_spend_ugx: number;   // sum of quoted_total_ugx for completed stays
  first_visit: string | null; // YYYY-MM-DD
  last_visit: string | null;  // YYYY-MM-DD
};
