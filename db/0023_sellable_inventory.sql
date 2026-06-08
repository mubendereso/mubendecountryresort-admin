-- =====================================================================
-- Mubende Country Resort - sellable inventory excludes out-of-order rooms
-- =====================================================================
-- Aligns booking availability with physical room readiness. An out-of-order
-- unit cannot be sold, and confirmed/checked-in bookings must always resolve
-- to a safe physical unit. Awaiting-confirmation bookings may remain
-- unassigned because they represent a paid inventory conflict for review.
-- =====================================================================

begin;

create or replace function public.room_type_units_available(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date
)
returns int
language sql
stable
set search_path = public
as $$
  select greatest(
    rt.inventory_count
      - coalesce((
          select count(*)
          from public.room_units ru
          where ru.room_type_id = p_room_type_id
            and ru.housekeeping_status = 'out_of_order'
        ), 0)
      - coalesce((
          select count(*)
          from public.bookings b
          where b.room_type_id = p_room_type_id
            and b.check_in < p_check_out
            and b.check_out > p_check_in
            and (
              b.status in ('awaiting_confirmation', 'confirmed', 'checked_in')
              or (b.status = 'pending_payment' and b.expires_at > now())
            )
        ), 0),
    0
  )::int
  from public.room_types rt
  where rt.id = p_room_type_id;
$$;

revoke all on function public.room_type_units_available(uuid, date, date) from public;

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
      when 'inspection_pending' then 2
      when 'cleaning' then 3
      when 'dirty' then 4
      else 5
    end,
    ru.floor asc nulls last,
    ru.unit_name asc
  for update of ru skip locked
  limit 1;

  if v_unit_id is null and new.status in ('confirmed', 'checked_in') then
    raise exception 'No assignable physical room is available for the selected dates';
  end if;

  new.room_unit_id := v_unit_id;
  return new;
end;
$$;

revoke all on function public.booking_auto_assign_room_unit() from public;

commit;
