-- =====================================================================
-- Mubende Country Resort — housekeeping room units
-- =====================================================================
-- Adds individual physical room units under each room type so staff can
-- track readiness after checkout and before the next arrival.
-- =====================================================================

begin;

create table if not exists public.room_units (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.room_types(id) on delete cascade,
  unit_name text not null,
  floor int,
  housekeeping_status text not null default 'clean'
    check (housekeeping_status in ('dirty', 'cleaning', 'clean', 'inspected', 'out_of_order')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_type_id, unit_name)
);

create index if not exists room_units_room_type_idx
  on public.room_units(room_type_id, unit_name);

create index if not exists room_units_housekeeping_status_idx
  on public.room_units(housekeeping_status, updated_at desc);

drop trigger if exists room_units_set_updated_at on public.room_units;
create trigger room_units_set_updated_at
before update on public.room_units
for each row execute function public.set_updated_at();

insert into public.room_units (room_type_id, unit_name, housekeeping_status)
select
  rt.id,
  case
    when rt.inventory_count = 1 then rt.title
    else rt.title || ' ' || gs.unit_number::text
  end as unit_name,
  'clean'
from public.room_types rt
cross join lateral generate_series(1, greatest(rt.inventory_count, 0)) as gs(unit_number)
on conflict (room_type_id, unit_name) do nothing;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'record_sync_change'
  ) and not exists (
    select 1
    from pg_trigger
    where tgname = 'room_units_sync'
      and tgrelid = 'public.room_units'::regclass
  ) then
    create trigger room_units_sync
      after insert or update or delete on public.room_units
      for each row execute function public.record_sync_change();
  end if;
end;
$$;

commit;
