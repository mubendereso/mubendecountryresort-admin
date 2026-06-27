import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getMaintenanceDetail, listMaintenanceRoomOptions, listMaintenanceStaffOptions } from "@/lib/maintenance/data";
import { MaintenanceDetailClient } from "./maintenance-detail-client";

export const dynamic = "force-dynamic";

export default async function MaintenanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireApprovedAdminRole();
  const { id } = await params;
  const [detail, rooms, staff] = await Promise.all([getMaintenanceDetail(id), listMaintenanceRoomOptions(), listMaintenanceStaffOptions()]);
  return <MaintenanceDetailClient workOrderId={id} initialDetail={detail} rooms={rooms} staff={staff} session={session} />;
}
