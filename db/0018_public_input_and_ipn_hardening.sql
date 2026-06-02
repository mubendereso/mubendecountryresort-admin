-- =====================================================================
-- Mubende Country Resort - public input caps and IPN idempotency
-- =====================================================================
-- Fixes the remaining public storage-abuse and duplicate-IPN findings:
--   - online booking fields are capped in the RPC and table constraints;
--   - Pesapal IPN events have a caller-supplied dedupe key with a unique
--     partial index, so repeated provider notifications update/reuse one row.
-- =====================================================================

begin;

alter table public.bookings
  add constraint bookings_guest_full_name_len_chk
    check (char_length(guest_full_name) <= 120) not valid,
  add constraint bookings_guest_email_len_chk
    check (char_length(guest_email) <= 200) not valid,
  add constraint bookings_guest_phone_len_chk
    check (guest_phone is null or char_length(guest_phone) <= 40) not valid,
  add constraint bookings_special_requests_len_chk
    check (special_requests is null or char_length(special_requests) <= 1000) not valid,
  add constraint bookings_notes_len_chk
    check (notes is null or char_length(notes) <= 2000) not valid;

alter table public.pesapal_ipn_events
  add column if not exists dedupe_key text;

create unique index if not exists pesapal_ipn_events_dedupe_uidx
  on public.pesapal_ipn_events(dedupe_key)
  where dedupe_key is not null;

grant select (dedupe_key) on public.pesapal_ipn_events to mcr_storefront_app;
grant insert (dedupe_key) on public.pesapal_ipn_events to mcr_storefront_app;

create or replace function public.create_online_booking(
  p_room_type_slug text,
  p_check_in date,
  p_check_out date,
  p_guests_adults int,
  p_guests_children int,
  p_guest_full_name text,
  p_guest_email text,
  p_guest_phone text,
  p_special_requests text
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
  v_room_type public.room_types%rowtype;
  v_nights    int;
  v_total     bigint;
  v_available int;
  v_ref       text;
  v_id        uuid;
  v_slug      text := nullif(btrim(coalesce(p_room_type_slug, '')), '');
  v_name      text := nullif(btrim(coalesce(p_guest_full_name, '')), '');
  v_email     text := lower(nullif(btrim(coalesce(p_guest_email, '')), ''));
  v_phone     text := nullif(btrim(coalesce(p_guest_phone, '')), '');
  v_requests  text := nullif(btrim(coalesce(p_special_requests, '')), '');
begin
  if p_check_in is null or p_check_out is null then
    raise exception 'Check-in and check-out are required';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  if p_check_in < current_date then
    raise exception 'Check-in date cannot be in the past';
  end if;
  if p_guests_adults is null or p_guests_adults < 1 then
    raise exception 'At least one adult guest is required';
  end if;
  if v_slug is null then
    raise exception 'Room type is required';
  end if;
  if char_length(v_slug) > 120 then
    raise exception 'Room type is invalid';
  end if;
  if v_name is null then
    raise exception 'Guest name is required';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'Guest name is too long';
  end if;
  if v_email is null then
    raise exception 'Guest email is required';
  end if;
  if char_length(v_email) > 200 then
    raise exception 'Guest email is too long';
  end if;
  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Guest email is invalid';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'Guest phone is too long';
  end if;
  if v_requests is not null and char_length(v_requests) > 1000 then
    raise exception 'Special requests are too long';
  end if;

  -- Read room type without locking - we are not holding inventory here.
  select * into v_room_type
  from public.room_types
  where slug = v_slug
    and is_published = true;

  if not found then
    raise exception 'Room type not found or unavailable';
  end if;

  -- Informational check only: fast-fail if clearly unavailable.
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
    status, quoted_total_ugx
  ) values (
    v_ref, v_room_type.id, p_check_in, p_check_out,
    p_guests_adults, coalesce(p_guests_children, 0),
    v_name, v_email, v_phone, v_requests,
    'pending_payment', v_total
  )
  returning id into v_id;

  return query select v_id, v_ref, v_total;
end;
$$;

revoke all on function public.create_online_booking(text, date, date, int, int, text, text, text, text) from public;
grant execute on function public.create_online_booking(text, date, date, int, int, text, text, text, text) to mcr_storefront_app;

commit;
