-- =====================================================================
-- Mubende Country Resort - event-based payment recovery eligibility
-- =====================================================================
-- Supports the storefront Cloudflare Queue recovery worker. The queue wakes
-- only for known payment events, and this claim RPC now refuses rows whose
-- local booking/payment binding is incomplete.
--
-- Required local binding before a row can be claimed:
--   - recovery order_tracking_id matches bookings.order_tracking_id
--   - booking has an active payment attempt
--   - active attempt provider_reference matches the tracking id
--   - booking/payment attempt both have the Pesapal redirect URL persisted
--   - merchant reference and amount match the booking
-- =====================================================================

begin;

create or replace function public.claim_pending_payment_recoveries(
  p_limit int default 5,
  p_worker_id text default null,
  p_booking_id uuid default null
)
returns setof public.pending_payment_recoveries
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_limit int := greatest(1, least(coalesce(p_limit, 5), 25));
  normalized_worker text := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'unknown');
begin
  return query
  with candidates as (
    select r.id
    from public.pending_payment_recoveries r
    join public.bookings b
      on b.id = r.booking_id
    join public.payment_attempts pa
      on pa.id = b.active_payment_attempt_id
    where (
      (
        r.status in ('pending', 'retrying')
        and r.next_attempt_at <= now()
        and r.attempt_count < r.max_attempts
      )
      or (
        r.status = 'processing'
        and r.locked_at is not null
        and r.locked_at <= now() - interval '5 minutes'
        and r.attempt_count < r.max_attempts
      )
    )
    and (p_booking_id is null or r.booking_id = p_booking_id)
    and r.provider = 'pesapal'
    and nullif(btrim(r.order_tracking_id), '') is not null
    and b.order_tracking_id = r.order_tracking_id
    and nullif(btrim(coalesce(b.payment_redirect_url, '')), '') is not null
    and pa.provider_reference = r.order_tracking_id
    and nullif(btrim(coalesce(pa.redirect_url, '')), '') is not null
    and pa.merchant_reference = b.reference
    and pa.amount_ugx = b.quoted_total_ugx
    order by r.next_attempt_at asc, r.created_at asc
    limit normalized_limit
    for update skip locked
  )
  update public.pending_payment_recoveries as r
  set
    status = 'processing',
    attempt_count = r.attempt_count + 1,
    locked_at = now(),
    locked_by = normalized_worker,
    last_error = null,
    updated_at = now()
  from candidates
  where r.id = candidates.id
  returning r.*;
end;
$$;

revoke all on function public.claim_pending_payment_recoveries(int, text, uuid) from public;
grant execute on function public.claim_pending_payment_recoveries(int, text, uuid) to mcr_storefront_app;

-- Keep rate-limit pruning available to the storefront Worker if we later add a
-- low-frequency housekeeping trigger. The payment recovery queue does not call
-- this on every message.
grant execute on function public.prune_rate_limits(integer) to mcr_storefront_app;

commit;
