-- =====================================================================
-- Mubende Country Resort - room type lifecycle
-- =====================================================================
-- Adds a distinct archived state for room products. Archived room types are
-- always unpublished but remain available to staff for restoration and
-- historical booking references.
-- =====================================================================

begin;

alter table public.room_types
  add column if not exists archived_at timestamptz;

create index if not exists room_types_archived_idx
  on public.room_types(archived_at, sort_order);

commit;
