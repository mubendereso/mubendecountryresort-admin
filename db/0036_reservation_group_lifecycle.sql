-- Group lifecycle v2: add active/archived/closed states to reservation_groups.
-- Active groups remain visible in normal lists. Closed groups are completed
-- operationally. Archived groups are hidden from normal lists but preserved.
begin;

alter table public.reservation_groups
  add column if not exists status text;

update public.reservation_groups
set status = 'active'
where status is null;

alter table public.reservation_groups
  alter column status set default 'active';

alter table public.reservation_groups
  alter column status set not null;

alter table public.reservation_groups
  drop constraint if exists reservation_groups_status_check;

alter table public.reservation_groups
  add constraint reservation_groups_status_check
  check (status in ('active', 'archived', 'closed'));

create index if not exists reservation_groups_status_created_at_idx
  on public.reservation_groups(status, created_at desc);

comment on column public.reservation_groups.status is
  'Lifecycle state for the umbrella record. Group dates remain the default stay window; room-block dates will be separate in V2.';

commit;
