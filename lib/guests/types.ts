export type GuestSummary = {
  // Stable identity used for routing/lookup: email when present, else phone.
  // Walk-in guests often have no email, so they are keyed by phone instead.
  guest_key: string;
  guest_email: string | null;
  guest_full_name: string;
  guest_phone: string | null;
  total_bookings: number;
  total_stays: number;        // checked-in + checked-out stays
  total_spend_ugx: number;    // recorded payments, including verified online payments
  first_visit: string | null; // YYYY-MM-DD
  last_visit: string | null;  // YYYY-MM-DD
  next_arrival: string | null; // YYYY-MM-DD
  next_room_type_title: string | null;
};
