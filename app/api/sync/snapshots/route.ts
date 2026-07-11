import { NextResponse, type NextRequest } from "next/server";
import {
  AdminAuthorizationError,
  assertSameOriginRequest,
  requireApprovedAdminRole
} from "@/lib/auth/admin-role";
import { getSql } from "@/lib/db/client";
import {
  MAX_OFFLINE_ROOM_UNITS,
  roomUnitSnapshotExceedsLimit
} from "@/lib/offline-snapshots/policy";
import type {
  BookingSnapshot,
  FolioSnapshot,
  OfflineSnapshotPayload,
  PaymentReceiptSnapshot,
  ReservationGroupSnapshot,
  RoomTypeSnapshot,
  RoomUnitSnapshot
} from "@/lib/offline-snapshots/types";

function toNumber<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T {
  const next = { ...row };
  for (const key of keys) {
    next[key] = Number(next[key] ?? 0) as T[keyof T];
  }
  return next;
}

async function offlineSessionEpoch(sessionId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`mcr-offline:${sessionId}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginRequest(request);
    const session = await requireApprovedAdminRole();

    const sql = getSql();

    const [
      generatedRows,
      bookingRows,
      roomTypeRows,
      folioRows,
      receiptRows,
      groupRows,
      roomUnitRows
    ] = await Promise.all([
      sql`select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as generated_at`,
      sql`
        with scoped_bookings as (
          select b.*
          from bookings b
          where b.check_out >= ((now() at time zone 'Africa/Kampala')::date - 14)
             or b.status in ('pending_payment', 'awaiting_confirmation', 'confirmed', 'checked_in')
             or b.updated_at >= now() - interval '30 days'
          order by b.check_in asc, b.created_at desc
          limit 700
        )
        select
          b.id::text,
          b.reference as booking_reference,
          b.guest_full_name as guest_name,
          b.guest_phone,
          b.guest_email,
          rt.title as room_type_name,
          ru.unit_name as room_unit_name,
          b.check_in::text,
          b.check_out::text,
          b.status::text,
          b.group_id::text,
          rg.group_name,
          greatest(
            0,
            coalesce(charges.total_charges, b.quoted_total_ugx) - coalesce(payments.total_paid, 0)
          )::bigint as balance_due,
          to_char(
            greatest(
              b.updated_at,
              coalesce(charges.latest_at, b.updated_at),
              coalesce(payments.latest_at, b.updated_at)
            ) at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"'
          ) as updated_at
        from scoped_bookings b
        join room_types rt on rt.id = b.room_type_id
        left join room_units ru on ru.id = b.room_unit_id
        left join reservation_groups rg on rg.id = b.group_id
        left join lateral (
          select
            sum(case when fc.category = 'discount' then -fc.amount_ugx else fc.amount_ugx end)
              filter (where fc.voided_at is null) as total_charges,
            max(coalesce(fc.voided_at, fc.posted_at)) as latest_at
          from folio_charges fc
          where fc.booking_id = b.id
        ) charges on true
        left join lateral (
          select sum(fp.amount_ugx) as total_paid, max(fp.recorded_at) as latest_at
          from folio_payments fp
          where fp.booking_id = b.id
        ) payments on true
      `,
      sql`
        select
          id::text,
          title as name,
          inventory_count,
          to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        from room_types
        where inventory_count > 0 or is_published = true
        order by sort_order asc, title asc
      `,
      sql`
        with scoped_bookings as (
          select b.*
          from bookings b
          where b.check_out >= ((now() at time zone 'Africa/Kampala')::date - 14)
             or b.status in ('pending_payment', 'awaiting_confirmation', 'confirmed', 'checked_in')
             or b.updated_at >= now() - interval '30 days'
          order by b.check_in asc, b.created_at desc
          limit 700
        )
        select
          b.id::text as booking_id,
          coalesce(charges.total_charges, b.quoted_total_ugx)::bigint as total_charges,
          coalesce(payments.total_paid, 0)::bigint as total_paid,
          greatest(
            0,
            coalesce(charges.total_charges, b.quoted_total_ugx) - coalesce(payments.total_paid, 0)
          )::bigint as balance_due,
          to_char(
            greatest(
              b.updated_at,
              coalesce(charges.latest_at, b.updated_at),
              coalesce(payments.latest_at, b.updated_at)
            ) at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"'
          ) as updated_at
        from scoped_bookings b
        left join lateral (
          select
            sum(case when fc.category = 'discount' then -fc.amount_ugx else fc.amount_ugx end)
              filter (where fc.voided_at is null) as total_charges,
            max(coalesce(fc.voided_at, fc.posted_at)) as latest_at
          from folio_charges fc
          where fc.booking_id = b.id
        ) charges on true
        left join lateral (
          select sum(fp.amount_ugx) as total_paid, max(fp.recorded_at) as latest_at
          from folio_payments fp
          where fp.booking_id = b.id
        ) payments on true
      `,
      sql`
        select
          pr.id::text,
          pr.booking_id::text,
          pr.receipt_number,
          pr.amount_ugx as amount,
          pr.payment_method,
          to_char(pr.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as issued_at
        from payment_receipts pr
        join bookings b on b.id = pr.booking_id
        where b.check_out >= ((now() at time zone 'Africa/Kampala')::date - 14)
           or b.status in ('pending_payment', 'awaiting_confirmation', 'confirmed', 'checked_in')
           or pr.issued_at >= now() - interval '30 days'
        order by pr.issued_at desc
        limit 700
      `,
      sql`
        select
          rg.id::text,
          rg.group_name as name,
          rg.status,
          min(b.check_in)::text as check_in,
          max(b.check_out)::text as check_out,
          count(b.id)::int as member_booking_count,
          greatest(
            0,
            coalesce(sum(coalesce(charges.total_charges, b.quoted_total_ugx)), 0)
              - coalesce(sum(coalesce(payments.total_paid, 0)), 0)
          )::bigint as balance_due,
          to_char(
            greatest(rg.updated_at, coalesce(max(b.updated_at), rg.updated_at)) at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"'
          ) as updated_at
        from reservation_groups rg
        left join bookings b on b.group_id = rg.id
          and b.status not in ('cancelled', 'no_show', 'refunded')
        left join lateral (
          select sum(case when fc.category = 'discount' then -fc.amount_ugx else fc.amount_ugx end)
            filter (where fc.voided_at is null) as total_charges
          from folio_charges fc
          where fc.booking_id = b.id
        ) charges on true
        left join lateral (
          select sum(fp.amount_ugx) as total_paid
          from folio_payments fp
          where fp.booking_id = b.id
        ) payments on true
        where rg.status = 'active'
           or rg.updated_at >= now() - interval '30 days'
        group by rg.id, rg.group_name, rg.status, rg.updated_at
        order by rg.updated_at desc
        limit 300
      `,
      sql`
        select
          ru.id::text,
          ru.unit_name as room_name,
          ru.housekeeping_status,
          ru.room_type_id::text,
          to_char(ru.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        from room_units ru
        order by ru.unit_name asc
        limit ${MAX_OFFLINE_ROOM_UNITS + 1}
      `
    ]);

    const roomUnits = roomUnitRows as RoomUnitSnapshot[];
    if (roomUnitSnapshotExceedsLimit(roomUnits.length)) {
      console.error("offline_snapshot_room_unit_cap_exceeded", {
        limit: MAX_OFFLINE_ROOM_UNITS
      });
      return NextResponse.json(
        {
          error: "Offline snapshot is too large. Reduce room inventory or enable incremental synchronization."
        },
        { status: 503 }
      );
    }

    const generatedAt = String((generatedRows as { generated_at: string }[])[0]?.generated_at ?? new Date().toISOString());

    const body: OfflineSnapshotPayload = {
      offline_identity: {
        user_id: session.userId,
        session_epoch: await offlineSessionEpoch(session.sessionId)
      },
      generated_at: generatedAt,
      bookings: (bookingRows as BookingSnapshot[]).map((row) => toNumber(row, ["balance_due"])),
      room_types: (roomTypeRows as RoomTypeSnapshot[]).map((row) => toNumber(row, ["inventory_count"])),
      folios: (folioRows as FolioSnapshot[]).map((row) =>
        toNumber(row, ["total_charges", "total_paid", "balance_due"])
      ),
      payment_receipts: (receiptRows as PaymentReceiptSnapshot[]).map((row) =>
        toNumber(row, ["amount"])
      ),
      reservation_groups: (groupRows as ReservationGroupSnapshot[]).map((row) =>
        toNumber(row, ["member_booking_count", "balance_due"])
      ),
      room_units: roomUnits
    };

    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("offline_snapshot_sync_failed", error);
    return NextResponse.json({ error: "Offline snapshot sync failed." }, { status: 500 });
  }
}
