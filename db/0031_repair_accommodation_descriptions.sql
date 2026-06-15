-- Normalize accommodation descriptions damaged by mojibake separators.
begin;

update public.folio_charges fc
set description =
  rt.title || ' - ' ||
  (b.check_out - b.check_in)::text ||
  ' night' ||
  case when (b.check_out - b.check_in) = 1 then '' else 's' end
from public.bookings b
join public.room_types rt on rt.id = b.room_type_id
where fc.booking_id = b.id
  and fc.category = 'accommodation'
  and fc.voided_at is null
  and fc.description is distinct from (
    rt.title || ' - ' ||
    (b.check_out - b.check_in)::text ||
    ' night' ||
    case when (b.check_out - b.check_in) = 1 then '' else 's' end
  );

commit;
