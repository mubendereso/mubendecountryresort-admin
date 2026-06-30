#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neonConfig, Pool } from "@neondatabase/serverless";

if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("Missing DATABASE_URL.");

function withoutTransactionWrapper(sql) {
  return sql
    .replace(/^\s*begin\s*;\s*/i, "")
    .replace(/\s*commit\s*;\s*$/i, "");
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("begin");
  for (const file of [
    "db/0046_storefront_payment_role_hardening_additive.sql",
    "db/0047_storefront_payment_role_hardening_revocations.sql"
  ]) {
    const sql = await readFile(resolve(process.cwd(), file), "utf8");
    await client.query(withoutTransactionWrapper(sql));
  }

  const currentUser = (await client.query("select current_user")).rows[0].current_user;
  const quotedUser = quoteIdentifier(currentUser);
  await client.query(`grant mcr_storefront_app to ${quotedUser}`);
  await client.query(`grant mcr_payment_reconciler to ${quotedUser}`);

  const slug = `security-test-${crypto.randomUUID()}`;
  const roomType = (await client.query(
    `insert into public.room_types (slug, title, price_ugx, inventory_count, is_published)
     values ($1, 'Security Test Room', 125000, 1, true)
     returning id`,
    [slug]
  )).rows[0];
  await client.query(
    `insert into public.room_units (room_type_id, unit_name, housekeeping_status)
     values ($1, 'Security Test Unit', 'clean')`,
    [roomType.id]
  );

  await client.query("set local role mcr_storefront_app");
  const createBooking = async (email) => (await client.query(
    `select booking_id, reference, quoted_total_ugx, payment_capability
     from public.create_online_booking_with_payment_capability(
       $1, date '2036-01-10', date '2036-01-11', 1, 0,
       'Security Test Guest', $2, null, null
     )`,
    [slug, email]
  )).rows[0];

  const first = await createBooking("security-test-1@example.com");
  const second = await createBooking("security-test-2@example.com");

  await client.query("savepoint cross_booking_capability");
  await assert.rejects(
    client.query(
      `select * from public.start_storefront_payment_attempt($1::uuid, $2::uuid)`,
      [first.booking_id, second.payment_capability]
    ),
    /Invalid or expired payment capability/
  );
  await client.query("rollback to savepoint cross_booking_capability");

  const attempt = (await client.query(
    `select payment_attempt_id, reference, amount_ugx
     from public.start_storefront_payment_attempt($1::uuid, $2::uuid)`,
    [first.booking_id, first.payment_capability]
  )).rows[0];
  assert.equal(attempt.reference, first.reference);
  assert.equal(BigInt(attempt.amount_ugx), BigInt(first.quoted_total_ugx));

  const trackingId = crypto.randomUUID();
  await client.query(
    `select public.record_storefront_payment_initiation_success(
       $1::uuid, $2::uuid, $3::uuid, $4, $5
     )`,
    [
      first.booking_id,
      attempt.payment_attempt_id,
      first.payment_capability,
      trackingId,
      `https://cybqa.pesapal.com/pay/${trackingId}`
    ]
  );

  await client.query("savepoint direct_booking_update");
  await assert.rejects(
    client.query(
      "update public.bookings set status = 'confirmed' where id = $1::uuid",
      [first.booking_id]
    ),
    (error) => error?.code === "42501"
  );
  await client.query("rollback to savepoint direct_booking_update");

  await client.query("savepoint direct_confirmation");
  await assert.rejects(
    client.query(
      `select * from public.confirm_booking_payment($1::uuid, $2, 'forged', $3::bigint)`,
      [first.booking_id, trackingId, first.quoted_total_ugx]
    ),
    (error) => error?.code === "42501"
  );
  await client.query("rollback to savepoint direct_confirmation");

  await client.query("reset role");
  await client.query("set local role mcr_payment_reconciler");
  const claim = (await client.query(
    `select * from public.claim_payment_recovery_message($1::uuid, $2, 'integration-test')`,
    [first.booking_id, trackingId]
  )).rows[0];
  assert.equal(claim.claimed, true);

  const outcome = (await client.query(
    `select * from public.apply_payment_recovery_outcome(
       $1::uuid, $2, $2, 'paid', $3, $4::bigint, 'UGX', 'TEST-CONFIRMATION',
       '{"payment_status_description":"COMPLETED","currency":"UGX"}'::jsonb
     )`,
    [claim.recovery_id, trackingId, first.reference, first.quoted_total_ugx]
  )).rows[0];
  assert.equal(outcome.recovery_status, "completed");

  await client.query("reset role");
  const booking = (await client.query(
    "select status, paid_at from public.bookings where id = $1::uuid",
    [first.booking_id]
  )).rows[0];
  assert.equal(booking.status, "confirmed");
  assert.ok(booking.paid_at);

  const payment = (await client.query(
    `select amount_ugx from public.folio_payments
     where booking_id = $1::uuid and method = 'pesapal'`,
    [first.booking_id]
  )).rows[0];
  assert.equal(BigInt(payment.amount_ugx), BigInt(first.quoted_total_ugx));

  await client.query("rollback");
  console.log("Storefront and reconciler payment RPC integration passed; transaction rolled back.");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
