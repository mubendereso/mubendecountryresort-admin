import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { listMaintenanceRoomOptions, listMaintenanceStaffOptions } from "@/lib/maintenance/data";
import { MaintenanceCreateForm } from "./maintenance-create-form";

export default async function NewMaintenanceWorkOrderPage() {
  const session = await requireApprovedAdminRole();
  const [rooms, staff] = await Promise.all([listMaintenanceRoomOptions(), listMaintenanceStaffOptions()]);
  return <MaintenanceCreateForm rooms={rooms} staff={staff} session={session} />;
}
