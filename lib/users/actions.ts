"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db/client";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
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
  await sql`UPDATE admin_users SET role = ${newRole} WHERE id = ${targetId}::uuid`;
  // Kill active sessions so the new role takes effect on their next sign-in
  await sql`DELETE FROM admin_sessions WHERE user_id = ${targetId}::uuid`;
  revalidatePath("/users");
}

export async function setActiveAction(formData: FormData): Promise<void> {
  const session = await requireApprovedAdminRole();
  if (session.role !== "superadmin") throw new Error("Superadmin only.");

  const targetId = formData.get("userId") as string;
  const active = formData.get("active") === "true";

  if (targetId === session.userId) throw new Error("Cannot deactivate yourself.");

  const sql = getSql();
  await sql`UPDATE admin_users SET is_active = ${active} WHERE id = ${targetId}::uuid`;
  if (!active) {
    await sql`DELETE FROM admin_sessions WHERE user_id = ${targetId}::uuid`;
  }
  revalidatePath("/users");
}
