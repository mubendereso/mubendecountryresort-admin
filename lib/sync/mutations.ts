import "server-only";

import { z } from "zod";
import type { AdminRole } from "@/lib/auth/session";
import type { SqlTag } from "@/lib/db/sql";
import {
  addMaintenanceNote,
  assignMaintenanceRecord,
  changeMaintenanceStatus,
  createMaintenanceRecord,
  editMaintenanceRecord
} from "@/lib/maintenance/service";
import { createMaintenancePhotoRecord } from "@/lib/maintenance/photo";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from "@/lib/maintenance/types";

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
  sql: SqlTag;
  mutationId?: string;
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

const roomUnitHousekeepingSchema = z.object({
  unitId: z.string().uuid(),
  status: z.enum([
    "dirty",
    "cleaning",
    "inspection_pending",
    "clean",
    "inspected"
  ]),
  notes: z.string().trim().max(600).nullable()
});

const nullableUuid = z.string().uuid().nullable();
const nullableDateTime = z.string().datetime().nullable();
const nullableMoney = z.number().int().nonnegative().nullable();
const maintenanceCreateSchema = z.object({
  id: z.string().uuid(), roomUnitId: nullableUuid, roomTypeId: nullableUuid,
  assignedTo: nullableUuid, externalVendorName: z.string().trim().max(500).nullable(),
  category: z.enum(MAINTENANCE_CATEGORIES), priority: z.enum(MAINTENANCE_PRIORITIES),
  title: z.string().trim().min(3).max(180), description: z.string().trim().min(5).max(5000),
  scheduledFor: nullableDateTime, expectedReturnAt: nullableDateTime, estimatedCostUgx: nullableMoney
});
const maintenanceEditSchema = maintenanceCreateSchema.omit({ id: true, roomUnitId: true, roomTypeId: true, assignedTo: true }).extend({ workOrderId: z.string().uuid() });
const maintenanceAssignSchema = z.object({ workOrderId: z.string().uuid(), assignedTo: nullableUuid, note: z.string().trim().max(500).nullable() });
const maintenanceStatusSchema = z.object({ workOrderId: z.string().uuid(), status: z.enum(MAINTENANCE_STATUSES), note: z.string().trim().max(500).nullable(), resolutionNotes: z.string().trim().max(3000).nullable(), actualCostUgx: nullableMoney });
const maintenanceNoteSchema = z.object({ workOrderId: z.string().uuid(), note: z.string().trim().min(1).max(2000) });
const maintenancePhotoSchema = z.object({
  photoId: z.string().uuid(), workOrderId: z.string().uuid(), filename: z.string().trim().min(1).max(240),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  base64: z.string().min(4).max(1_600_000)
});

function maintenanceActor(ctx: MutationContext) {
  return { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole, activityId: ctx.mutationId };
}

export const MUTATIONS: Record<string, MutationDef> = {
  // Mark a contact submission read/archived/new. Idempotent (setting a status
  // to the same value is a no-op), so safe to retry. Offline-safe: no
  // inventory lock involved.
  "contact.mark_status": {
    minRole: "staff",
    run: async (raw, _ctx) => {
      const input = contactMarkSchema.parse(raw);
      const rows = (await _ctx.sql`
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
  },
  // Update a physical room's low-risk housekeeping status. Out-of-order is
  // excluded because it affects availability and must stay online-only.
  "room_unit.update_housekeeping": {
    minRole: "staff",
    run: async (raw, _ctx) => {
      const input = roomUnitHousekeepingSchema.parse(raw);
      const rows = (await _ctx.sql`
        update room_units
        set housekeeping_status = ${input.status}, notes = ${input.notes}
        where id = ${input.unitId}
        returning id, unit_name
      `) as { id: string; unit_name: string }[];

      if (rows.length === 0) {
        throw new MutationError("Room unit not found.", false);
      }

      return {
        audit: {
          action: `room_unit.housekeeping_${input.status}`,
          entityType: "room_unit",
          entityId: input.unitId,
          summary: `Marked ${rows[0].unit_name} as ${input.status.replaceAll("_", " ")}`,
          context: { notes: input.notes }
        }
      };
    }
  },
  "maintenance.create": {
    minRole: "staff",
    run: async (raw, ctx) => {
      const input = maintenanceCreateSchema.parse(raw);
      const result = await createMaintenanceRecord(input, maintenanceActor(ctx), ctx.sql);
      return { audit: result.audit };
    }
  },
  "maintenance.edit": {
    minRole: "staff",
    run: async (raw, ctx) => {
      const input = maintenanceEditSchema.parse(raw);
      return { audit: await editMaintenanceRecord({ id: input.workOrderId, ...input }, maintenanceActor(ctx), ctx.sql) };
    }
  },
  "maintenance.assign": {
    minRole: "admin",
    run: async (raw, ctx) => {
      const input = maintenanceAssignSchema.parse(raw);
      return { audit: await assignMaintenanceRecord(input.workOrderId, input.assignedTo, input.note, maintenanceActor(ctx), ctx.sql) };
    }
  },
  "maintenance.status": {
    minRole: "staff",
    run: async (raw, ctx) => {
      const input = maintenanceStatusSchema.parse(raw);
      return { audit: await changeMaintenanceStatus({ id: input.workOrderId, ...input }, maintenanceActor(ctx), ctx.sql) };
    }
  },
  "maintenance.note": {
    minRole: "staff",
    run: async (raw, ctx) => {
      const input = maintenanceNoteSchema.parse(raw);
      return { audit: await addMaintenanceNote(input.workOrderId, input.note, maintenanceActor(ctx), ctx.sql) };
    }
  },
  "maintenance.photo_upload": {
    minRole: "staff",
    run: async (raw, ctx) => {
      const input = maintenancePhotoSchema.parse(raw);
      const result = await createMaintenancePhotoRecord(
        input,
        { userId: ctx.actorId, email: ctx.actorEmail, role: ctx.actorRole, activityId: ctx.mutationId },
        ctx.sql
      );
      return { audit: result.audit };
    }
  }
};
