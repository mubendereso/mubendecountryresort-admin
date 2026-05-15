export type RoomTypeRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  overview: string | null;
  price_ugx: number;
  cover_image_url: string | null;
  details: string[];
  amenities: string[];
  dining_hours: string[];
  gallery: string[];
  inventory_count: number;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AvailabilityBookingRow = {
  reference: string;
  check_in: string;
  check_out: string;
  guest_full_name: string;
  status: string;
  expires_at: string | null;
};
