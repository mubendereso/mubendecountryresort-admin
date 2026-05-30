-- =====================================================================
-- Mubende Country Resort — pending-payment soft-cancel + paid-sticky revival
-- =====================================================================
-- Ports the bakery/smokehouse behaviour to mubende's single-status model:
--
--   * A booking whose Pesapal payment stays pending past a short window is
--     soft-cancelled (status='cancelled') and stamped with payment_expired_at.
--   * If the guest later completes payment (e.g. a forgotten tab), the booking
--     is revived to 'confirmed' — payment truth wins ("paid-sticky").
--   * A booking the provider explicitly fails/reverses, or a staff/guest
--     cancellation, is also 'cancelled' but WITHOUT payment_expired_at, so it
--     stays terminal and a stray late "paid" cannot resurrect it.
--
-- payment_expired_at is the discriminator: only soft-cancels (timeout) carry
-- it, and only those are revivable by confirm_booking_payment.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Marker column: set when a pending payment is soft-cancelled on timeout.
-- ---------------------------------------------------------------------
alter table public.bookings
  add column if not exists payment_expired_at timestamptz;

-- ---------------------------------------------------------------------
-- confirm_booking_payment: now also revives a timeout-soft-cancelled booking
-- (status='cancelled' AND payment_expired_at is not null). Clears the marker
-- on confirm. Behaviour for pending_payment / already-confirmed is unchanged.
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
  v_revivable boolean;
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

  -- A booking is confirmable from pending_payment, or revivable from a
  -- timeout soft-cancel (cancelled + payment_expired_at). Explicit/provider
  -- cancellations (no marker) and all other states are not confirmable.
  v_revivable := (v_booking.status = 'cancelled' and v_booking.payment_expired_at is not null);

  if v_booking.status <> 'pending_payment' and not v_revivable then
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
      status             = 'confirmed',
      payment_reference  = p_payment_reference,
      order_tracking_id  = coalesce(p_order_tracking_id, order_tracking_id),
      paid_at            = now(),
      payment_expired_at = null
    where id = p_booking_id;

    -- Enqueue admin push notification for this confirmed booking
    insert into public.admin_push_dispatches (booking_id, status, next_attempt_at)
    values (p_booking_id, 'pending', now());

    return query select true, false, null::text;
  else
    -- Race condition: payment confirmed but room is now fully booked.
    -- Mark paid + flag for manual review.
    update public.bookings set
      status             = 'awaiting_confirmation',
      payment_reference  = p_payment_reference,
      order_tracking_id  = coalesce(p_order_tracking_id, order_tracking_id),
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
