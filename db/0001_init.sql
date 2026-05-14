-- =====================================================================
-- Mubende Country Resort — initial schema
-- =====================================================================
-- Currency: UGX only (no minor unit; `price_ugx` columns hold whole UGX).
-- Payments: Pesapal v3 (auto-confirm booking on successful IPN).
-- Recovery: event-driven (no cron). Durable queue + in-process scheduler
--   triggered opportunistically from payment-adjacent routes.
-- =====================================================================

begin;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_role as enum ('staff', 'admin', 'superadmin');

create type public.booking_status as enum (
  'pending_payment',
  'awaiting_confirmation',  -- reserved for future manual-review flow
  'confirmed',
  'cancelled',
  'checked_in',
  'checked_out',
  'no_show',
  'refunded'
);

create type public.payment_attempt_status as enum (
  'initiating',
  'initiated',
  'rejected',
  'failed'
);

create type public.payment_attempt_failure_phase as enum (
  'pre_provider',
  'provider_rejected',
  'post_provider_unknown'
);

create type public.verified_payment_status as enum (
  'pending',
  'paid',
  'failed',
  'cancelled'
);

-- ---------------------------------------------------------------------
-- Admin users + sessions
-- ---------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role public.user_role not null default 'staff',
  password_hash text not null,
  is_active boolean not null default true,
  last_signed_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (position('@' in email) > 1)
);
create unique index admin_users_email_lower_uidx on public.admin_users(lower(email));

create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

