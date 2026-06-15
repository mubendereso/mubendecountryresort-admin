-- Group bookings v1: reservation_groups + nullable bookings.group_id.
-- Groups are umbrellas over normal bookings; they do not replace the
-- atomic booking/folio/receipt/assignment/housekeeping flow.
begin;

create table if not exists public.reservation_groups (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  group_name text not null,
  organizer_name text,
  organizer_email text,
  organizer_phone text,
  notes text,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(group_name) <> ''),
  check (organizer_email is null or position('@' in organizer_email) > 1)
);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'reservation_groups'
  ) then
    execute 'drop trigger if exists reservation_groups_set_updated_at on public.reservation_groups';
  end if;
end
$$;

create trigger reservation_groups_set_updated_at
before update on public.reservation_groups
for each row execute function public.set_updated_at();

create index if not exists reservation_groups_created_at_idx
  on public.reservation_groups(created_at desc);
create index if not exists reservation_groups_name_idx
  on public.reservation_groups(lower(group_name));

alter table public.bookings
  add column if not exists group_id uuid references public.reservation_groups(id) on delete set null;

create index if not exists bookings_group_idx
  on public.bookings(group_id, created_at desc)
  where group_id is not null;

comment on table public.reservation_groups is
  'Umbrella reservation groups that collect multiple ordinary bookings without changing booking-level accounting or operations.';

commit;
