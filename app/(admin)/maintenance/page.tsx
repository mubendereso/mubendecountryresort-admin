import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { listMaintenanceRoomOptions, listMaintenanceStaffOptions, listMaintenanceWorkOrders } from "@/lib/maintenance/data";
import { MaintenanceClient } from "./maintenance-client";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const session = await requireApprovedAdminRole();
  const [workOrders, rooms, staff] = await Promise.all([
    listMaintenanceWorkOrders(), listMaintenanceRoomOptions(), listMaintenanceStaffOptions()
  ]);
  return <MaintenanceClient initialWorkOrders={workOrders} rooms={rooms} staff={staff} session={session} />;
}
