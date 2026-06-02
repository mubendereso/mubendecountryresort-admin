-- =====================================================================
-- Mubende Country Resort - sync trigger privilege hardening
-- =====================================================================
-- Fixes a least-privilege storefront role regression introduced by the
-- storefront DB role split.
--
-- Public storefront writes to bookings are intentionally narrow, but bookings
-- also has the offline-sync AFTER trigger. The trigger inserts into
-- sync_changes, which the storefront role must not be allowed to write
-- directly. Run the trigger function as its owner instead, with a pinned
-- search_path, so legitimate storefront booking updates can still be mirrored
-- for admin sync without granting direct sync table access.
-- =====================================================================

begin;

create or replace function public.record_sync_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

alter function public.record_sync_change() security definer;
alter function public.record_sync_change() set search_path = public, pg_temp;
revoke all on function public.record_sync_change() from public;

commit;
