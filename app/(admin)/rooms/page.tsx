import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getRoomsManagementData } from "@/lib/rooms/data";
import { RoomsManagementClient } from "./rooms-management-client";

export const dynamic = "force-dynamic";

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RoomsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, data, query] = await Promise.all([
    requireApprovedAdminRole(),
    getRoomsManagementData(),
    searchParams
  ]);

  return (
    <RoomsManagementClient
      initialRooms={data.rooms}
      summary={data.summary}
      canManage={session.role !== "staff"}
      message={first(query.message)}
    />
  );
}
