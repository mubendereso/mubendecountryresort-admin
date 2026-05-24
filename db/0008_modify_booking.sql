-- =====================================================================
-- Mubende Country Resort — modify an existing booking
-- =====================================================================
-- Lets staff edit a 'confirmed' or 'checked_in' booking: room type,
-- dates, guest count, and contact details. Inventory-affecting, so it
-- locks the (new) room_types row FOR UPDATE and re-checks availability
-- EXCLUDING the booking being modified (it already occupies a unit).
-- Online-only — never an offline sync mutation.
--
-- Folio reconciliation: for a 'checked_in' booking the accommodation
-- charge was already auto-posted on check-in. When the recalculated
-- total changes, the active (non-voided) accommodation charge is updated
-- in place so the folio stays consistent. 'confirmed' bookings have no
-- charge yet, so only quoted_total_ugx is updated.
-- =====================================================================

begin;

create or replace function public.modify_booking(
  p_booking_id       uuid,
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
  v_booking   public.bookings%rowtype;
  v_room_type public.room_types%rowtype;
  v_today     date := (now() at time zone 'Africa/Kampala')::date;
  v_nights    int;
  v_total     bigint;
  v_used      int;
  v_desc      text;
begin
  if p_check_in is null or p_check_out is null then
    raise exception 'Check-in and check-out are required';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
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

  -- Lock the booking row first.
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status not in ('confirmed', 'checked_in') then
    raise exception 'Only confirmed or checked-in bookings can be modified';
  end if;

  -- A not-yet-arrived ('confirmed') booking cannot be moved into the past.
  -- A checked-in guest is already in house, so their check-in may legitimately
  -- be in the past — skip the past-date guard in that case.
  if v_booking.status = 'confirmed' and p_check_in < v_today then
    raise exception 'Check-in cannot be in the past';
  end if;

  -- Lock the (new) room type to serialise against concurrent bookings.
  select * into v_room_type
  from public.room_types
  where slug = p_room_type_slug
    and is_published = true
  for update;

  if not found then
    raise exception 'Room type not found or unavailable';
  end if;

  -- Availability on the target room type / dates, EXCLUDING this booking.
  select count(*) into v_used
  from public.bookings b
  where b.room_type_id = v_room_type.id
    and b.id <> p_booking_id
    and b.check_in < p_check_out
    and b.check_out > p_check_in
    and (
      b.status in ('awaiting_confirmation', 'confirmed', 'checked_in')
      or (b.status = 'pending_payment' and b.expires_at > now())
    );

  if v_room_type.inventory_count - v_used <= 0 then
    raise exception 'No availability for the selected dates';
  end if;

  v_nights := (p_check_out - p_check_in);
  v_total  := v_room_type.price_ugx * v_nights;

  update public.bookings set
    room_type_id     = v_room_type.id,
    check_in         = p_check_in,
    check_out        = p_check_out,
    guests_adults    = p_guests_adults,
    guests_children  = coalesce(p_guests_children, 0),
    guest_full_name  = btrim(p_guest_full_name),
    guest_email      = nullif(lower(btrim(coalesce(p_guest_email, ''))), ''),
    guest_phone      = btrim(p_guest_phone),
    special_requests = nullif(btrim(coalesce(p_special_requests, '')), ''),
    notes            = nullif(btrim(coalesce(p_notes, '')), ''),
    quoted_total_ugx = v_total
  where id = p_booking_id;

  -- Reconcile the already-posted accommodation charge for in-house guests.
  if v_booking.status = 'checked_in' then
    v_desc := v_room_type.title || ' – ' || v_nights::text || ' night'
           || case when v_nights = 1 then '' else 's' end;

    update public.folio_charges set
      amount_ugx  = v_total,
      description = v_desc
    where booking_id = p_booking_id
      and category  = 'accommodation'
      and voided_at is null;
  end if;

  return query select p_booking_id, v_booking.reference, v_total;
end;
$$;

revoke all on function public.modify_booking(uuid, text, date, date, int, int, text, text, text, text, text) from public;

commit;
