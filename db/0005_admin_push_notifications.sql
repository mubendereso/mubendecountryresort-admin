-- =====================================================================
-- Mubende Country Resort — admin push notifications
-- =====================================================================
-- Sends a Web Push alert to all subscribed admin devices when a booking
-- is confirmed via Pesapal payment.
--
-- Tables:
--   admin_push_subscriptions  — one row per browser/device
--   admin_push_dispatches     — one dispatch per confirmed booking
--   admin_push_dispatch_receipts — dedup: which subscription received
--                                  which dispatch (prevents re-sending
--                                  the same notification on retry)
--
-- confirm_booking_payment() is updated here to enqueue a dispatch row
-- the moment a booking transitions to confirmed.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table public.admin_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text unique not null,
  p256dh       text not null,
  auth         text not null,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index admin_push_subscriptions_last_seen_idx
  on public.admin_push_subscriptions(last_seen_at desc);

create table public.admin_push_dispatches (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings(id) on delete cascade,
  status          text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'no_subscribers')),
  attempt_count   int not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  completed_at    timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index admin_push_dispatches_due_idx
  on public.admin_push_dispatches(status, next_attempt_at)
  where status in ('pending', 'no_subscribers');
create index admin_push_dispatches_booking_idx
  on public.admin_push_dispatches(booking_id);

create table public.admin_push_dispatch_receipts (
  dispatch_id     uuid not null references public.admin_push_dispatches(id) on delete cascade,
  subscription_id uuid not null references public.admin_push_subscriptions(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (dispatch_id, subscription_id)
);

-- ---------------------------------------------------------------------
-- claim_admin_push_dispatches: atomically claims pending dispatches
-- ---------------------------------------------------------------------
create or replace function public.claim_admin_push_dispatches(
  p_limit int default 5
)
returns setof public.admin_push_dispatches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 5), 25));
begin
  return query
  with candidates as (
    select id
    from public.admin_push_dispatches
    where status in ('pending', 'no_subscribers')
      and next_attempt_at <= now()
    order by next_attempt_at asc, created_at asc
    limit v_limit
    for update skip locked
  )
  update public.admin_push_dispatches d
  set
    status        = 'processing',
    attempt_count = attempt_count + 1,
    updated_at    = now()
  from candidates
  where d.id = candidates.id
  returning d.*;
end;
$$;

revoke all on function public.claim_admin_push_dispatches(int) from public;

-- ---------------------------------------------------------------------
-- confirm_booking_payment: replace with dispatch-enqueuing version
-- ---------------------------------------------------------------------
create or replace function public.confirm_booking_payment(
  p_booking_id        uuid,
  p_order_tracking_id text,
  p_payment_reference text default null
)
returns table (
  success         boolean,
  requires_review boolean,
  error_code      text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking   public.bookings%rowtype;
  v_available int;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return query select false, false, 'booking_not_found'::text;
    return;
  end if;

  -- Idempotent
  if v_booking.status in ('confirmed', 'awaiting_confirmation') then
    return query select true, (v_booking.status = 'awaiting_confirmation'), null::text;
    return;
  end if;

  if v_booking.status != 'pending_payment' then
    return query select false, false, 'invalid_status'::text;
    return;
  end if;

  -- Serialise against concurrent confirmations for the same room type
  perform * from public.room_types where id = v_booking.room_type_id for update;

  v_available := public.room_type_units_available(
    v_booking.room_type_id, v_booking.check_in, v_booking.check_out
  );

  if v_available > 0 then
    update public.bookings set
      status            = 'confirmed',
      payment_reference = p_payment_reference,
      order_tracking_id = coalesce(p_order_tracking_id, order_tracking_id),
      paid_at           = now()
    where id = p_booking_id;

    -- Enqueue admin push notification for this confirmed booking
    insert into public.admin_push_dispatches (booking_id, status, next_attempt_at)
    values (p_booking_id, 'pending', now());

    return query select true, false, null::text;
  else
    -- Race condition: payment confirmed but room is now fully booked.
    -- Mark paid + flag for manual review.
    update public.bookings set
      status            = 'awaiting_confirmation',
      payment_reference = p_payment_reference,
      order_tracking_id = coalesce(p_order_tracking_id, order_tracking_id),
      paid_at           = now()
    where id = p_booking_id;

    insert into public.ops_incidents (
      incident_type,
      severity,
      source,
      message,
      booking_id,
      payment_tracking_id,
      dedupe_key,
      context
    ) values (
      'booking_availability_conflict',
      'high',
      'ipn_handler',
      'Payment confirmed but no inventory available — manual review required for ' || v_booking.reference,
      p_booking_id,
      p_order_tracking_id,
      'avail_conflict_' || p_booking_id::text,
      jsonb_build_object(
        'reference',         v_booking.reference,
        'check_in',          v_booking.check_in,
        'check_out',         v_booking.check_out,
        'order_tracking_id', p_order_tracking_id
      )
    )
    on conflict (dedupe_key) do nothing;

    return query select true, true, 'no_availability'::text;
  end if;
end;
$$;

revoke all on function public.confirm_booking_payment(uuid, text, text) from public;

commit;
