-- =====================================================================
-- Mubende Country Resort — sync + audit infrastructure (phase 2)
-- =====================================================================
-- Adds the server-side machinery the offline-first admin PWA needs:
--
--   1. sync_changes          — monotonic change feed the client PULLS from.
--                              Trigger-populated on every mutation of a
--                              synced table. One global cursor (the `seq`).
--   2. sync_applied_mutations — idempotency ledger for the PUSH endpoint so
--                              a flaky reconnect can't double-apply a queued
--                              mutation.
--   3. audit_log             — human-readable "who did what" history,
--                              written explicitly by application code (not
--                              triggers) because it captures intent, not
--                              just row diffs.
--
-- sync_changes deliberately does NOT record the actor — that's the audit
-- log's job. The change feed only needs to answer "what rows changed since
-- cursor X" so other devices can converge.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Change feed (server -> client pull)
-- ---------------------------------------------------------------------
create table public.sync_changes (
  seq         bigint generated always as identity primary key,
  table_name  text not null,
  row_id      uuid not null,
  op          text not null check (op in ('insert', 'update', 'delete')),
  row_data    jsonb,            -- full new row as jsonb; null for deletes
  changed_at  timestamptz not null default now()
);

-- Pull queries are always "seq > cursor order by seq" — the PK index covers
-- it. A secondary index on (table_name, seq) helps if we ever pull a single
-- table's tail.
create index sync_changes_table_seq_idx
  on public.sync_changes(table_name, seq);

comment on table public.sync_changes is
  'Monotonic change feed for offline client sync. Trigger-populated. '
  'Clients pull rows where seq > their stored cursor.';

-- Generic trigger: write a change row for every insert/update/delete on a
-- synced table. Assumes the table has a uuid `id` primary key.
create or replace function public.record_sync_change()
returns trigger
language plpgsql as $$
begin
  if (tg_op = 'DELETE') then
    insert into public.sync_changes(table_name, row_id, op, row_data)
    values (tg_table_name, old.id, 'delete', null);
    return old;
  else
    insert into public.sync_changes(table_name, row_id, op, row_data)
    values (tg_table_name, new.id, lower(tg_op), to_jsonb(new));
    return new;
  end if;
end;
$$;

-- Attach to the tables the admin actually mirrors offline. Server-only
-- tables (admin_users, admin_sessions, payment_attempts, pesapal_ipn_events,
-- pending_payment_recoveries) are intentionally NOT tracked — staff devices
-- never hold that data.
create trigger room_types_sync
  after insert or update or delete on public.room_types
  for each row execute function public.record_sync_change();

create trigger amenities_sync
  after insert or update or delete on public.amenities
  for each row execute function public.record_sync_change();

create trigger experiences_sync
  after insert or update or delete on public.experiences
  for each row execute function public.record_sync_change();

create trigger services_sync
  after insert or update or delete on public.services
  for each row execute function public.record_sync_change();

create trigger gallery_images_sync
  after insert or update or delete on public.gallery_images
  for each row execute function public.record_sync_change();

create trigger bookings_sync
  after insert or update or delete on public.bookings
  for each row execute function public.record_sync_change();

create trigger contact_submissions_sync
  after insert or update or delete on public.contact_submissions
  for each row execute function public.record_sync_change();

-- ---------------------------------------------------------------------
-- 2. Idempotency ledger (client -> server push)
-- ---------------------------------------------------------------------
create table public.sync_applied_mutations (
  idempotency_key uuid primary key,
  mutation_type   text not null,
  applied_at      timestamptz not null default now(),
  result          jsonb           -- cached response, replayed on duplicate
);

create index sync_applied_mutations_applied_idx
  on public.sync_applied_mutations(applied_at desc);

comment on table public.sync_applied_mutations is
  'Idempotency ledger for the sync push endpoint. A queued mutation carries '
  'a client-generated UUID; if it is already here, the cached result is '
  'replayed instead of re-applying.';

-- ---------------------------------------------------------------------
-- 3. Audit log (human-readable history)
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.admin_users(id) on delete set null,
  actor_email text,            -- denormalized: survives actor deletion
  action      text not null,   -- e.g. 'contact.mark_read', 'booking.check_in'
  entity_type text,            -- e.g. 'contact_submission', 'booking'
  entity_id   uuid,
  summary     text,            -- human sentence for the activity feed
  context     jsonb,           -- optional before/after or extra detail
  created_at  timestamptz not null default now()
);

create index audit_log_recent_idx
  on public.audit_log(created_at desc);
create index audit_log_entity_idx
  on public.audit_log(entity_type, entity_id, created_at desc);
create index audit_log_actor_idx
  on public.audit_log(actor_id, created_at desc);

comment on table public.audit_log is
  'Human-readable activity history. Written explicitly by server code with '
  'the acting admin attached. Distinct from sync_changes (machine change '
  'feed, no actor).';

commit;
