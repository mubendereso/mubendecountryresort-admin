-- =====================================================================
-- Mubende Country Resort — staff-created (walk-in / phone) bookings
-- =====================================================================
-- Front-desk staff create reservations directly (phone bookings and
-- same-day walk-ins). Unlike the online flow, there is no Pesapal payment
-- and no inventory hold window: the booking is created as 'confirmed'
-- immediately and settled at the desk via the folio (cash / mobile-money).
--
-- Like create_booking(), this serialises against concurrent bookings for
-- the same room type via a FOR UPDATE lock on room_types, so it MUST stay
-- online-only (cannot be an offline sync mutation).
--
-- guest_email is made optional: walk-in guests frequently have no email,
-- so phone is the required contact instead.
-- =====================================================================

begin;

-- Walk-in guests often have no email; phone becomes the required contact.
alter table public.bookings alter column guest_email drop not null;

create or replace function public.create_staff_booking(
  p_room_type_slug   text,
  p_check_in         date,
  p_check_out        date,
  p_guests_adults    int,
  p_guests_children  int,
  p_guest_full_name  text,
  p_guest_phone      text,
  p_guest_email      text default null,
  p_special_requests text default null,
  p_notes            text default null
)
returns table (
  booking_id       uuid,
  reference        text,
  quoted_total_ugx bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_type public.room_types%rowtype;
  v_today     date := (now() at time zone 'Africa/Kampala')::date;
  v_nights    int;
  v_total     bigint;
  v_available int;
  v_ref       text;
  v_id        uuid;
begin
  if p_check_in is null or p_check_out is null then
    raise exception 'Check-in and check-out are required';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  if p_check_in < v_today then
    raise exception 'Check-in cannot be in the past';
  end if;
  if p_guests_adults is null or p_guests_adults < 1 then
    raise exception 'At least one adult guest is required';
  end if;
  if p_guest_full_name is null or btrim(p_guest_full_name) = '' then
    raise exception 'Guest name is required';
  end if;
  if p_guest_phone is null or btrim(p_guest_phone) = '' then
    raise exception 'Guest phone is required';
  end if;

  -- Lock the room_types row to serialise concurrent booking attempts
  -- against the same room type (same guard as create_booking).
  select * into v_room_type
  from public.room_types
  where slug = p_room_type_slug
    and is_published = true
  for update;

  if not found then
    raise exception 'Room type not found or unavailable';
  end if;

  v_available := public.room_type_units_available(v_room_type.id, p_check_in, p_check_out);
  if v_available <= 0 then
    raise exception 'No availability for the selected dates';
  end if;

  v_nights := (p_check_out - p_check_in);
  v_total  := v_room_type.price_ugx * v_nights;

  v_ref := 'MCR-' || to_char(now() at time zone 'Africa/Kampala', 'YYMMDD')
        || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.bookings (
    reference, room_type_id, check_in, check_out,
    guests_adults, guests_children,
    guest_full_name, guest_email, guest_phone, special_requests,
    status, quoted_total_ugx, notes, payment_provider
    -- expires_at intentionally NULL: confirmed booking, no inventory hold timer
  ) values (
    v_ref, v_room_type.id, p_check_in, p_check_out,
    p_guests_adults, coalesce(p_guests_children, 0),
    btrim(p_guest_full_name),
    nullif(lower(btrim(coalesce(p_guest_email, ''))), ''),
    btrim(p_guest_phone),
    nullif(btrim(coalesce(p_special_requests, '')), ''),
    'confirmed', v_total,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'desk'
  )
  returning id into v_id;

  return query select v_id, v_ref, v_total;
end;
$$;

revoke all on function public.create_staff_booking(text, date, date, int, int, text, text, text, text, text) from public;

commit;