create table public.admin_sessions (
  token_hash text primary key,
  user_id uuid not null references public.admin_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index admin_sessions_user_idx on public.admin_sessions(user_id, expires_at desc);
create index admin_sessions_expires_idx on public.admin_sessions(expires_at);

-- ---------------------------------------------------------------------
-- Content tables
-- ---------------------------------------------------------------------
create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  overview text,
  price_ugx bigint not null check (price_ugx > 0),
  cover_image_url text,
  details text[] not null default '{}',
  amenities text[] not null default '{}',
  dining_hours text[] not null default '{}',
  gallery text[] not null default '{}',
  inventory_count int not null default 1 check (inventory_count >= 0),
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger room_types_set_updated_at
before update on public.room_types
for each row execute function public.set_updated_at();
create index room_types_published_idx on public.room_types(is_published, sort_order);

create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  icon text,
  title text not null,
  description text,
  overview text,
  highlights text[] not null default '{}',
  gallery text[] not null default '{}',
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger amenities_set_updated_at
before update on public.amenities
for each row execute function public.set_updated_at();
create index amenities_published_idx on public.amenities(is_published, sort_order);

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  body text,
  image text,
  overview text,
  details text[] not null default '{}',
  gallery text[] not null default '{}',
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger experiences_set_updated_at
before update on public.experiences
for each row execute function public.set_updated_at();
create index experiences_published_idx on public.experiences(is_published, sort_order);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  image text,
  summary text,
  overview text,
  details text[] not null default '{}',
  gallery text[] not null default '{}',
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger services_set_updated_at
before update on public.services
for each row execute function public.set_updated_at();
create index services_published_idx on public.services(is_published, sort_order);

create table public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger gallery_images_set_updated_at
before update on public.gallery_images
for each row execute function public.set_updated_at();
create index gallery_images_published_idx on public.gallery_images(is_published, sort_order);

-- ---------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  room_type_id uuid not null references public.room_types(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  guests_adults int not null default 1 check (guests_adults > 0),
  guests_children int not null default 0 check (guests_children >= 0),
  guest_full_name text not null,
  guest_email text not null,
  guest_phone text,
  special_requests text,
  status public.booking_status not null default 'pending_payment',
  -- Inventory hold expiry: while status='pending_payment' and expires_at > now()
  -- this booking blocks a unit. Past that point, predicate filters in
  -- room_type_units_available() stop counting it (event-driven fade).
  expires_at timestamptz,
  quoted_total_ugx bigint not null check (quoted_total_ugx > 0),
  notes text,
  -- Payment lifecycle projection (ported from kira_bakery / thesmokehouse) --
  payment_provider text,
  payment_reference text,
  payment_redirect_url text,
  order_tracking_id text,
  active_payment_attempt_id uuid,
  payment_initiation_attempted_at timestamptz,
  payment_initiation_failure_code text,
  payment_initiation_failure_message text,
  payment_initiation_failed_at timestamptz,
  payment_last_verified_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);
create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();
create index bookings_dates_idx on public.bookings(room_type_id, check_in, check_out);
create index bookings_status_idx on public.bookings(status, created_at desc);
create index bookings_email_idx on public.bookings(guest_email);
create index bookings_tracking_idx on public.bookings(order_tracking_id)
  where order_tracking_id is not null;
create index bookings_pending_payment_idx on public.bookings(expires_at)
  where status = 'pending_payment';

-- ---------------------------------------------------------------------
-- Payment attempts (durable initiation journal)
-- Shape mirrors kira_bakery's robust-payment design.
-- ---------------------------------------------------------------------
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  local_attempt_id uuid not null default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  attempt_number int not null default 1 check (attempt_number > 0),
  provider text not null default 'pesapal',
  provider_reference text,             -- Pesapal order_tracking_id
  merchant_reference text not null,    -- our reference passed to Pesapal
  amount_ugx bigint not null check (amount_ugx > 0),
  status public.payment_attempt_status not null default 'initiating',
  redirect_url text,
  raw_request_payload jsonb,
  raw_provider_response jsonb,
  provider_request_started_at timestamptz,
  response_received_at timestamptz,
  failure_code text,
  failure_message text,
  failure_phase public.payment_attempt_failure_phase,
  verified_payment_status public.verified_payment_status,
  last_verification_response jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payment_attempts_set_updated_at
before update on public.payment_attempts
for each row execute function public.set_updated_at();
create unique index payment_attempts_local_uidx on public.payment_attempts(local_attempt_id);
create unique index payment_attempts_booking_attempt_uidx
  on public.payment_attempts(booking_id, attempt_number);
create unique index payment_attempts_provider_ref_uidx
  on public.payment_attempts(provider, provider_reference)
  where provider_reference is not null;
create index payment_attempts_booking_created_idx
  on public.payment_attempts(booking_id, created_at desc);
create index payment_attempts_status_created_idx
  on public.payment_attempts(status, created_at desc);

alter table public.bookings
  add constraint bookings_active_payment_attempt_fk
  foreign key (active_payment_attempt_id)
  references public.payment_attempts(id)
  on delete set null;

create index bookings_active_attempt_idx
  on public.bookings(active_payment_attempt_id)
  where active_payment_attempt_id is not null;

-- ---------------------------------------------------------------------
-- Pesapal IPN events (raw audit + idempotency)
-- ---------------------------------------------------------------------
create table public.pesapal_ipn_events (
  id uuid primary key default gen_random_uuid(),
  order_tracking_id text not null,
  notification_type text,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index pesapal_ipn_events_otid_idx on public.pesapal_ipn_events(order_tracking_id, received_at desc);

-- ---------------------------------------------------------------------
-- Pending payment recoveries (durable queue, ported from smokehouse phase-37)
-- ---------------------------------------------------------------------
create table public.pending_payment_recoveries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on update cascade on delete cascade,
  provider text not null default 'pesapal',
  order_tracking_id text not null,
  status text not null default 'pending',
  next_attempt_at timestamptz not null default now(),
  attempt_count int not null default 0,
  max_attempts int not null default 500,
  locked_at timestamptz,
  locked_by text,
  last_verified_at timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_payment_recoveries_status_chk
    check (status in ('pending', 'processing', 'retrying', 'completed', 'failed')),
  constraint pending_payment_recoveries_attempt_count_chk
    check (attempt_count >= 0),
  constraint pending_payment_recoveries_max_attempts_chk
    check (max_attempts > 0)
);
create unique index pending_payment_recoveries_provider_tracking_uidx
  on public.pending_payment_recoveries(provider, order_tracking_id);
create index pending_payment_recoveries_due_idx
  on public.pending_payment_recoveries(status, next_attempt_at, created_at)
  where status in ('pending', 'retrying', 'processing');
create index pending_payment_recoveries_booking_idx
  on public.pending_payment_recoveries(booking_id, created_at desc);
create trigger pending_payment_recoveries_set_updated_at
before update on public.pending_payment_recoveries
for each row execute function public.set_updated_at();

create or replace function public.enqueue_pending_payment_recovery(
  p_booking_id uuid,
  p_order_tracking_id text,
  p_provider text default 'pesapal',
  p_reason text default null
)
returns public.pending_payment_recoveries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := coalesce(nullif(btrim(coalesce(p_provider, '')), ''), 'pesapal');
  v_tracking text := nullif(btrim(coalesce(p_order_tracking_id, '')), '');
  v_recovery public.pending_payment_recoveries%rowtype;
begin
  if p_booking_id is null then
    raise exception 'booking_id is required';
  end if;
  if v_tracking is null then
    raise exception 'order_tracking_id is required';
  end if;

  insert into public.pending_payment_recoveries (
    booking_id, provider, order_tracking_id,
    status, next_attempt_at, last_error
  )
  values (
    p_booking_id, v_provider, v_tracking,
    'pending', now(),
    nullif(btrim(coalesce(p_reason, '')), '')
  )
  on conflict (provider, order_tracking_id)
  do update
  set
    booking_id = excluded.booking_id,
    status = case
      when pending_payment_recoveries.status = 'completed' then pending_payment_recoveries.status
      when pending_payment_recoveries.status = 'processing' then 'retrying'
      when pending_payment_recoveries.status = 'failed'
        and pending_payment_recoveries.attempt_count < pending_payment_recoveries.max_attempts then 'retrying'
      else pending_payment_recoveries.status
    end,
    next_attempt_at = case
      when pending_payment_recoveries.status = 'completed' then pending_payment_recoveries.next_attempt_at
      else least(pending_payment_recoveries.next_attempt_at, now())
    end,
    completed_at = case
      when pending_payment_recoveries.status = 'completed' then pending_payment_recoveries.completed_at
      else null
    end,
    last_error = case
      when pending_payment_recoveries.status = 'completed' then pending_payment_recoveries.last_error
      else coalesce(nullif(btrim(coalesce(p_reason, '')), ''), pending_payment_recoveries.last_error)
    end,
    updated_at = now()
  returning *
  into v_recovery;

  return v_recovery;
end;
$$;

revoke all on function public.enqueue_pending_payment_recovery(uuid, text, text, text) from public;

create or replace function public.claim_pending_payment_recoveries(
  p_limit int default 5,
  p_worker_id text default null,
  p_booking_id uuid default null
)
returns setof public.pending_payment_recoveries
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_limit int := greatest(1, least(coalesce(p_limit, 5), 25));
  normalized_worker text := coalesce(nullif(btrim(coalesce(p_worker_id, '')), ''), 'unknown');
begin
  return query
  with candidates as (
    select r.id
    from public.pending_payment_recoveries r
    where (
      (
        r.status in ('pending', 'retrying')
        and r.next_attempt_at <= now()
        and r.attempt_count < r.max_attempts
      )
      or (
        r.status = 'processing'
        and r.locked_at is not null
        and r.locked_at <= now() - interval '5 minutes'
        and r.attempt_count < r.max_attempts
      )
    )
    and (p_booking_id is null or r.booking_id = p_booking_id)
    order by r.next_attempt_at asc, r.created_at asc
    limit normalized_limit
    for update skip locked
  )
  update public.pending_payment_recoveries as r
  set
    status = 'processing',
    attempt_count = r.attempt_count + 1,
    locked_at = now(),
    locked_by = normalized_worker,
    last_error = null,
    updated_at = now()
  from candidates
  where r.id = candidates.id
  returning r.*;
end;
$$;

revoke all on function public.claim_pending_payment_recoveries(int, text, uuid) from public;

-- ---------------------------------------------------------------------
-- Contact submissions
-- ---------------------------------------------------------------------
create table public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'read', 'archived')),
  notes text,
  created_at timestamptz not null default now()
);
create index contact_submissions_status_idx
  on public.contact_submissions(status, created_at desc);

