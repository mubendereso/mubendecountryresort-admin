"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { recordAuditLog } from "@/lib/audit/log";
import type { AdminRole } from "@/lib/auth/session";

const VALID_ROLES = new Set<AdminRole>(["staff", "admin", "superadmin"]);

export async function changeRoleAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  if (session.role !== "superadmin") throw new Error("Superadmin only.");

  const targetId = formData.get("userId") as string;
  const newRole = formData.get("role") as AdminRole;

  if (targetId === session.userId) throw new Error("Cannot change your own role.");
  if (!VALID_ROLES.has(newRole)) throw new Error("Invalid role.");

  const sql = getSql();
  const before = (await sql`
    SELECT id::text, email, full_name, role
    FROM admin_users
    WHERE id = ${targetId}::uuid
    LIMIT 1
  `) as { id: string; email: string; full_name: string | null; role: AdminRole }[];
  const beforeUser = before[0];
  if (!beforeUser) throw new Error("User not found.");

  const rows = (await sql`
    UPDATE admin_users
    SET role = ${newRole}
    WHERE id = ${targetId}::uuid
    RETURNING id::text, email, full_name, ${newRole}::text AS new_role
  `) as { id: string; email: string; full_name: string | null; new_role: AdminRole }[];
  const user = rows[0];
  if (!user) throw new Error("User not found.");

  // Kill active sessions so the new role takes effect on their next sign-in
  await sql`DELETE FROM admin_sessions WHERE user_id = ${targetId}::uuid`;

  await recordAuditLog({
    actorId: session.userId,
    actorEmail: session.email,
    action: "admin_user.role_changed",
    entityType: "admin_user",
    entityId: user.id,
    summary: `Changed ${user.full_name ?? user.email} role to ${newRole}.`,
    context: {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      fromRole: beforeUser.role,
      toRole: user.new_role,
      sessionsRevoked: true
    }
  });

  revalidatePath("/users");
}

export async function setActiveAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  if (session.role !== "superadmin") throw new Error("Superadmin only.");

  const targetId = formData.get("userId") as string;
  const active = formData.get("active") === "true";

  if (targetId === session.userId) throw new Error("Cannot deactivate yourself.");

  const sql = getSql();
  const before = (await sql`
    SELECT id::text, email, full_name, is_active
    FROM admin_users
    WHERE id = ${targetId}::uuid
    LIMIT 1
  `) as { id: string; email: string; full_name: string | null; is_active: boolean }[];
  const beforeUser = before[0];
  if (!beforeUser) throw new Error("User not found.");

  await sql`UPDATE admin_users SET is_active = ${active} WHERE id = ${targetId}::uuid`;
  if (!active) {
    await sql`DELETE FROM admin_sessions WHERE user_id = ${targetId}::uuid`;
  }
  if (beforeUser.is_active !== active) {
    await recordAuditLog({
      actorId: session.userId,
      actorEmail: session.email,
      action: active ? "admin_user.activated" : "admin_user.deactivated",
      entityType: "admin_user",
      entityId: beforeUser.id,
      summary: `${active ? "Activated" : "Deactivated"} ${beforeUser.full_name ?? beforeUser.email}.`,
      context: {
        userId: beforeUser.id,
        email: beforeUser.email,
        fullName: beforeUser.full_name,
        fromActive: beforeUser.is_active,
        toActive: active,
        sessionsRevoked: !active
      }
    });
  }
  revalidatePath("/users");
}
