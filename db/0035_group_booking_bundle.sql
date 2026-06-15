-- Group booking bundle v1: atomic create of a reservation group and its member bookings.
begin;

create or replace function public.create_reservation_group_bundle(
  p_reference text,
  p_group_name text,
  p_organizer_name text,
  p_organizer_email text,
  p_organizer_phone text,
  p_notes text,
  p_group_check_in date,
  p_group_check_out date,
  p_cards jsonb,
  p_deposit_amount bigint,
  p_deposit_method text,
  p_deposit_reference text,
  p_posted_by uuid
)
returns table (
  group_id uuid,
  group_reference text,
  booking_id uuid,
  booking_reference text,
  room_type_title text,
  card_index int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_card jsonb;
  v_index int := 0;
  v_room_slug text;
  v_room_type public.room_types%rowtype;
  v_check_in date;
  v_check_out date;
  v_adults int;
  v_children int;
  v_agreed_room_price bigint;
  v_deposit_amount bigint;
  v_guest_full_name text;
  v_guest_email text;
  v_guest_phone text;
  v_special_requests text;
  v_card_notes text;
  v_created record;
  v_final_room_price bigint;
  v_total_deposit bigint := 0;
begin
  if p_group_name is null or btrim(p_group_name) = '' then
    raise exception 'Group name is required';
  end if;
  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'Group reference is required';
  end if;
  if p_group_check_in is null or p_group_check_out is null then
    raise exception 'Group check-in and check-out are required';
  end if;
  if p_group_check_out <= p_group_check_in then
    raise exception 'Group check-out must be after check-in';
  end if;
  if p_group_check_in < current_date then
    raise exception 'Group check-in cannot be in the past';
  end if;
  if p_organizer_email is null or btrim(p_organizer_email) = '' then
    raise exception 'Organizer email is required for group bookings';
  end if;
  if p_deposit_amount is not null and p_deposit_amount < 0 then
    raise exception 'Group deposit cannot be negative';
  end if;
  if jsonb_typeof(p_cards) is distinct from 'array' or jsonb_array_length(p_cards) = 0 then
    raise exception 'Add at least one room card to the group booking';
  end if;

  insert into public.reservation_groups (
    reference,
    group_name,
    organizer_name,
    organizer_email,
    organizer_phone,
    notes,
    created_by
  ) values (
    p_reference,
    btrim(p_group_name),
    nullif(btrim(coalesce(p_organizer_name, '')), ''),
    lower(btrim(p_organizer_email)),
    nullif(btrim(coalesce(p_organizer_phone, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_posted_by
  )
  returning id into v_group_id;

  for v_card in
    select value
    from jsonb_array_elements(p_cards)
  loop
    v_index := v_index + 1;
    v_room_slug := nullif(btrim(coalesce(v_card->>'roomTypeSlug', '')), '');
    if v_room_slug is null then
      raise exception 'Select a room type for each room card';
    end if;

    select *
      into v_room_type
    from public.room_types
    where slug = v_room_slug
      and is_published = true
      and archived_at is null
    for update;

    if not found then
      raise exception 'Room type not found or unavailable';
    end if;

    v_check_in := coalesce(nullif(v_card->>'checkIn', '')::date, p_group_check_in);
    v_check_out := coalesce(nullif(v_card->>'checkOut', '')::date, p_group_check_out);
    if v_check_in is null or v_check_out is null then
      raise exception 'Each room card needs check-in and check-out dates';
    end if;
    if v_check_out <= v_check_in then
      raise exception 'Room check-out must be after check-in';
    end if;
    if v_check_in < current_date then
      raise exception 'Room check-in cannot be in the past';
    end if;

    if public.room_type_units_available(v_room_type.id, v_check_in, v_check_out) <= 0 then
      raise exception 'No availability for % between % and %', v_room_type.title, v_check_in, v_check_out;
    end if;

    v_adults := greatest(1, coalesce(nullif(v_card->>'guestsAdults', '')::int, 1));
    v_children := greatest(0, coalesce(nullif(v_card->>'guestsChildren', '')::int, 0));
    v_agreed_room_price := nullif(nullif(btrim(coalesce(v_card->>'agreedRoomPriceUgx', '')), ''), '0')::bigint;
    v_deposit_amount := greatest(0, coalesce(nullif(v_card->>'depositAmountUgx', '')::bigint, 0));
    v_special_requests := nullif(btrim(coalesce(v_card->>'specialRequests', '')), '');
    v_card_notes := nullif(btrim(coalesce(v_card->>'notes', '')), '');
    v_guest_full_name := coalesce(
      nullif(btrim(coalesce(v_card->>'guestFullName', '')), ''),
      p_group_name || ' / ' || v_room_type.title
    );
    v_guest_email := lower(btrim(coalesce(nullif(v_card->>'guestEmail', ''), p_organizer_email)));
    v_guest_phone := nullif(btrim(coalesce(nullif(v_card->>'guestPhone', ''), p_organizer_phone)), '');

    select
      created.booking_id,
      created.reference,
      created.quoted_total_ugx
      into v_created
    from public.create_staff_booking_with_folio(
      v_room_slug,
      v_check_in,
      v_check_out,
      v_adults,
      v_children,
      v_guest_full_name,
      coalesce(v_guest_phone, ''),
      v_guest_email,
      coalesce(v_special_requests, ''),
      coalesce(v_card_notes, ''),
      v_agreed_room_price,
      p_posted_by
    ) created;

    if v_created.booking_id is null then
      raise exception 'Room booking could not be created for %', v_room_type.title;
    end if;

    v_final_room_price := coalesce(v_agreed_room_price, v_created.quoted_total_ugx);
    if v_deposit_amount > v_final_room_price then
      raise exception 'Deposit cannot be greater than the final room price';
    end if;

    v_total_deposit := v_total_deposit + v_deposit_amount;
    if v_deposit_amount > 0 then
      insert into public.folio_payments (
        booking_id,
        amount_ugx,
        method,
        reference,
        recorded_by,
        recorded_at
      )
      values (
        v_created.booking_id,
        v_deposit_amount,
        p_deposit_method,
        nullif(btrim(coalesce(p_deposit_reference, '')), ''),
        p_posted_by,
        now()
      );
    end if;

    update public.bookings
    set group_id = v_group_id
    where id = v_created.booking_id;

    return query
    select
      v_group_id,
      p_reference,
      v_created.booking_id,
      v_created.reference,
      v_room_type.title,
      v_index;
  end loop;

  if coalesce(p_deposit_amount, 0) <> v_total_deposit then
    raise exception 'Group deposit total does not match the member booking deposits';
  end if;
  if v_total_deposit > 0 then
    if p_deposit_method is null or btrim(p_deposit_method) = '' then
      raise exception 'Select a valid deposit payment method';
    end if;
    if p_deposit_method not in ('cash', 'mpesa', 'card', 'transfer') then
      raise exception 'Select a valid deposit payment method';
    end if;
  end if;
end;
$$;

revoke all on function public.create_reservation_group_bundle(
  text, text, text, text, text, text, date, date, jsonb, bigint, text, text, uuid
) from public;

commit;
