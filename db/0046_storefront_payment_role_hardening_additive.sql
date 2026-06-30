-- Add the least-privilege payment APIs before revoking the legacy storefront
-- table grants. Migration 0047 performs the revocations after both Workers
-- have been deployed against these functions.

begin;

do $$
begin
  if not exists (
    select 1 from pg_roles where rolname = 'mcr_payment_reconciler'
  ) then
    create role mcr_payment_reconciler login;
  end if;
end;
$$;

grant usage on schema public to mcr_payment_reconciler;
revoke all privileges on all tables in schema public from mcr_payment_reconciler;
revoke all privileges on all sequences in schema public from mcr_payment_reconciler;
revoke all privileges on all functions in schema public from mcr_payment_reconciler;

create table if not exists public.storefront_payment_capabilities (
  booking_id uuid primary key
    references public.bookings(id) on update cascade on delete cascade,
  capability_token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

revoke all on public.storefront_payment_capabilities from public;
revoke all on public.storefront_payment_capabilities from mcr_storefront_app;
revoke all on public.storefront_payment_capabilities from mcr_payment_reconciler;

create or replace function public.create_online_booking_with_payment_capability(
  p_room_type_slug text,
  p_check_in date,
  p_check_out date,
  p_guests_adults int,
  p_guests_children int,
  p_guest_full_name text,
  p_guest_email text,
  p_guest_phone text,
  p_special_requests text
)
returns table (
  booking_id uuid,
  reference text,
  quoted_total_ugx bigint,
  payment_capability uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_reference text;
  v_total bigint;
  v_capability uuid := gen_random_uuid();
begin
  select created.booking_id, created.reference, created.quoted_total_ugx
  into v_booking_id, v_reference, v_total
  from public.create_online_booking(
    p_room_type_slug,
    p_check_in,
    p_check_out,
    p_guests_adults,
    p_guests_children,
    p_guest_full_name,
    p_guest_email,
    p_guest_phone,
    p_special_requests
  ) as created;

  if v_booking_id is null then
    raise exception 'Booking creation returned no booking';
  end if;

  insert into public.storefront_payment_capabilities (
    booking_id,
    capability_token
  ) values (
    v_booking_id,
    v_capability
  );

  return query select v_booking_id, v_reference, v_total, v_capability;
end;
$$;

revoke all on function public.create_online_booking_with_payment_capability(
  text, date, date, int, int, text, text, text, text
) from public;
grant execute on function public.create_online_booking_with_payment_capability(
  text, date, date, int, int, text, text, text, text
) to mcr_storefront_app;

create or replace function public.start_storefront_payment_attempt(
  p_booking_id uuid,
  p_payment_capability uuid
)
returns table (
  payment_attempt_id uuid,
  reference text,
  amount_ugx bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_capability public.storefront_payment_capabilities%rowtype;
  v_attempt_id uuid;
begin
  select * into v_capability
  from public.storefront_payment_capabilities
  where booking_id = p_booking_id
    and capability_token = p_payment_capability
  for update;

  if not found
    or v_capability.consumed_at is not null
    or v_capability.expires_at <= now() then
    raise exception 'Invalid or expired payment capability';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.status <> 'pending_payment' then
    raise exception 'Booking is not eligible for payment initiation';
  end if;
  if v_booking.active_payment_attempt_id is not null then
    raise exception 'Booking already has an active payment attempt';
  end if;

  insert into public.payment_attempts (
    booking_id,
    merchant_reference,
    amount_ugx,
    provider_request_started_at
  ) values (
    v_booking.id,
    v_booking.reference,
    v_booking.quoted_total_ugx,
    now()
  ) returning id into v_attempt_id;

  update public.bookings
  set
    payment_provider = 'pesapal',
    active_payment_attempt_id = v_attempt_id,
    payment_initiation_attempted_at = now()
  where id = v_booking.id;

  return query
    select v_attempt_id, v_booking.reference, v_booking.quoted_total_ugx;
end;
$$;

revoke all on function public.start_storefront_payment_attempt(uuid, uuid) from public;
grant execute on function public.start_storefront_payment_attempt(uuid, uuid)
  to mcr_storefront_app;

create or replace function public.record_storefront_payment_initiation_success(
  p_booking_id uuid,
  p_payment_attempt_id uuid,
  p_payment_capability uuid,
  p_order_tracking_id text,
  p_redirect_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_capability public.storefront_payment_capabilities%rowtype;
  v_tracking text := nullif(btrim(coalesce(p_order_tracking_id, '')), '');
  v_redirect text := nullif(btrim(coalesce(p_redirect_url, '')), '');
  v_recovery_id uuid;
begin
  if v_tracking is null or char_length(v_tracking) > 200 then
    raise exception 'Invalid provider tracking id';
  end if;
  if v_redirect is null or char_length(v_redirect) > 2000
    or v_redirect !~* '^https://' then
    raise exception 'Invalid provider redirect URL';
  end if;

  select * into v_capability
  from public.storefront_payment_capabilities
  where booking_id = p_booking_id
    and capability_token = p_payment_capability
  for update;

  if not found
    or v_capability.consumed_at is not null
    or v_capability.expires_at <= now() then
    raise exception 'Invalid or expired payment capability';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  select * into v_attempt
  from public.payment_attempts
  where id = p_payment_attempt_id
  for update;

  if v_booking.id is null
    or v_booking.status <> 'pending_payment'
    or v_booking.active_payment_attempt_id <> p_payment_attempt_id
    or v_attempt.id is null
    or v_attempt.booking_id <> v_booking.id
    or v_attempt.merchant_reference <> v_booking.reference
    or v_attempt.amount_ugx <> v_booking.quoted_total_ugx then
    raise exception 'Booking/payment attempt binding mismatch';
  end if;

  if v_booking.order_tracking_id is not null
    and v_booking.order_tracking_id <> v_tracking then
    raise exception 'Booking tracking id is immutable';
  end if;
  if v_attempt.provider_reference is not null
    and v_attempt.provider_reference <> v_tracking then
    raise exception 'Payment attempt tracking id is immutable';
  end if;

  update public.bookings
  set
    order_tracking_id = v_tracking,
    payment_redirect_url = v_redirect
  where id = v_booking.id;

  update public.payment_attempts
  set
    status = 'initiated',
    provider_reference = v_tracking,
    redirect_url = v_redirect,
    response_received_at = now()
  where id = v_attempt.id;

  insert into public.pending_payment_recoveries (
    booking_id,
    provider,
    order_tracking_id,
    status,
    next_attempt_at,
    last_error
  ) values (
    v_booking.id,
    'pesapal',
    v_tracking,
    'pending',
    now(),
    'Booking payment initiated.'
  )
  on conflict (provider, order_tracking_id)
  do update set
    status = case
      when public.pending_payment_recoveries.status = 'completed'
        then public.pending_payment_recoveries.status
      else 'retrying'
    end,
    next_attempt_at = case
      when public.pending_payment_recoveries.status = 'completed'
        then public.pending_payment_recoveries.next_attempt_at
      else least(public.pending_payment_recoveries.next_attempt_at, now())
    end,
    completed_at = case
      when public.pending_payment_recoveries.status = 'completed'
        then public.pending_payment_recoveries.completed_at
      else null
    end,
    last_error = case
      when public.pending_payment_recoveries.status = 'completed'
        then public.pending_payment_recoveries.last_error
      else excluded.last_error
    end,
    updated_at = now()
  where public.pending_payment_recoveries.booking_id = excluded.booking_id
  returning id into v_recovery_id;

  if v_recovery_id is null then
    raise exception 'Provider tracking id is already bound to another booking';
  end if;

  update public.storefront_payment_capabilities
  set consumed_at = now()
  where booking_id = v_booking.id;
end;
$$;

revoke all on function public.record_storefront_payment_initiation_success(
  uuid, uuid, uuid, text, text
) from public;
grant execute on function public.record_storefront_payment_initiation_success(
  uuid, uuid, uuid, text, text
) to mcr_storefront_app;

create or replace function public.record_storefront_payment_initiation_failure(
  p_booking_id uuid,
  p_payment_attempt_id uuid,
  p_payment_capability uuid,
  p_failure_phase text,
  p_failure_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_capability public.storefront_payment_capabilities%rowtype;
  v_phase text := nullif(btrim(coalesce(p_failure_phase, '')), '');
  v_message text := left(
    coalesce(nullif(btrim(coalesce(p_failure_message, '')), ''), 'Unknown error'),
    1000
  );
begin
  if v_phase not in ('pre_provider', 'provider_rejected', 'post_provider_unknown') then
    raise exception 'Invalid payment failure phase';
  end if;

  select * into v_capability
  from public.storefront_payment_capabilities
  where booking_id = p_booking_id
    and capability_token = p_payment_capability
  for update;

  if not found
    or v_capability.consumed_at is not null
    or v_capability.expires_at <= now() then
    raise exception 'Invalid or expired payment capability';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.status <> 'pending_payment' then
    raise exception 'Booking is not eligible for a payment failure transition';
  end if;

  if p_payment_attempt_id is not null then
    select * into v_attempt
    from public.payment_attempts
    where id = p_payment_attempt_id
    for update;

    if not found
      or v_attempt.booking_id <> v_booking.id
      or v_booking.active_payment_attempt_id <> v_attempt.id
      or v_attempt.merchant_reference <> v_booking.reference
      or v_attempt.amount_ugx <> v_booking.quoted_total_ugx then
      raise exception 'Booking/payment attempt binding mismatch';
    end if;
  elsif v_phase <> 'pre_provider' or v_booking.active_payment_attempt_id is not null then
    raise exception 'Payment attempt is required for this failure phase';
  end if;

  update public.bookings
  set
    status = case
      when v_phase in ('pre_provider', 'provider_rejected') then 'cancelled'
      else status
    end,
    payment_initiation_failure_code = v_phase,
    payment_initiation_failure_message = v_message,
    payment_initiation_failed_at = now()
  where id = v_booking.id;

  if p_payment_attempt_id is not null then
    update public.payment_attempts
    set
      status = case
        when v_phase = 'provider_rejected' then 'rejected'
        else 'failed'
      end,
      failure_message = v_message,
      failure_phase = v_phase::public.payment_attempt_failure_phase
    where id = p_payment_attempt_id;
  end if;

  update public.storefront_payment_capabilities
  set consumed_at = now()
  where booking_id = v_booking.id;
end;
$$;

revoke all on function public.record_storefront_payment_initiation_failure(
  uuid, uuid, uuid, text, text
) from public;
grant execute on function public.record_storefront_payment_initiation_failure(
  uuid, uuid, uuid, text, text
) to mcr_storefront_app;

create or replace function public.get_storefront_payment_queue_binding(
  p_order_tracking_id text,
  p_merchant_reference text
)
returns table (
  booking_id uuid,
  reference text,
  order_tracking_id text,
  payment_attempt_id uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select
    b.id,
    b.reference,
    b.order_tracking_id,
    pa.id
  from public.bookings b
  join public.payment_attempts pa
    on pa.id = b.active_payment_attempt_id
  where b.order_tracking_id = nullif(btrim(coalesce(p_order_tracking_id, '')), '')
    and b.reference = nullif(btrim(coalesce(p_merchant_reference, '')), '')
    and pa.provider_reference = b.order_tracking_id
    and pa.merchant_reference = b.reference
    and pa.amount_ugx = b.quoted_total_ugx
  limit 1
$$;

revoke all on function public.get_storefront_payment_queue_binding(text, text)
  from public;
grant execute on function public.get_storefront_payment_queue_binding(text, text)
  to mcr_storefront_app;

create or replace function public.claim_payment_recovery_message(
  p_booking_id uuid,
  p_order_tracking_id text,
  p_worker_id text
)
returns table (
  recovery_id uuid,
  claimed boolean,
  recovery_status text,
  wake_at timestamptz,
  attempt_count int,
  max_attempts int,
  booking_id uuid,
  reference text,
  order_tracking_id text,
  payment_attempt_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recovery public.pending_payment_recoveries%rowtype;
  v_recovery_id uuid;
  v_reference text;
  v_attempt_id uuid;
  v_claimed boolean := false;
begin
  select r.id, b.reference, pa.id
  into v_recovery_id, v_reference, v_attempt_id
  from public.pending_payment_recoveries r
  join public.bookings b on b.id = r.booking_id
  join public.payment_attempts pa on pa.id = b.active_payment_attempt_id
  where r.booking_id = p_booking_id
    and r.order_tracking_id = nullif(btrim(coalesce(p_order_tracking_id, '')), '')
    and r.provider = 'pesapal'
    and b.order_tracking_id = r.order_tracking_id
    and pa.provider_reference = r.order_tracking_id
    and pa.merchant_reference = b.reference
    and pa.amount_ugx = b.quoted_total_ugx
  order by r.created_at desc
  limit 1
  for update of r;

  if not found then
    return;
  end if;

  select * into v_recovery
  from public.pending_payment_recoveries
  where id = v_recovery_id;

  if (
    (
      v_recovery.status in ('pending', 'retrying')
      and v_recovery.next_attempt_at <= now()
    )
    or (
      v_recovery.status = 'processing'
      and v_recovery.locked_at is not null
      and v_recovery.locked_at <= now() - interval '5 minutes'
    )
  ) and v_recovery.attempt_count < v_recovery.max_attempts then
    update public.pending_payment_recoveries r
    set
      status = 'processing',
      attempt_count = r.attempt_count + 1,
      locked_at = now(),
      locked_by = left(
        coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'reconciler'),
        200
      ),
      last_error = null,
      updated_at = now()
    where r.id = v_recovery.id
    returning r.* into v_recovery;
    v_claimed := true;
  elsif v_recovery.attempt_count >= v_recovery.max_attempts
    and v_recovery.status not in ('completed', 'failed') then
    update public.pending_payment_recoveries r
    set
      status = 'failed',
      locked_at = null,
      last_error = 'Payment recovery exhausted application attempts.',
      updated_at = now()
    where r.id = v_recovery.id
    returning r.* into v_recovery;
  end if;

  return query select
    v_recovery.id,
    v_claimed,
    v_recovery.status,
    case
      when v_recovery.status = 'processing' and v_recovery.locked_at is not null
        then greatest(
          v_recovery.next_attempt_at,
          v_recovery.locked_at + interval '5 minutes'
        )
      else v_recovery.next_attempt_at
    end,
    v_recovery.attempt_count,
    v_recovery.max_attempts,
    v_recovery.booking_id,
    v_reference,
    v_recovery.order_tracking_id,
    v_attempt_id;
end;
$$;

revoke all on function public.claim_payment_recovery_message(uuid, text, text)
  from public;
grant execute on function public.claim_payment_recovery_message(uuid, text, text)
  to mcr_payment_reconciler;

create or replace function public.apply_payment_recovery_outcome(
  p_recovery_id uuid,
  p_order_tracking_id text,
  p_provider_order_tracking_id text,
  p_payment_status text,
  p_merchant_reference text,
  p_amount_ugx bigint,
  p_currency text,
  p_confirmation_code text,
  p_raw_response jsonb
)
returns table (
  recovery_status text,
  wake_at timestamptz,
  attempt_count int,
  max_attempts int,
  requires_review boolean,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recovery public.pending_payment_recoveries%rowtype;
  v_booking public.bookings%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_status text := lower(nullif(btrim(coalesce(p_payment_status, '')), ''));
  v_tracking text := nullif(btrim(coalesce(p_order_tracking_id, '')), '');
  v_provider_tracking text := nullif(
    btrim(coalesce(p_provider_order_tracking_id, '')),
    ''
  );
  v_reference text := nullif(btrim(coalesce(p_merchant_reference, '')), '');
  v_currency text := upper(nullif(btrim(coalesce(p_currency, '')), ''));
  v_confirm_success boolean;
  v_requires_review boolean := false;
  v_error_code text;
  v_backoff_seconds int;
begin
  if v_status not in ('pending', 'paid', 'failed') then
    raise exception 'Invalid provider payment status';
  end if;
  if p_raw_response is not null
    and octet_length(p_raw_response::text) > 32768 then
    raise exception 'Provider response is too large';
  end if;

  select * into v_recovery
  from public.pending_payment_recoveries
  where id = p_recovery_id
  for update;

  if not found or v_recovery.status <> 'processing' then
    raise exception 'Recovery row is not claimed';
  end if;

  select * into v_booking
  from public.bookings
  where id = v_recovery.booking_id
  for update;

  select * into v_attempt
  from public.payment_attempts
  where id = v_booking.active_payment_attempt_id
  for update;

  if v_tracking is null
    or v_tracking <> v_recovery.order_tracking_id
    or v_booking.order_tracking_id <> v_tracking
    or v_attempt.id is null
    or v_attempt.booking_id <> v_booking.id
    or v_attempt.provider_reference <> v_tracking
    or v_attempt.merchant_reference <> v_booking.reference
    or v_attempt.amount_ugx <> v_booking.quoted_total_ugx then
    raise exception 'Stored payment binding mismatch';
  end if;

  if v_provider_tracking is not null and v_provider_tracking <> v_tracking then
    raise exception 'Provider tracking id mismatch';
  end if;
  if v_reference is null or v_reference <> v_booking.reference then
    raise exception 'Provider merchant reference mismatch';
  end if;
  if p_amount_ugx is not null and p_amount_ugx <> v_attempt.amount_ugx then
    raise exception 'Provider amount mismatch';
  end if;
  if v_currency is not null and v_currency <> 'UGX' then
    raise exception 'Provider currency mismatch';
  end if;

  if v_status = 'paid' then
    if v_provider_tracking is null then
      raise exception 'Paid provider response is missing its tracking id';
    end if;
    if p_amount_ugx is null then
      raise exception 'Paid provider response is missing its amount';
    end if;
    if v_currency is null then
      raise exception 'Paid provider response is missing its currency';
    end if;

    select confirmed.success, confirmed.requires_review, confirmed.error_code
    into v_confirm_success, v_requires_review, v_error_code
    from public.confirm_booking_payment(
      v_booking.id,
      v_tracking,
      nullif(btrim(coalesce(p_confirmation_code, '')), ''),
      p_amount_ugx
    ) as confirmed;

    if not coalesce(v_confirm_success, false) then
      raise exception 'Payment confirmation rejected: %',
        coalesce(v_error_code, 'unknown_error');
    end if;

    update public.payment_attempts
    set
      verified_payment_status = 'paid',
      verified_at = now(),
      last_verification_response = coalesce(p_raw_response, '{}'::jsonb)
    where id = v_attempt.id;

    update public.pending_payment_recoveries
    set
      status = 'completed',
      completed_at = now(),
      last_verified_at = now(),
      last_error = null,
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = v_recovery.id
    returning * into v_recovery;
  elsif v_status = 'failed' then
    update public.bookings
    set
      status = 'cancelled',
      payment_expired_at = null,
      payment_initiation_failure_code = 'provider_failed',
      payment_initiation_failure_message =
        'Pesapal reported the payment as failed or reversed.',
      payment_initiation_failed_at = now(),
      payment_last_verified_at = now()
    where id = v_booking.id
      and status in ('pending_payment', 'cancelled');

    update public.payment_attempts
    set
      verified_payment_status = 'failed',
      verified_at = now(),
      last_verification_response = coalesce(p_raw_response, '{}'::jsonb)
    where id = v_attempt.id;

    update public.pending_payment_recoveries
    set
      status = 'completed',
      completed_at = now(),
      last_verified_at = now(),
      last_error = null,
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = v_recovery.id
    returning * into v_recovery;
  else
    update public.bookings
    set
      status = case
        when status = 'pending_payment'
          and created_at <= now() - interval '7 minutes'
          then 'cancelled'
        else status
      end,
      payment_expired_at = case
        when status = 'pending_payment'
          and created_at <= now() - interval '7 minutes'
          then now()
        else payment_expired_at
      end,
      payment_last_verified_at = now()
    where id = v_booking.id
      and (
        status = 'pending_payment'
        or (status = 'cancelled' and payment_expired_at is not null)
      );

    v_backoff_seconds := least(
      3600,
      30 * (2 ^ least(greatest(v_recovery.attempt_count, 0), 12))::int
    );

    update public.pending_payment_recoveries
    set
      status = case
        when attempt_count >= max_attempts then 'failed'
        else 'retrying'
      end,
      next_attempt_at = now() + make_interval(secs => v_backoff_seconds),
      last_verified_at = now(),
      last_error = case
        when attempt_count >= max_attempts
          then 'Payment recovery exhausted application attempts.'
        else 'Provider still reports pending.'
      end,
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = v_recovery.id
    returning * into v_recovery;
  end if;

  return query select
    v_recovery.status,
    v_recovery.next_attempt_at,
    v_recovery.attempt_count,
    v_recovery.max_attempts,
    v_requires_review,
    v_error_code;
end;
$$;

revoke all on function public.apply_payment_recovery_outcome(
  uuid, text, text, text, text, bigint, text, text, jsonb
) from public;
grant execute on function public.apply_payment_recovery_outcome(
  uuid, text, text, text, text, bigint, text, text, jsonb
) to mcr_payment_reconciler;

create or replace function public.reschedule_claimed_payment_recovery(
  p_recovery_id uuid,
  p_reason text
)
returns table (
  recovery_status text,
  wake_at timestamptz,
  attempt_count int,
  max_attempts int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recovery public.pending_payment_recoveries%rowtype;
  v_backoff_seconds int;
begin
  select * into v_recovery
  from public.pending_payment_recoveries
  where id = p_recovery_id
  for update;

  if not found or v_recovery.status <> 'processing' then
    raise exception 'Recovery row is not claimed';
  end if;

  v_backoff_seconds := least(
    3600,
    30 * (2 ^ least(greatest(v_recovery.attempt_count, 0), 12))::int
  );

  update public.pending_payment_recoveries
  set
    status = case
      when attempt_count >= max_attempts then 'failed'
      else 'retrying'
    end,
    next_attempt_at = now() + make_interval(secs => v_backoff_seconds),
    last_verified_at = now(),
    last_error = left(
      coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Recovery failed'),
      2000
    ),
    locked_at = null,
    locked_by = null,
    updated_at = now()
  where id = v_recovery.id
  returning * into v_recovery;

  return query select
    v_recovery.status,
    v_recovery.next_attempt_at,
    v_recovery.attempt_count,
    v_recovery.max_attempts;
end;
$$;

revoke all on function public.reschedule_claimed_payment_recovery(uuid, text)
  from public;
grant execute on function public.reschedule_claimed_payment_recovery(uuid, text)
  to mcr_payment_reconciler;

grant execute on function public.record_payment_recovery_dlq_incident(
  uuid, text, text, int, jsonb
) to mcr_payment_reconciler;

commit;
