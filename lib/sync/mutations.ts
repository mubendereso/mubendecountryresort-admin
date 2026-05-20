import "server-only";

import { z } from "zod";
import { getSql } from "@/lib/db/client";
import type { AdminRole } from "@/lib/auth/session";

// Server-side registry of mutation types the sync push endpoint knows how to
// apply. Each queued client mutation names one of these. The handler:
//   - validates the payload (zod)
//   - applies the change to Neon
//   - returns an audit entry describing what happened
//
// Authorization (minRole) and idempotency/audit recording are handled by the
// push route around these handlers — keep handlers focused on the change
// itself.

const ROLE_RANK: Record<AdminRole, number> = {
  staff: 1,
  admin: 2,
  superadmin: 3
};

export function roleAtLeast(role: AdminRole, min: AdminRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export class MutationError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "MutationError";
    this.retryable = retryable;
  }
}

export type MutationContext = {
  actorId: string;
  actorEmail: string | null;
  actorRole: AdminRole;
};

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  context?: Record<string, unknown>;
};

export type MutationDef = {
  minRole: AdminRole;
  run: (rawPayload: unknown, ctx: MutationContext) => Promise<{ audit: AuditEntry }>;
};

const contactMarkSchema = z.object({
  contactId: z.string().uuid(),
  status: z.enum(["new", "read", "archived"])
});

export const MUTATIONS: Record<string, MutationDef> = {
  // Mark a contact submission read/archived/new. Idempotent (setting a status
  // to the same value is a no-op), so safe to retry. Offline-safe: no
  // inventory lock involved.
  "contact.mark_status": {
    minRole: "staff",
    run: async (raw, _ctx) => {
      const input = contactMarkSchema.parse(raw);
      const sql = getSql();
      const rows = (await sql`
        update contact_submissions
        set status = ${input.status}
        where id = ${input.contactId}
        returning id
      `) as { id: string }[];

      if (rows.length === 0) {
        throw new MutationError("Contact submission not found.", false);
      }

      return {
        audit: {
          action: `contact.mark_${input.status}`,
          entityType: "contact_submission",
          entityId: input.contactId,
          summary: `Marked contact submission as ${input.status}`
        }
      };
    }
  }
};
