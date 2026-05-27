-- =====================================================================
-- Mubende Country Resort - backfill missing deposit accommodation charges
-- =====================================================================
-- The first staff-booking deposit implementation recorded the folio payment
-- but did not reliably force the matching accommodation-charge CTE to run.
-- This idempotently adds the missing base room charge for bookings that have
-- received at least one payment but have no accommodation charge yet.
-- =====================================================================

begin;

insert into public.folio_charges (
  booking_id,
  description,
  amount_ugx,
  category,
  posted_by,
  posted_at
)
select
  b.id,
  rt.title || ' - ' ||
    (b.check_out::date - b.check_in::date)::text ||
    ' night' ||
    case when (b.check_out::date - b.check_in::date) = 1 then '' else 's' end,
  b.quoted_total_ugx,
  'accommodation',
  first_payment.recorded_by,
  first_payment.recorded_at
from public.bookings b
join public.room_types rt on rt.id = b.room_type_id
join lateral (
  select fp.recorded_by, fp.recorded_at
  from public.folio_payments fp
  where fp.booking_id = b.id
  order by fp.recorded_at asc
  limit 1
) first_payment on true
where b.status in ('confirmed', 'checked_in', 'checked_out')
  and b.quoted_total_ugx > 0
  and not exists (
    select 1
    from public.folio_charges fc
    where fc.booking_id = b.id
      and fc.category = 'accommodation'
      and fc.voided_at is null
  );

commit;