-- ---------------------------------------------------------------------
-- Operational incidents (audit log for payment/booking anomalies)
-- ---------------------------------------------------------------------
create table public.ops_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  source text,
  message text,
  booking_id uuid references public.bookings(id) on delete set null,
  payment_tracking_id text,
  dedupe_key text,
  context jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index ops_incidents_dedupe_uidx
  on public.ops_incidents(dedupe_key)
  where dedupe_key is not null;
create index ops_incidents_recent_idx
  on public.ops_incidents(created_at desc);

-- ---------------------------------------------------------------------
-- Business functions: availability + booking creation
-- ---------------------------------------------------------------------

-- Live units available for a date window. Counts:
--   - bookings in confirmed/checked_in/awaiting_confirmation
--   - bookings in pending_payment whose hold has NOT yet expired
-- Stale pending_payment rows (expires_at < now()) fade out automatically.
create or replace function public.room_type_units_available(
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date
)
returns int
language sql
stable
as $$
  select rt.inventory_count - coalesce((
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
  from public.room_types rt
  where rt.id = p_room_type_id;
$$;

revoke all on function public.room_type_units_available(uuid, date, date) from public;

-- create_booking: server-side function called from the storefront.
-- Holds inventory immediately via pending_payment + expires_at.
-- Serialises concurrent bookings for the same room type via FOR UPDATE.
create or replace function public.create_booking(
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
  quoted_total_ugx bigint,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_type public.room_types%rowtype;
  v_nights int;
  v_total bigint;
  v_available int;
  v_ref text;
  v_id uuid;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if p_check_in is null or p_check_out is null then
    raise exception 'Check-in and check-out are required';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out must be after check-in';
  end if;
  if p_check_in < current_date then
    raise exception 'Check-in cannot be in the past';
  end if;
  if p_guests_adults is null or p_guests_adults < 1 then
    raise exception 'At least one adult guest is required';
  end if;
  if p_guest_full_name is null or btrim(p_guest_full_name) = '' then
    raise exception 'Guest name is required';
  end if;
  if p_guest_email is null or btrim(p_guest_email) = '' then
    raise exception 'Guest email is required';
  end if;

  -- Lock the room_types row to serialise concurrent booking attempts
  -- against the same room type.
  select * into v_room_type
  from public.room_types
  where slug = p_room_type_slug
    and is_published = true
  for update;

  if not found then
    raise exception 'Room type not found or unavailable';
  end if;

  v_available := public.room_type_units_available(v_room_type.id, p_check_in, p_check_out);
  if v_available <= 0 then
    raise exception 'No availability for the selected dates';
  end if;

  v_nights := (p_check_out - p_check_in);
  v_total := v_room_type.price_ugx * v_nights;

  v_ref := 'MCR-' || to_char(now() at time zone 'Africa/Kampala', 'YYMMDD')
        || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.bookings (
    reference, room_type_id, check_in, check_out,
    guests_adults, guests_children,
    guest_full_name, guest_email, guest_phone, special_requests,
    status, quoted_total_ugx, expires_at
  ) values (
    v_ref, v_room_type.id, p_check_in, p_check_out,
    p_guests_adults, coalesce(p_guests_children, 0),
    btrim(p_guest_full_name), lower(btrim(p_guest_email)),
    nullif(btrim(coalesce(p_guest_phone, '')), ''),
    nullif(btrim(coalesce(p_special_requests, '')), ''),
    'pending_payment', v_total, v_expires_at
  )
  returning id into v_id;

  return query select v_id, v_ref, v_total, v_expires_at;
end;
$$;

revoke all on function public.create_booking(text, date, date, int, int, text, text, text, text) from public;

-- ---------------------------------------------------------------------
-- Trigger: prevent unsafe inventory reductions
-- ---------------------------------------------------------------------
create or replace function public.room_types_inventory_shrink_guard()
returns trigger
language plpgsql
as $$
declare
  v_max_concurrent int;
begin
  if new.inventory_count >= old.inventory_count then
    return new;
  end if;

  -- Count the worst-case overlap of live bookings for any future date window.
  -- Approximation: max count of overlapping live bookings on any date >= today.
  select coalesce(max(overlap_count), 0)
  into v_max_concurrent
  from (
    select count(*) as overlap_count
    from public.bookings b,
         generate_series(
           greatest(b.check_in, current_date),
           b.check_out - interval '1 day',
           interval '1 day'
         ) as d(day)
    where b.room_type_id = new.id
      and b.check_out > current_date
      and (
        b.status in ('awaiting_confirmation', 'confirmed', 'checked_in')
        or (b.status = 'pending_payment' and b.expires_at > now())
      )
    group by d.day
  ) overlap_counts;

  if new.inventory_count < v_max_concurrent then
    raise exception
      'Cannot reduce inventory_count to % — there are already % overlapping live bookings on at least one date',
      new.inventory_count, v_max_concurrent;
  end if;

  return new;
end;
$$;

create trigger room_types_inventory_shrink_guard
before update on public.room_types
for each row
when (new.inventory_count is distinct from old.inventory_count)
execute function public.room_types_inventory_shrink_guard();

-- Neon does not expose the database directly to browsers. Public reads,
-- booking creation, payment handling, and admin CRUD all flow through
-- server-only Next.js code using DATABASE_URL, so Postgres RLS and
-- Supabase API roles are intentionally not part of this schema.

commit;
