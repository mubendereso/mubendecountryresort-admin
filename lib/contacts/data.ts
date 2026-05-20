import "server-only";

import { getSql } from "@/lib/db/client";
import type { ContactSubmission } from "./types";

export type { ContactSubmission, ContactStatus } from "./types";

export async function listContactSubmissions(): Promise<ContactSubmission[]> {
  const sql = getSql();
  // to_char forces UTC ISO string so the value is serialisable across the RSC
  // boundary (Neon over HTTP would otherwise return a Date object).
  return (await sql`
    SELECT
      id::text,
      full_name,
      email,
      phone,
      subject,
      message,
      status,
      notes,
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
    FROM contact_submissions
    ORDER BY created_at DESC
    LIMIT 200
  `) as ContactSubmission[];
}
