-- Record negotiated room prices as explicit folio discounts.
begin;

alter table public.folio_charges
  add column if not exists discount_scope text
  check (discount_scope is null or discount_scope = 'room_price');

create or replace function public.create_staff_booking_with_folio(
  p_room_type_slug text,
  p_check_in date,
  p_check_out date,
  p_guests_adults int,
  p_guests_children int,
  p_guest_full_name text,
  p_guest_phone text,
  p_guest_email text,
  p_special_requests text,
  p_notes text,
  p_agreed_room_price_ugx bigint,
  p_posted_by uuid
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
  v_discount bigint;
  v_discount_percent numeric;
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

  if p_agreed_room_price_ugx is not null
    and (p_agreed_room_price_ugx <= 0 or p_agreed_room_price_ugx > v_total) then
    raise exception 'Agreed room price must be greater than zero and no more than the standard room total';
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

  if p_agreed_room_price_ugx is not null
    and p_agreed_room_price_ugx < v_total then
    v_discount := v_total - p_agreed_room_price_ugx;
    v_discount_percent := round((v_discount::numeric * 100) / v_total, 1);

    insert into public.folio_charges (
      booking_id,
      description,
      amount_ugx,
      category,
      discount_scope,
      posted_by
    )
    values (
      v_booking_id,
      'Agreed room price ' || p_agreed_room_price_ugx::text
        || ' UGX (' || v_discount_percent::text || '% discount)',
      v_discount,
      'discount',
      'room_price',
      p_posted_by
    );
  end if;

  return query select v_booking_id, v_reference, v_total;
end;
$$;

revoke all on function public.create_staff_booking_with_folio(
  text, date, date, int, int, text, text, text, text, text, bigint, uuid
) from public;

commit;
