-- Atomic folio posting for staff-created bookings.
begin;

create or replace function public.create_staff_booking_with_folio(
  p_room_type_slug text,
  p_check_in date,
  p_check_out date,
  p_guests_adults int,
  p_guests_children int,
  p_guest_full_name text,
  p_guest_phone text,
  p_guest_email text default null,
  p_special_requests text default null,
  p_notes text default null,
  p_posted_by uuid default null
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
  v_booking_id uuid;
  v_reference text;
  v_total bigint;
  v_room_title text;
  v_nights int;
begin
  select created.booking_id, created.reference, created.quoted_total_ugx
  into v_booking_id, v_reference, v_total
  from public.create_staff_booking(
    p_room_type_slug,
    p_check_in,
    p_check_out,
    p_guests_adults,
    p_guests_children,
    p_guest_full_name,
    p_guest_phone,
    p_guest_email,
    p_special_requests,
    p_notes
  ) created;

  if v_booking_id is null then
    raise exception 'Staff booking could not be created';
  end if;

  select rt.title into v_room_title
  from public.room_types rt
  where rt.slug = p_room_type_slug;

  v_nights := p_check_out - p_check_in;

  insert into public.folio_charges (
    booking_id, description, amount_ugx, category, posted_by
  )
  values (
    v_booking_id,
    v_room_title || ' - ' || v_nights::text || ' night'
      || case when v_nights = 1 then '' else 's' end,
    v_total,
    'accommodation',
    p_posted_by
  );

  return query select v_booking_id, v_reference, v_total;
end;
$$;

revoke all on function public.create_staff_booking_with_folio(
  text, date, date, int, int, text, text, text, text, text, uuid
) from public;

-- Repair every desk booking that reached the folio lifecycle without its
-- accommodation charge, including bookings created with a deposit.
insert into public.folio_charges (
  booking_id, description, amount_ugx, category, posted_by, posted_at
)
select
  b.id,
  rt.title || ' - ' || (b.check_out::date - b.check_in::date)::text
    || ' night'
    || case when (b.check_out::date - b.check_in::date) = 1 then '' else 's' end,
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
