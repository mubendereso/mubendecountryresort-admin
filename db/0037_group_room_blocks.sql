-- Group room blocks v1: inventory holds linked to reservation groups.
-- Blocks reserve room-type inventory before guest names are known.
-- Safer operational rule: only active room blocks under active groups reduce
-- sellable availability. Archived and closed groups stay preserved, but they
-- do not keep inventory held unless the group is active again.
begin;

create table if not exists public.group_room_blocks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.reservation_groups(id) on delete restrict,
  room_type_id uuid not null references public.room_types(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  blocked_units integer not null check (blocked_units > 0),
  status text not null default 'active',
  released_units integer not null default 0 check (released_units >= 0),
  released_at timestamptz,
  released_by uuid references public.admin_users(id) on delete set null,
  release_reason text,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in),
  check (status in ('active', 'released', 'expired', 'converted')),
  check (released_units <= blocked_units),
  check (status <> 'active' or released_units < blocked_units),
  check (status <> 'released' or released_at is not null),
  check (status <> 'released' or released_units = blocked_units)
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'group_room_blocks'
  ) then
    execute 'drop trigger if exists group_room_blocks_set_updated_at on public.group_room_blocks';
  end if;
end
$$;

create trigger group_room_blocks_set_updated_at
before update on public.group_room_blocks
for each row execute function public.set_updated_at();

create index if not exists group_room_blocks_group_id_idx
  on public.group_room_blocks(group_id, created_at desc);
create index if not exists group_room_blocks_room_type_dates_idx
  on public.group_room_blocks(room_type_id, check_in, check_out);
create index if not exists group_room_blocks_active_availability_idx
  on public.group_room_blocks(room_type_id, check_in, check_out)
  where status = 'active';

comment on table public.group_room_blocks is
  'Inventory holds for reservation groups. They reduce sellable availability but are not guest bookings.';

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
        ), 0)
      - coalesce((
          select sum(greatest(grb.blocked_units - grb.released_units, 0))
          from public.group_room_blocks grb
          join public.reservation_groups rg on rg.id = grb.group_id
          where grb.room_type_id = p_room_type_id
            and grb.status = 'active'
            and rg.status = 'active'
            and grb.check_in < p_check_out
            and grb.check_out > p_check_in
        ), 0),
    0
  )::int
  from public.room_types rt
  where rt.id = p_room_type_id;
$$;

revoke all on function public.room_type_units_available(uuid, date, date) from public;

commit;
