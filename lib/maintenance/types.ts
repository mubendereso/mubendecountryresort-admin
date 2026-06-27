export const MAINTENANCE_STATUSES = [
  "open", "assigned", "in_progress", "waiting_parts", "on_hold", "completed", "cancelled"
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export const MAINTENANCE_CATEGORIES = [
  "plumbing", "electrical", "hvac", "furniture", "bathroom", "internet",
  "television", "appliance", "painting", "cleaning_damage", "structural",
  "pest_control", "landscaping", "other"
] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export type MaintenanceWorkOrder = {
  id: string;
  work_order_number: string;
  room_unit_id: string | null;
  room_unit_name: string | null;
  room_type_id: string | null;
  room_type_title: string | null;
  reported_by: string | null;
  reported_by_name: string | null;
  reported_by_email: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  external_vendor_name: string | null;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  title: string;
  description: string;
  reported_at: string;
  scheduled_for: string | null;
  expected_return_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_cost_ugx: number | null;
  actual_cost_ugx: number | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MaintenanceActivity = {
  id: string;
  work_order_id: string;
  actor: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  previous_status: MaintenanceStatus | null;
  new_status: MaintenanceStatus | null;
  notes: string | null;
  created_at: string;
};

export type MaintenancePhoto = {
  id: string;
  work_order_id: string;
  filename: string;
  storage_path: string;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
};

export type MaintenanceDetail = {
  workOrder: MaintenanceWorkOrder;
  activity: MaintenanceActivity[];
  photos: MaintenancePhoto[];
};

export type MaintenanceRoomOption = {
  id: string;
  unit_name: string;
  room_type_id: string;
  room_type_title: string;
};

export type MaintenanceStaffOption = {
  id: string;
  name: string;
  email: string;
  role: "staff" | "admin" | "superadmin";
};
