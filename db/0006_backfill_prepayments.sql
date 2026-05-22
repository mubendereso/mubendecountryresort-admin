-- =====================================================================
-- Mubende Country Resort — backfill folio prepayments
-- =====================================================================
-- Bookings checked in before the auto-prepayment change have an
-- accommodation charge but no matching folio_payment, so the prepaid
-- room shows up as Balance Due instead of Total Paid.
--
-- This one-time backfill records the online prepayment (quoted_total_ugx,
-- method 'pesapal') for every booking that has reached the folio stage
-- (checked_in / checked_out) and was actually paid (paid_at set), unless
-- a 'pesapal' payment already exists. recorded_by is left NULL since no
-- admin user performed the action.
--
-- Idempotent: safe to re-run — the NOT EXISTS guard skips bookings that
-- already have their prepayment recorded.
-- =====================================================================

begin;

insert into public.folio_payments (booking_id, amount_ugx, method, reference, recorded_by, recorded_at)
select
  b.id,
  b.quoted_total_ugx,
  'pesapal',
  b.payment_reference,
  null,
  coalesce(b.paid_at, now())
from public.bookings b
where b.status in ('checked_in', 'checked_out')
  and b.paid_at is not null
  and not exists (
    select 1 from public.folio_payments
    where booking_id = b.id and method = 'pesapal'
  );

commit;
