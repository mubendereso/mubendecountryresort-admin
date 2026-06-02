-- =====================================================================
-- Mubende Country Resort - Pesapal payment binding backstop
-- =====================================================================
-- Fixes MCR-CRIT-01 from the 2026-06-02 independent paranoid audit.
--
-- The application now verifies that Pesapal's returned tracking id, merchant
-- reference, and amount match the booking's active payment attempt before it
-- calls confirm_booking_payment(). This migration makes the database a final
-- backstop: a confirmation cannot overwrite or attach a different tracking id,
-- and a supplied expected amount must match the booking total.
-- =====================================================================

begin;

drop function if exists public.confirm_booking_payment(uuid, text, text);

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

  if p_expected_amount_ugx is not null and p_expected_amount_ugx <> v_booking.quoted_total_ugx then
    return query select false, false, 'amount_mismatch'::text;
    return;
  end if;

  -- Idempotent, but only after proving this is the same stored tracking id.
  if v_booking.status in ('confirmed', 'awaiting_confirmation') then
    return query select true, (v_booking.status = 'awaiting_confirmation'), null::text;
    return;
  end if;

  -- A booking is confirmable from pending_payment, or revivable from a
  -- timeout soft-cancel (cancelled + payment_expired_at). Explicit/provider
  -- cancellations (no marker) and all other states are not confirmable.
  v_revivable := (v_booking.status = 'cancelled' and v_booking.payment_expired_at is not null);

  if v_booking.status <> 'pending_payment' and not v_revivable then
    return query select false, false, 'invalid_status'::text;
    return;
  end if;

  -- Serialise against concurrent confirmations for the same room type.
  perform * from public.room_types where id = v_booking.room_type_id for update;

  v_available := public.room_type_units_available(
    v_booking.room_type_id, v_booking.check_in, v_booking.check_out
  );

  if v_available > 0 then
    update public.bookings set
      status             = 'confirmed',
      payment_reference  = p_payment_reference,
      order_tracking_id  = v_tracking,
      paid_at            = now(),
      payment_expired_at = null
    where id = p_booking_id;

    insert into public.admin_push_dispatches (booking_id, status, next_attempt_at)
    values (p_booking_id, 'pending', now());

    return query select true, false, null::text;
  else
    update public.bookings set
      status             = 'awaiting_confirmation',
      payment_reference  = p_payment_reference,
      order_tracking_id  = v_tracking,
      paid_at            = now(),
      payment_expired_at = null
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
      'Payment confirmed but no inventory available - manual review required for ' || v_booking.reference,
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

revoke all on function public.confirm_booking_payment(uuid, text, text, bigint) from public;

commit;
