import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AdminAuthorizationError,
  assertSameOriginRequest,
  requireApprovedAdminRole
} from "@/lib/auth/admin-role";
import { getSql } from "@/lib/db/client";
import {
  MUTATIONS,
  MutationError,
  roleAtLeast,
  type MutationContext
} from "@/lib/sync/mutations";
import type { MutationResult, PushResponse, QueuedMutation } from "@/lib/sync/protocol";

const MAX_PUSH_BODY_BYTES = 512 * 1024;

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
  mutation: QueuedMutation,
  ctx: MutationContext
): Promise<MutationResult> {
  const sql = getSql();
  const key = mutation.idempotencyKey;

  // 1. Idempotency: already applied? Replay success without re-running.
  const existing = (await sql`
    select idempotency_key from sync_applied_mutations
    where idempotency_key = ${key}
    limit 1
  `) as { idempotency_key: string }[];
  if (existing.length > 0) {
    return { idempotencyKey: key, ok: true };
  }

  // 2. Known mutation type?
  const def = MUTATIONS[mutation.type];
  if (!def) {
    return {
      idempotencyKey: key,
      ok: false,
      error: `Unknown mutation type: ${mutation.type}`,
      retryable: false
    };
  }

  // 3. Authorization — re-checked server-side against the live role.
  if (!roleAtLeast(ctx.actorRole, def.minRole)) {
    return {
      idempotencyKey: key,
      ok: false,
      error: "Not authorized for this action.",
      retryable: false
    };
  }

  // 4. Apply + record audit + record idempotency.
  try {
    const { audit } = await def.run(mutation.payload, ctx);

    await sql`
      insert into audit_log
        (actor_id, actor_email, action, entity_type, entity_id, summary, context)
      values
        (${ctx.actorId}, ${ctx.actorEmail}, ${audit.action}, ${audit.entityType},
         ${audit.entityId}, ${audit.summary},
         ${audit.context ? JSON.stringify(audit.context) : null})
    `;

    await sql`
      insert into sync_applied_mutations (idempotency_key, mutation_type, result)
      values (${key}, ${mutation.type}, ${JSON.stringify({ ok: true })})
      on conflict (idempotency_key) do nothing
    `;

    return { idempotencyKey: key, ok: true };
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
  try {
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

    const ctx: MutationContext = {
      actorId: session.userId,
      actorEmail: session.email,
      actorRole: session.role
    };

    const results: MutationResult[] = [];
    for (const mutation of parsed.data.mutations) {
      results.push(await applyOne(mutation, ctx));
    }

    const body: PushResponse = { results };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof AdminAuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Sync push failed." }, { status: 500 });
  }
}
