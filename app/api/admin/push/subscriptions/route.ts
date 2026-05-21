import { after, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import {
  processAdminPushDispatchQueue,
  reopenNoSubscriberDispatches
} from "@/lib/push/admin-booking-notifications";
import { AdminAuthorizationError, requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { z } from "zod";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(256)
  })
});

export async function POST(request: Request) {
  try {
    await requireApprovedAdminRole();

    const contentLength = request.headers.get("content-length");
    if (contentLength && Number(contentLength) > 16 * 1024) {
      return NextResponse.json({ message: "Payload too large." }, { status: 413 });
    }

    const raw = await request.json().catch(() => null);
    const parsed = subscriptionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid push subscription." }, { status: 400 });
    }

    const { endpoint, keys } = parsed.data;
    const sql = getSql();
    const now = new Date().toISOString();

    const [row] = (await sql`
      INSERT INTO admin_push_subscriptions (endpoint, p256dh, auth, last_seen_at, updated_at)
      VALUES (${endpoint}, ${keys.p256dh}, ${keys.auth}, ${now}, ${now})
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh       = EXCLUDED.p256dh,
        auth         = EXCLUDED.auth,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at   = EXCLUDED.updated_at
      RETURNING id, endpoint, last_seen_at
    `) as { id: string; endpoint: string; last_seen_at: string }[];

    after(async () => {
      try {
        await reopenNoSubscriberDispatches(10);
        await processAdminPushDispatchQueue(5);
      } catch (err) {
        console.error("admin_push_after_subscribe_failed", err);
      }
    });

    return NextResponse.json({ ok: true, subscriptionId: row.id, endpoint: row.endpoint });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save subscription.";
    const status = error instanceof AdminAuthorizationError ? error.status : 500;
    return NextResponse.json({ message }, { status });
  }
}
