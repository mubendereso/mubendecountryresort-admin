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
  archived_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type RoomManagementRow = RoomTypeRow & {
  image_url: string | null;
  occupied_count: number;
  available_count: number;
  out_of_order_count: number;
};

export type RoomManagementSummary = {
  roomTypes: number;
  totalRooms: number;
  availableRooms: number;
  occupiedRooms: number;
  outOfOrderRooms: number;
  publishedRoomTypes: number;
  draftRoomTypes: number;
  archivedRoomTypes: number;
};

export type GroupBookingRoomOption = {
  id: string;
  slug: string;
  title: string;
  price_ugx: number;
  inventory_count: number;
  available_count: number;
  is_published: boolean;
  archived_at: string | null;
  sort_order: number;
};
