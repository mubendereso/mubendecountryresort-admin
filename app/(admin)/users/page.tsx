import { redirect } from "next/navigation";
import { listAdminUsers } from "@/lib/users/data";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const session = await requireApprovedAdminRole();

  // Staff have no business on this page
  if (session.role === "staff") redirect("/dashboard");

  const users = await listAdminUsers();
  return (
    <UsersClient
      users={users}
      currentUserId={session.userId}
      role={session.role}
    />
  );
}
