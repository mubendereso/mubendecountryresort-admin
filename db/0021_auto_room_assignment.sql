-- =====================================================================
-- Mubende Country Resort - automatic physical room assignment
-- =====================================================================
-- Assigns a safe physical room whenever a booking becomes operationally
-- active. Pending online payments remain unassigned until payment is
-- confirmed. Existing assignments are retained only while they still match
-- the room type, stay dates, room condition, and other active reservations.
--
-- Staff can still change or remove an assignment from the admin UI.
-- =====================================================================

begin;

create or replace function public.booking_auto_assign_room_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_id uuid;
begin
  if new.status not in ('awaiting_confirmation', 'confirmed', 'checked_in') then
    return new;
  end if;

  -- Keep an existing assignment only if it remains safe for the updated stay.
  if new.room_unit_id is not null and exists (
    select 1
    from public.room_units ru
    where ru.id = new.room_unit_id
      and ru.room_type_id = new.room_type_id
      and ru.housekeeping_status <> 'out_of_order'
      and not exists (
        select 1
        from public.bookings other
        where other.room_unit_id = ru.id
          and other.id <> new.id
          and other.status in ('awaiting_confirmation', 'confirmed', 'checked_in')
          and other.check_in < new.check_out
          and other.check_out > new.check_in
      )
  ) then
    return new;
  end if;

  select ru.id
  into v_unit_id
  from public.room_units ru
  where ru.room_type_id = new.room_type_id
    and ru.housekeeping_status <> 'out_of_order'
    and not exists (
      select 1
      from public.bookings other
      where other.room_unit_id = ru.id
        and other.id <> new.id
        and other.status in ('awaiting_confirmation', 'confirmed', 'checked_in')
        and other.check_in < new.check_out
        and other.check_out > new.check_in
    )
  order by
    case ru.housekeeping_status
      when 'inspected' then 0
      when 'clean' then 1
      when 'cleaning' then 2
      when 'dirty' then 3
      else 4
    end,
    ru.floor asc nulls last,
    ru.unit_name asc
  for update of ru skip locked
  limit 1;

  new.room_unit_id := v_unit_id;
  return new;
end;
$$;

revoke all on function public.booking_auto_assign_room_unit() from public;

drop trigger if exists bookings_auto_assign_room_unit on public.bookings;
create trigger bookings_auto_assign_room_unit
before insert or update of room_type_id, check_in, check_out, status
on public.bookings
for each row execute function public.booking_auto_assign_room_unit();

-- Bring current active reservations into the same invariant. Updating status
-- to itself intentionally invokes the trigger in chronological order.
do $$
declare
  v_booking record;
begin
  for v_booking in
    select id
    from public.bookings
    where status in ('awaiting_confirmation', 'confirmed', 'checked_in')
    order by check_in asc, created_at asc
  loop
    update public.bookings
    set status = status
    where id = v_booking.id;
  end loop;
end;
$$;

commit;
