-- Record exhausted Cloudflare Queue payment-recovery messages without granting
-- the storefront role direct INSERT access to the operational incident table.

begin;

create or replace function public.record_payment_recovery_dlq_incident(
  p_booking_id uuid,
  p_order_tracking_id text,
  p_message_id text,
  p_queue_attempts int,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text;
  v_tracking_id text := nullif(btrim(coalesce(p_order_tracking_id, '')), '');
  v_message_id text := nullif(btrim(coalesce(p_message_id, '')), '');
begin
  if p_booking_id is null or v_tracking_id is null or v_message_id is null then
    raise exception 'booking_id, order_tracking_id, and message_id are required';
  end if;
  if length(v_message_id) > 200 then
    raise exception 'message_id is too long';
  end if;
  if coalesce(p_queue_attempts, -1) < 0 then
    raise exception 'queue_attempts must be non-negative';
  end if;

  select b.reference
  into v_reference
  from public.bookings b
  where b.id = p_booking_id
    and b.order_tracking_id = v_tracking_id
  limit 1;

  if v_reference is null then
    raise exception 'booking/payment tracking binding was not found';
  end if;

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
    'payment_recovery_dead_lettered',
    'high',
    'cloudflare_queue',
    'Payment recovery exhausted Cloudflare delivery retries for ' || v_reference,
    p_booking_id,
    v_tracking_id,
    'payment_recovery_dlq:' || v_message_id,
    jsonb_build_object(
      'reference', v_reference,
      'queue_attempts', p_queue_attempts,
      'queue_message_id', v_message_id,
      'payload', coalesce(p_payload, '{}'::jsonb)
    )
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.record_payment_recovery_dlq_incident(
  uuid, text, text, int, jsonb
) from public;
grant execute on function public.record_payment_recovery_dlq_incident(
  uuid, text, text, int, jsonb
) to mcr_storefront_app;

commit;
