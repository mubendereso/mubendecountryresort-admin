-- Record successful Pesapal payments in guest folios during confirmation.
begin;

create unique index if not exists folio_payments_one_pesapal_per_booking_uidx
  on public.folio_payments (booking_id)
  where method = 'pesapal';

create or replace function public.confirm_booking_payment(
  p_booking_id          uuid,
  p_order_tracking_id   text,
  p_payment_reference   text default null,
  p_expected_amount_ugx bigint default null
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
  v_revivable boolean;
  v_tracking  text := nullif(btrim(coalesce(p_order_tracking_id, '')), '');
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return query select false, false, 'booking_not_found'::text;
    return;
  end if;

  if v_tracking is null then
    return query select false, false, 'missing_tracking_id'::text;
    return;
  end if;

  if v_booking.order_tracking_id is null then
    return query select false, false, 'missing_stored_tracking_id'::text;
    return;
  end if;

  if v_booking.order_tracking_id <> v_tracking then
    return query select false, false, 'tracking_mismatch'::text;
    return;
  end if;

  if p_expected_amount_ugx is not null
    and p_expected_amount_ugx <> v_booking.quoted_total_ugx then
    return query select false, false, 'amount_mismatch'::text;
    return;
  end if;

  -- A repeated confirmation must also repair a missing folio receipt.
  if v_booking.status in ('confirmed', 'awaiting_confirmation') then
    if v_booking.paid_at is not null then
      insert into public.folio_payments (
        booking_id,
        amount_ugx,
        method,
        reference,
        recorded_by,
        recorded_at
      )
      values (
        v_booking.id,
        v_booking.quoted_total_ugx,
        'pesapal',
        coalesce(v_booking.payment_reference, p_payment_reference),
        null,
        v_booking.paid_at
      )
      on conflict (booking_id) where method = 'pesapal' do nothing;
    end if;

    return query
      select true, (v_booking.status = 'awaiting_confirmation'), null::text;
    return;
  end if;

  v_revivable := (
    v_booking.status = 'cancelled'
    and v_booking.payment_expired_at is not null
  );

  if v_booking.status <> 'pending_payment' and not v_revivable then
    return query select false, false, 'invalid_status'::text;
    return;
  end if;

  perform *
  from public.room_types
  where id = v_booking.room_type_id
  for update;

  v_available := public.room_type_units_available(
    v_booking.room_type_id,
    v_booking.check_in,
    v_booking.check_out
  );

  if v_available > 0 then
    update public.bookings
    set
      status             = 'confirmed',
      payment_reference  = p_payment_reference,
      order_tracking_id  = v_tracking,
      paid_at            = now(),
      payment_expired_at = null
    where id = p_booking_id;

    insert into public.folio_payments (
      booking_id,
      amount_ugx,
      method,
      reference,
      recorded_by,
      recorded_at
    )
    values (
      v_booking.id,
      v_booking.quoted_total_ugx,
      'pesapal',
      p_payment_reference,
      null,
      now()
    )
    on conflict (booking_id) where method = 'pesapal' do nothing;

    insert into public.admin_push_dispatches (
      booking_id,
      status,
      next_attempt_at
    )
    values (p_booking_id, 'pending', now());

    return query select true, false, null::text;
  else
    update public.bookings
    set
      status             = 'awaiting_confirmation',
      payment_reference  = p_payment_reference,
      order_tracking_id  = v_tracking,
      paid_at            = now(),
      payment_expired_at = null
    where id = p_booking_id;

    insert into public.folio_payments (
      booking_id,
      amount_ugx,
      method,
      reference,
      recorded_by,
      recorded_at
    )
    values (
      v_booking.id,
      v_booking.quoted_total_ugx,
      'pesapal',
      p_payment_reference,
      null,
      now()
    )
    on conflict (booking_id) where method = 'pesapal' do nothing;

    insert into public.ops_incidents (
      incident_type,
      severity,
      source,
      message,
      booking_id,
      payment_tracking_id,
      dedupe_key,
      context
    )
    values (
      'booking_availability_conflict',
      'high',
      'ipn_handler',
      'Payment confirmed but no inventory available - manual review required for '
        || v_booking.reference,
      p_booking_id,
      v_tracking,
      'avail_conflict_' || p_booking_id::text,
      jsonb_build_object(
        'reference',         v_booking.reference,
        'check_in',          v_booking.check_in,
        'check_out',         v_booking.check_out,
        'order_tracking_id', v_tracking
      )
    )
    on conflict (dedupe_key) do nothing;

    return query select true, true, 'no_availability'::text;
  end if;
end;
$$;

revoke all on function public.confirm_booking_payment(
  uuid, text, text, bigint
) from public;

-- Repair successful online payments confirmed before folio posting became
-- atomic. paid_at is the payment truth; the receipt keeps its original time.
insert into public.folio_payments (
  booking_id,
  amount_ugx,
  method,
  reference,
  recorded_by,
  recorded_at
)
select
  b.id,
  b.quoted_total_ugx,
  'pesapal',
  b.payment_reference,
  null,
  b.paid_at
from public.bookings b
where b.payment_provider = 'pesapal'
  and b.paid_at is not null
on conflict (booking_id) where method = 'pesapal' do nothing;

commit;
