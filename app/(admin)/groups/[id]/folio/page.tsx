import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getGroupFolioData } from "@/lib/groups/folio-data";
import { GroupFolioClient } from "./group-folio-client";

export default async function GroupFolioPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, data] = await Promise.all([
    requireApprovedAdminRole(),
    getGroupFolioData(id)
  ]);

  if (!data) notFound();

  return (
    <div className="grid gap-6">
      <nav className="text-sm text-oliveMuted-500">
        <Link href="/groups" className="hover:underline">
          Groups
        </Link>
        <span className="mx-2">{">"}</span>
        <Link href={`/groups/${data.group.id}`} className="hover:underline">
          {data.group.group_name}
        </Link>
        <span className="mx-2">{">"}</span>
        <span>Group folio</span>
      </nav>

      <GroupFolioClient data={data} role={session.role} renderedAt={new Date().toISOString()} />
    </div>
  );
}
