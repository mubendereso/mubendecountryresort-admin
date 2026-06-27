-- Maintenance Work Orders V1. Operational maintenance records are deliberately
-- independent from housekeeping status and sellable room inventory.
begin;

create sequence if not exists public.maintenance_work_order_number_seq;

create table if not exists public.maintenance_work_orders (
  id                   uuid        primary key default gen_random_uuid(),
  work_order_number    text        not null unique default (
    'MWO-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('public.maintenance_work_order_number_seq')::text, 6, '0')
  ),
  room_unit_id         uuid        references public.room_units(id) on delete set null,
  room_type_id         uuid        references public.room_types(id) on delete set null,
  reported_by          uuid        references public.admin_users(id) on delete set null,
  assigned_to          uuid        references public.admin_users(id) on delete set null,
  external_vendor_name text,
  category             text        not null check (category in (
    'plumbing', 'electrical', 'hvac', 'furniture', 'bathroom', 'internet',
    'television', 'appliance', 'painting', 'cleaning_damage', 'structural',
    'pest_control', 'landscaping', 'other'
  )),
  priority             text        not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status               text        not null default 'open' check (status in (
    'open', 'assigned', 'in_progress', 'waiting_parts', 'on_hold', 'completed', 'cancelled'
  )),
  title                text        not null,
  description          text        not null,
  reported_at          timestamptz not null default now(),
  scheduled_for        timestamptz,
  expected_return_at   timestamptz,
  started_at           timestamptz,
  completed_at         timestamptz,
  estimated_cost_ugx   bigint      check (estimated_cost_ugx is null or estimated_cost_ugx >= 0),
  actual_cost_ugx      bigint      check (actual_cost_ugx is null or actual_cost_ugx >= 0),
  resolution_notes     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint maintenance_work_orders_completion_check check (
    (status = 'completed' and completed_at is not null and resolution_notes is not null)
    or status <> 'completed'
  )
);

create index if not exists maintenance_work_orders_status_idx
  on public.maintenance_work_orders(status, priority, reported_at desc);
create index if not exists maintenance_work_orders_room_idx
  on public.maintenance_work_orders(room_unit_id, reported_at desc) where room_unit_id is not null;
create index if not exists maintenance_work_orders_assignee_idx
  on public.maintenance_work_orders(assigned_to, status, reported_at desc) where assigned_to is not null;
create index if not exists maintenance_work_orders_search_idx
  on public.maintenance_work_orders(lower(work_order_number), lower(title));

drop trigger if exists maintenance_work_orders_set_updated_at on public.maintenance_work_orders;
create trigger maintenance_work_orders_set_updated_at
before update on public.maintenance_work_orders
for each row execute function public.set_updated_at();

create table if not exists public.maintenance_activity (
  id              uuid        primary key default gen_random_uuid(),
  work_order_id   uuid        not null references public.maintenance_work_orders(id) on delete restrict,
  actor           uuid        references public.admin_users(id) on delete set null,
  action          text        not null,
  previous_status text,
  new_status      text,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists maintenance_activity_work_order_idx
  on public.maintenance_activity(work_order_id, created_at, id);

create table if not exists public.maintenance_photos (
  id            uuid        primary key default gen_random_uuid(),
  work_order_id uuid        not null references public.maintenance_work_orders(id) on delete restrict,
  filename      text        not null,
  storage_path  text        not null,
  uploaded_by   uuid        references public.admin_users(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);

create index if not exists maintenance_photos_work_order_idx
  on public.maintenance_photos(work_order_id, uploaded_at, id);

create or replace function public.prevent_maintenance_history_changes()
returns trigger language plpgsql as $$
begin
  raise exception 'Maintenance activity history is immutable';
end;
$$;

drop trigger if exists maintenance_activity_immutable on public.maintenance_activity;
create trigger maintenance_activity_immutable
before update or delete on public.maintenance_activity
for each row execute function public.prevent_maintenance_history_changes();

drop trigger if exists maintenance_work_orders_sync on public.maintenance_work_orders;
create trigger maintenance_work_orders_sync
after insert or update or delete on public.maintenance_work_orders
for each row execute function public.record_sync_change();

drop trigger if exists maintenance_activity_sync on public.maintenance_activity;
create trigger maintenance_activity_sync
after insert or update or delete on public.maintenance_activity
for each row execute function public.record_sync_change();

drop trigger if exists maintenance_photos_sync on public.maintenance_photos;
create trigger maintenance_photos_sync
after insert or update or delete on public.maintenance_photos
for each row execute function public.record_sync_change();

comment on table public.maintenance_work_orders is
  'Operational fault and repair records. Creating a work order never changes housekeeping status or room availability.';
comment on table public.maintenance_activity is
  'Immutable work-order activity timeline.';
comment on table public.maintenance_photos is
  'R2-backed photos attached to maintenance work orders.';

commit;
