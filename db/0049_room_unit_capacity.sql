-- =====================================================================
-- Mubende Country Resort - room-unit capacity guard
-- =====================================================================
-- Keep complete offline room-unit snapshots bounded until incremental room
-- unit synchronization is implemented. The advisory lock makes the count
-- check safe when concurrent transactions insert room units.

begin;

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.room_units;
  if v_count > 1000 then
    raise exception 'Existing room-unit count (%) exceeds the configured capacity of 1000', v_count;
  end if;
end;
$$;

create or replace function public.enforce_room_unit_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('mcr:room_units:capacity'));

  if (select count(*) from public.room_units) >= 1000 then
    raise exception 'Room-unit capacity of 1000 has been reached';
  end if;

  return new;
end;
$$;

drop trigger if exists room_units_capacity on public.room_units;
create trigger room_units_capacity
before insert on public.room_units
for each row execute function public.enforce_room_unit_capacity();

revoke all on function public.enforce_room_unit_capacity() from public;

commit;
