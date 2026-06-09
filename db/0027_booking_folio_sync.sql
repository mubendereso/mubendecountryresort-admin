-- Keep booking accommodation charges and Pesapal receipts synchronized.
begin;

create unique index if not exists folio_charges_one_active_accommodation_uidx
  on public.folio_charges (booking_id)
  where category = 'accommodation' and voided_at is null;

create or replace function public.sync_booking_folio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_title text;
  v_nights int;
  v_paid_amount bigint;
begin
  if new.status not in (
    'confirmed',
    'awaiting_confirmation',
    'checked_in',
    'checked_out'
  ) then
    return new;
  end if;

  select rt.title
  into v_room_title
  from public.room_types rt
  where rt.id = new.room_type_id;

  v_nights := new.check_out - new.check_in;

  insert into public.folio_charges (
    booking_id,
    description,
    amount_ugx,
    category,
    posted_by
  )
  values (
    new.id,
    v_room_title || ' - ' || v_nights::text || ' night'
      || case when v_nights = 1 then '' else 's' end,
    new.quoted_total_ugx,
    'accommodation',
    null
  )
  on conflict (booking_id)
    where category = 'accommodation' and voided_at is null
  do update set
    description = excluded.description,
    amount_ugx = excluded.amount_ugx;

  if new.payment_provider = 'pesapal' and new.paid_at is not null then
    select pa.amount_ugx
    into v_paid_amount
    from public.payment_attempts pa
    where pa.booking_id = new.id
      and pa.provider = 'pesapal'
      and (
        pa.provider_reference = new.order_tracking_id
        or pa.verified_payment_status = 'paid'
      )
    order by
      case when pa.provider_reference = new.order_tracking_id then 0 else 1 end,
      pa.verified_at desc nulls last,
      pa.created_at desc
    limit 1;

    insert into public.folio_payments (
      booking_id,
      amount_ugx,
      method,
      reference,
      recorded_by,
      recorded_at
    )
    values (
      new.id,
      coalesce(v_paid_amount, new.quoted_total_ugx),
      'pesapal',
      new.payment_reference,
      null,
      new.paid_at
    )
    on conflict (booking_id) where method = 'pesapal' do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_sync_folio on public.bookings;
create trigger bookings_sync_folio
after update of
  status,
  paid_at,
  quoted_total_ugx,
  check_in,
  check_out,
  room_type_id
on public.bookings
for each row
execute function public.sync_booking_folio();

-- Repair active accommodation charges for existing operational bookings.
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
  rt.title || ' - ' || (b.check_out - b.check_in)::text || ' night'
    || case when (b.check_out - b.check_in) = 1 then '' else 's' end,
  b.quoted_total_ugx,
  'accommodation',
  null,
  coalesce(b.paid_at, b.created_at, now())
from public.bookings b
join public.room_types rt on rt.id = b.room_type_id
where b.status in (
  'confirmed',
  'awaiting_confirmation',
  'checked_in',
  'checked_out'
)
on conflict (booking_id)
  where category = 'accommodation' and voided_at is null
do update set
  description = excluded.description,
  amount_ugx = excluded.amount_ugx;

-- A later booking edit must never inflate the historical amount paid.
with paid_attempts as (
  select distinct on (pa.booking_id)
    pa.booking_id,
    pa.amount_ugx
  from public.payment_attempts pa
  join public.bookings b on b.id = pa.booking_id
  where pa.provider = 'pesapal'
    and (
      pa.provider_reference = b.order_tracking_id
      or pa.verified_payment_status = 'paid'
    )
  order by
    pa.booking_id,
    case when pa.provider_reference = b.order_tracking_id then 0 else 1 end,
    pa.verified_at desc nulls last,
    pa.created_at desc
)
update public.folio_payments fp
set amount_ugx = paid_attempts.amount_ugx
from paid_attempts
where fp.method = 'pesapal'
  and fp.booking_id = paid_attempts.booking_id
  and fp.amount_ugx <> paid_attempts.amount_ugx;

commit;
