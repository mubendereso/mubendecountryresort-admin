import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Pool } from "@neondatabase/serverless";
import {
  AdminAuthorizationError,
  assertSameOriginRequest,
  requireApprovedAdminRole
} from "@/lib/auth/admin-role";
import { getDatabaseUrl } from "@/lib/env";
import { createTransactionPool, withTransaction } from "@/lib/db/sql";
import {
  MUTATIONS,
  MutationError,
  roleAtLeast,
  type MutationContext
} from "@/lib/sync/mutations";
import { decideLedgerReplay, hashQueuedMutation } from "@/lib/sync/atomicity";
import type { MutationResult, PushResponse, QueuedMutation } from "@/lib/sync/protocol";

const MAX_PUSH_BODY_BYTES = 2 * 1024 * 1024;

const pushSchema = z.object({
  mutations: z
    .array(
      z.object({
        idempotencyKey: z.string().uuid(),
        type: z.string().min(1),
        payload: z.record(z.string(), z.unknown())
      })
    )
    .max(100)
});

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function applyOne(
  pool: Pool,
  mutation: QueuedMutation,
  ctx: Omit<MutationContext, "sql">
): Promise<MutationResult> {
  const key = mutation.idempotencyKey;
  const requestHash = await hashQueuedMutation(mutation);

  try {
    return await withTransaction(pool, async (sql) => {
      const inserted = (await sql`
        insert into sync_applied_mutations (idempotency_key, mutation_type, request_hash)
        values (${key}, ${mutation.type}, ${requestHash})
        on conflict (idempotency_key) do nothing
        returning idempotency_key
      `) as { idempotency_key: string }[];

      if (inserted.length === 0) {
        const existing = (await sql`
          select request_hash
          from sync_applied_mutations
          where idempotency_key = ${key}
          limit 1
        `) as { request_hash: string | null }[];

        const replay = decideLedgerReplay(existing[0]?.request_hash ?? null, requestHash);
        if (replay === "conflict") {
          throw new MutationError("Idempotency key reused for a different mutation payload.", false);
        }

        return { idempotencyKey: key, ok: true };
      }

      const def = MUTATIONS[mutation.type];
      if (!def) {
        throw new MutationError(`Unknown mutation type: ${mutation.type}`, false);
      }

      if (!roleAtLeast(ctx.actorRole, def.minRole)) {
        throw new MutationError("Not authorized for this action.", false);
      }

      const mutationContext: MutationContext = { ...ctx, mutationId: key, sql };
      const { audit } = await def.run(mutation.payload, mutationContext);

      await sql`
        insert into audit_log
          (actor_id, actor_email, action, entity_type, entity_id, summary, context)
        values
          (${ctx.actorId}, ${ctx.actorEmail}, ${audit.action}, ${audit.entityType},
           ${audit.entityId}, ${audit.summary},
           ${audit.context ? JSON.stringify(audit.context) : null})
      `;

      await sql`
        update sync_applied_mutations
        set result = ${JSON.stringify({ ok: true })}::jsonb
        where idempotency_key = ${key}
      `;

      return { idempotencyKey: key, ok: true };
    });
  } catch (err) {
    if (err instanceof MutationError) {
      return { idempotencyKey: key, ok: false, error: err.message, retryable: err.retryable };
    }
    if (err instanceof z.ZodError) {
      return {
        idempotencyKey: key,
        ok: false,
        error: "Invalid mutation payload.",
        retryable: false
      };
    }
    // Unknown error — likely transient (DB hiccup). Keep it in the outbox.
    return { idempotencyKey: key, ok: false, error: errorMessage(err), retryable: true };
  }
}

export async function POST(request: NextRequest) {
  let pool: Pool | null = null;
  try {
    pool = createTransactionPool(getDatabaseUrl());
    assertSameOriginRequest(request);
    const session = await requireApprovedAdminRole();

    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_PUSH_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    }

    const parsed = pushSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid push request." }, { status: 400 });
    }

    const ctx: Omit<MutationContext, "sql"> = {
      actorId: session.userId,
      actorEmail: session.email,
      actorRole: session.role
    };

    const results: MutationResult[] = [];
    for (const mutation of parsed.data.mutations) {
      results.push(await applyOne(pool, mutation, ctx));
    }

    const body: PushResponse = { results };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof AdminAuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Sync push failed." }, { status: 500 });
  } finally {
    await pool?.end().catch(() => undefined);
  }
}
