import "server-only";

import { getSql } from "@/lib/db/client";

export type AuditContext = Record<string, unknown> | null | undefined;

export type AuditLogInput = {
  actorId: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  context?: AuditContext;
};

export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  const sql = getSql();
  await sql`
    insert into audit_log
      (actor_id, actor_email, action, entity_type, entity_id, summary, context)
    values
      (
        ${input.actorId}::uuid,
        ${input.actorEmail},
        ${input.action},
        ${input.entityType},
        ${input.entityId}::uuid,
        ${input.summary},
        ${input.context ? JSON.stringify(input.context) : null}
      )
  `;
}
