-- =====================================================================
-- Mubende Country Resort — payment-on-confirm booking flow
-- =====================================================================
-- Online bookings no longer hold inventory at initiation.
-- create_online_booking(): creates a pending_payment booking with
--   expires_at = NULL so it is excluded from room_type_units_available()
--   (NULL > now() = false). No inventory hold.
-- confirm_booking_payment(): called by the IPN handler on successful
--   payment. Atomically locks room_types + checks availability, then
--   confirms the booking. On race condition (room taken by the time
--   payment confirms) the booking is placed into awaiting_confirmation
--   for manual review and an ops_incident is raised.
-- =====================================================================

begin;

-- create_online_booking: validates inputs, quotes price, checks
-- availability informally, and creates a pending_payment booking with
-- NO inventory hold (expires_at = NULL).
create or replace function public.create_online_booking(
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
  quoted_total_ugx bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_type public.room_types%rowtype;
  v_nights    int;
  v_total     bigint;
  v_available int;
  v_ref       text;
  v_id        uuid;
begin
  if p_check_in is null or p_check_out is null then
    raise exception 'Check-in and check-out are required';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  if p_check_in < current_date then
    raise exception 'Check-in date cannot be in the past';
  end if;
  if p_guests_adults is null or p_guests_adults < 1 then
    raise exception 'At least one adult guest is required';
  end if;
  if p_guest_full_name is null or btrim(p_guest_full_name) = '' then
    raise exception 'Guest name is required';
  end if;
  if p_guest_email is null or btrim(p_guest_email) = '' then
    raise exception 'Guest email is required';
  end if;

  -- Read room type without locking — we are not holding inventory here
  select * into v_room_type
  from public.room_types
  where slug = p_room_type_slug
    and is_published = true;

  if not found then
    raise exception 'Room type not found or unavailable';
  end if;

  -- Informational check only: fast-fail if clearly unavailable
  v_available := public.room_type_units_available(v_room_type.id, p_check_in, p_check_out);
  if v_available <= 0 then
    raise exception 'No availability for the selected dates';
  end if;

  v_nights := (p_check_out - p_check_in);
  v_total  := v_room_type.price_ugx * v_nights;

  v_ref := 'MCR-' || to_char(now() at time zone 'Africa/Kampala', 'YYMMDD')
        || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.bookings (
    reference, room_type_id, check_in, check_out,
    guests_adults, guests_children,
    guest_full_name, guest_email, guest_phone, special_requests,
    status, quoted_total_ugx
    -- expires_at intentionally omitted: NULL means no inventory hold
  ) values (
    v_ref, v_room_type.id, p_check_in, p_check_out,
    p_guests_adults, coalesce(p_guests_children, 0),
    btrim(p_guest_full_name), lower(btrim(p_guest_email)),
    nullif(btrim(coalesce(p_guest_phone, '')), ''),
    nullif(btrim(coalesce(p_special_requests, '')), ''),
    'pending_payment', v_total
  )
  returning id into v_id;

  return query select v_id, v_ref, v_total;
end;
$$;

revoke all on function public.create_online_booking(text, date, date, int, int, text, text, text, text) from public;

-- confirm_booking_payment: called by the IPN handler on successful
-- payment. Serialises via FOR UPDATE locks on both the booking and its
-- room_types row, then performs a hard availability check.
--
-- Outcomes:
--   success=true,  requires_review=false  → booking confirmed
--   success=true,  requires_review=true   → payment ok but no room left;
--                                           booking set to awaiting_confirmation
--                                           + ops_incident raised for manual review
--   success=false, error_code set         → unexpected error (caller logs it)
create or replace function public.confirm_booking_payment(
  p_booking_id       uuid,
  p_order_tracking_id text,
  p_payment_reference text default null
)
returns table (
  success        boolean,
  requires_review boolean,
  error_code     text
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

    return query select true, false, null::text;
  else
    -- Race condition: payment succeeded but room is now fully booked.
    -- Mark paid + flag for manual review so staff can resolve.
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
        'reference',        v_booking.reference,
        'check_in',         v_booking.check_in,
        'check_out',        v_booking.check_out,
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
