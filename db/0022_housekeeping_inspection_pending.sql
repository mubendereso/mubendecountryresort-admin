-- =====================================================================
-- Mubende Country Resort - explicit housekeeping inspection queue
-- =====================================================================
-- Adds a real inspection_pending state. Existing clean rooms remain clean;
-- no historical status is relabelled or inferred.
-- =====================================================================

begin;

alter table public.room_units
  drop constraint if exists room_units_housekeeping_status_check;

alter table public.room_units
  add constraint room_units_housekeeping_status_check
  check (
    housekeeping_status in (
      'dirty',
      'cleaning',
      'inspection_pending',
      'clean',
      'inspected',
      'out_of_order'
    )
  );

commit;
