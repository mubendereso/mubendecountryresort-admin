-- =====================================================================
-- Mubende Country Resort - desk booking room-charge backfill
-- =====================================================================
-- Desk bookings are settled through the folio. The full room stay belongs
-- in Total Charges, and deposits/manual receipts belong in Total Paid.
--
-- Some confirmed desk bookings have folio payments but no accommodation
-- charge, which makes the payment look like an overpayment. Backfill the
-- missing room charge idempotently.
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
  coalesce(first_payment.recorded_at, b.created_at, now())
from public.bookings b
join public.room_types rt on rt.id = b.room_type_id
left join lateral (
  select fp.recorded_by, fp.recorded_at
  from public.folio_payments fp
  where fp.booking_id = b.id
  order by fp.recorded_at asc
  limit 1
) first_payment on true
where b.payment_provider = 'desk'
  and b.status in ('confirmed', 'checked_in', 'checked_out')
  and b.quoted_total_ugx > 0
  and not exists (
    select 1
    from public.folio_charges fc
    where fc.booking_id = b.id
      and fc.category = 'accommodation'
      and fc.voided_at is null
  );

commit;
