import "server-only";

import { getSql } from "@/lib/db/client";
import type { AdminRole } from "@/lib/auth/session";

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
  is_active: boolean;
  last_signed_in_at: string | null; // ISO 8601 UTC or null
  created_at: string;               // ISO 8601 UTC
};

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const sql = getSql();
  return (await sql`
    SELECT
      id::text,
      email,
      full_name,
      role,
      is_active,
      to_char(last_signed_in_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_signed_in_at,
      to_char(created_at        AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM admin_users
    ORDER BY
      CASE role
        WHEN 'superadmin' THEN 0
        WHEN 'admin'      THEN 1
        ELSE                   2
      END,
      email ASC
  `) as AdminUserRow[];
}
