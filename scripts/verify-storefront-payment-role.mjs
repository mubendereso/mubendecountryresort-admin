#!/usr/bin/env node

import assert from "node:assert/strict";
import { neonConfig, Pool } from "@neondatabase/serverless";

if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL.");
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const legacy = await pool.query(`
    select
      (
        has_any_column_privilege('mcr_storefront_app', 'public.bookings', 'SELECT')
        or has_any_column_privilege('mcr_storefront_app', 'public.bookings', 'INSERT')
        or has_any_column_privilege('mcr_storefront_app', 'public.bookings', 'UPDATE')
        or has_table_privilege('mcr_storefront_app', 'public.bookings', 'DELETE')
      )
        as storefront_has_booking_dml,
      (
        has_any_column_privilege('mcr_storefront_app', 'public.payment_attempts', 'SELECT')
        or has_any_column_privilege('mcr_storefront_app', 'public.payment_attempts', 'INSERT')
        or has_any_column_privilege('mcr_storefront_app', 'public.payment_attempts', 'UPDATE')
        or has_table_privilege('mcr_storefront_app', 'public.payment_attempts', 'DELETE')
      )
        as storefront_has_attempt_dml,
      (
        has_any_column_privilege('mcr_storefront_app', 'public.pending_payment_recoveries', 'SELECT')
        or has_any_column_privilege('mcr_storefront_app', 'public.pending_payment_recoveries', 'INSERT')
        or has_any_column_privilege('mcr_storefront_app', 'public.pending_payment_recoveries', 'UPDATE')
        or has_table_privilege('mcr_storefront_app', 'public.pending_payment_recoveries', 'DELETE')
      )
        as storefront_has_recovery_dml,
      has_function_privilege(
        'mcr_storefront_app',
        'public.confirm_booking_payment(uuid,text,text,bigint)',
        'EXECUTE'
      ) as storefront_can_confirm
  `);

  const legacyResult = legacy.rows[0];
  assert.equal(legacyResult.storefront_has_booking_dml, false, "storefront still has booking DML");
  assert.equal(legacyResult.storefront_has_attempt_dml, false, "storefront still has payment-attempt DML");
  assert.equal(legacyResult.storefront_has_recovery_dml, false, "storefront still has recovery DML");
  assert.equal(legacyResult.storefront_can_confirm, false, "storefront can still confirm payments");

  const { rows } = await pool.query(`
    select
      exists (
        select 1 from pg_roles where rolname = 'mcr_payment_reconciler'
      ) as reconciler_role_exists,
      has_function_privilege(
        'mcr_storefront_app',
        'public.create_online_booking_with_payment_capability(text,date,date,integer,integer,text,text,text,text)',
        'EXECUTE'
      ) as storefront_can_create_capability_booking,
      has_function_privilege(
        'mcr_storefront_app',
        'public.start_storefront_payment_attempt(uuid,uuid)',
        'EXECUTE'
      ) as storefront_can_start_attempt,
      has_function_privilege(
        'mcr_payment_reconciler',
        'public.apply_payment_recovery_outcome(uuid,text,text,text,text,bigint,text,text,jsonb)',
        'EXECUTE'
      ) as reconciler_can_apply_outcome,
      (
        has_any_column_privilege('mcr_payment_reconciler', 'public.bookings', 'SELECT')
        or has_any_column_privilege('mcr_payment_reconciler', 'public.bookings', 'INSERT')
        or has_any_column_privilege('mcr_payment_reconciler', 'public.bookings', 'UPDATE')
        or has_table_privilege('mcr_payment_reconciler', 'public.bookings', 'DELETE')
      ) as reconciler_has_booking_dml
  `);

  const result = rows[0];
  assert.equal(result.reconciler_role_exists, true, "reconciler role is missing");
  assert.equal(
    result.storefront_can_create_capability_booking,
    true,
    "storefront cannot create capability-bound bookings"
  );
  assert.equal(result.storefront_can_start_attempt, true, "storefront cannot start guarded attempts");
  assert.equal(result.reconciler_can_apply_outcome, true, "reconciler cannot apply verified outcomes");
  assert.equal(result.reconciler_has_booking_dml, false, "reconciler has direct booking DML");

  console.log("Storefront payment-role privileges are hardened.");
} finally {
  await pool.end();
}
