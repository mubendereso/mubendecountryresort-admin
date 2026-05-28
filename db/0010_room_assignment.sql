-- =====================================================================
-- Mubende Country Resort — room assignment
-- =====================================================================
-- Links a booking to a specific physical room unit. Until now bookings
-- referenced only room_type; nothing told staff which numbered room a
-- guest occupies. Assignment is nullable (assigned at/around check-in)
-- and clears to NULL if the unit is ever deleted.
-- =====================================================================

begin;

alter table public.bookings
  add column if not exists room_unit_id uuid
    references public.room_units(id) on delete set null;

create index if not exists bookings_room_unit_idx
  on public.bookings(room_unit_id)
  where room_unit_id is not null;

commit;
