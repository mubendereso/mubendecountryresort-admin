import "server-only";

import { getSql } from "@/lib/db/client";
import { requireEnv } from "@/lib/env";
import { sendWebPush, hashTopic } from "@/lib/push/webcrypto-push";

const MAX_ACTIVE_SUBSCRIPTIONS = 10;
const MAX_DISPATCH_ATTEMPTS = 5;
const NO_SUBSCRIBER_RETRY_DELAY_MS = 5 * 60_000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000, 60 * 60_000];

async function buildPushTopic(tag: string): Promise<string> {
  return hashTopic(tag);
}

function getRetryDelayMs(attemptCount: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1)];
}

type AdminPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type AdminPushDispatch = {
  id: string;
  booking_id: string;
  status: string;
  attempt_count: number;
};

type BookingSummary = {
  id: string;
  reference: string;
  guest_full_name: string;
  room_title: string;
  check_in: string;
  check_out: string;
};

function buildNotificationPayload(booking: BookingSummary) {
  const checkIn = new Date(booking.check_in);
  const checkOut = new Date(booking.check_out);
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
  return {
    title: "New booking confirmed",
    body: `${booking.reference} — ${booking.guest_full_name}, ${nights} night${nights !== 1 ? "s" : ""}`,
    tag: `admin-new-booking:${booking.id}`,
    data: {
      bookingId: booking.id,
      url: "/bookings"
    }
  };
}

async function getBookingSummary(bookingId: string): Promise<BookingSummary | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT b.id, b.reference, b.guest_full_name,
      rt.title AS room_title,
      b.check_in::text AS check_in,
      b.check_out::text AS check_out
    FROM bookings b
    JOIN room_types rt ON rt.id = b.room_type_id
    WHERE b.id = ${bookingId}::uuid
    LIMIT 1
  `) as BookingSummary[];
  return rows[0] ?? null;
}

async function listSubscriptions(): Promise<AdminPushSubscription[]> {
  const sql = getSql();
  return (await sql`
    SELECT id, endpoint, p256dh, auth
    FROM admin_push_subscriptions
    ORDER BY last_seen_at DESC, created_at DESC
    LIMIT ${MAX_ACTIVE_SUBSCRIPTIONS}
  `) as AdminPushSubscription[];
}

async function listReceivedSubscriptionIds(dispatchId: string): Promise<Set<string>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT subscription_id FROM admin_push_dispatch_receipts WHERE dispatch_id = ${dispatchId}::uuid
  `) as { subscription_id: string }[];
  return new Set(rows.map((r) => r.subscription_id));
}

async function recordReceipt(dispatchId: string, subscriptionId: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO admin_push_dispatch_receipts (dispatch_id, subscription_id)
    VALUES (${dispatchId}::uuid, ${subscriptionId}::uuid)
    ON CONFLICT (dispatch_id, subscription_id) DO NOTHING
  `;
}

async function deleteStaleSubscription(subscriptionId: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM admin_push_subscriptions WHERE id = ${subscriptionId}::uuid`.catch((err) => {
    console.error("admin_push_subscription_delete_failed", subscriptionId, err);
  });
}

async function updateDispatch(
  dispatchId: string,
  update: { status: string; nextAttemptAt?: Date | null; completedAt?: Date | null; lastError?: string | null }
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE admin_push_dispatches SET
      status          = ${update.status},
      next_attempt_at = ${update.nextAttemptAt?.toISOString() ?? null},
      completed_at    = ${update.completedAt?.toISOString() ?? null},
      last_error      = ${update.lastError ?? null},
      updated_at      = now()
    WHERE id = ${dispatchId}::uuid
  `;
}

type SendOutcome = { status: "sent" } | { status: "stale" } | { status: "retryable"; error: string };

async function sendToSubscription(
  subscription: AdminPushSubscription,
  payload: ReturnType<typeof buildNotificationPayload>
): Promise<SendOutcome> {
  try {
    const result = await sendWebPush({
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      payload,
      vapidSubject: requireEnv("VAPID_SUBJECT"),
      vapidPublicKey: requireEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
      vapidPrivateKey: requireEnv("VAPID_PRIVATE_KEY"),
      topic: await buildPushTopic(payload.tag),
      ttl: 300,
    });

    if (result.status === 404 || result.status === 410) {
      return { status: "stale" };
    }
    if (!result.ok) {
      return { status: "retryable", error: `HTTP ${result.status}` };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "retryable", error: err instanceof Error ? err.message : "unknown" };
  }
}

async function processDispatch(dispatch: AdminPushDispatch): Promise<void> {
  const booking = await getBookingSummary(dispatch.booking_id);

  if (!booking) {
    await updateDispatch(dispatch.id, {
      status: "failed",
      completedAt: new Date(),
      lastError: "booking_not_found"
    });
    return;
  }

  const subscriptions = await listSubscriptions();

  if (subscriptions.length === 0) {
    await updateDispatch(dispatch.id, {
      status: "no_subscribers",
      nextAttemptAt: new Date(Date.now() + NO_SUBSCRIBER_RETRY_DELAY_MS),
      lastError: "no_active_subscriptions"
    });
    return;
  }

  const receivedIds = await listReceivedSubscriptionIds(dispatch.id);
  const pending = subscriptions.filter((s) => !receivedIds.has(s.id));

  if (pending.length === 0) {
    await updateDispatch(dispatch.id, { status: "succeeded", completedAt: new Date(), lastError: null });
    return;
  }

  const payload = buildNotificationPayload(booking);
  let retryableError: string | null = null;
  let hasRetryable = false;

  for (const sub of pending) {
    const outcome = await sendToSubscription(sub, payload);

    if (outcome.status === "sent") {
      await recordReceipt(dispatch.id, sub.id);
    } else if (outcome.status === "stale") {
      await deleteStaleSubscription(sub.id);
    } else {
      hasRetryable = true;
      retryableError = outcome.error;
      console.error("admin_booking_push_send_failed", { dispatchId: dispatch.id, subscriptionId: sub.id, error: outcome.error });
    }
  }

  if (hasRetryable) {
    if (dispatch.attempt_count >= MAX_DISPATCH_ATTEMPTS) {
      await updateDispatch(dispatch.id, { status: "failed", completedAt: new Date(), lastError: retryableError });
    } else {
      await updateDispatch(dispatch.id, {
        status: "pending",
        nextAttemptAt: new Date(Date.now() + getRetryDelayMs(dispatch.attempt_count)),
        lastError: retryableError
      });
    }
    return;
  }

  await updateDispatch(dispatch.id, { status: "succeeded", completedAt: new Date(), lastError: null });
}

export async function processAdminPushDispatchQueue(limit = 5): Promise<number> {
  const sql = getSql();
  const dispatches = (await sql`
    SELECT * FROM claim_admin_push_dispatches(${limit}::int)
  `) as AdminPushDispatch[];

  if (dispatches.length === 0) return 0;

  await Promise.all(dispatches.map(processDispatch));
  return dispatches.length;
}

export async function reopenNoSubscriberDispatches(limit = 10): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE admin_push_dispatches SET
      status          = 'pending',
      next_attempt_at = now(),
      completed_at    = null,
      last_error      = 'subscriber_available_retry',
      updated_at      = now()
    WHERE id IN (
      SELECT id FROM admin_push_dispatches
      WHERE status = 'no_subscribers'
      ORDER BY created_at DESC
      LIMIT ${limit}
    )
  `;
}
