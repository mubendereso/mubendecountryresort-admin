-- =====================================================================
-- Mubende Country Resort - public confirmation lookup hardening
-- =====================================================================
-- Fixes the confirmation-page detail leak by making `?ref=` alone insufficient
-- to reveal guest/stay/amount details. The storefront can execute this RPC,
-- but it does not receive direct SELECT access to guest_email or guest_phone.
--
-- Public behavior:
--   - existing reference returns non-sensitive status so the payment landing
--     page remains useful;
--   - sensitive details are returned only when the supplied proof matches the
--     booking email exactly or the last 4 digits of the guest phone.
-- =====================================================================

begin;

create or replace function public.get_public_booking_confirmation(
  p_reference text,
  p_proof text default null
)
returns table (
  reference text,
  status text,
  proof_verified boolean,
  room_title text,
  check_in date,
  check_out date,
  guest_full_name text,
  guests_adults int,
  guests_children int,
  quoted_total_ugx bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reference text := nullif(upper(btrim(coalesce(p_reference, ''))), '');
  v_proof text := lower(btrim(coalesce(p_proof, '')));
  v_proof_digits text := regexp_replace(coalesce(p_proof, ''), '\D', '', 'g');
begin
  if v_reference is null then
    return;
  end if;

  return query
  select
    b.reference,
    b.status::text,
    matched.proof_verified,
    case when matched.proof_verified then rt.title else null end,
    case when matched.proof_verified then b.check_in else null end,
    case when matched.proof_verified then b.check_out else null end,
    case when matched.proof_verified then b.guest_full_name else null end,
    case when matched.proof_verified then b.guests_adults else null end,
    case when matched.proof_verified then b.guests_children else null end,
    case when matched.proof_verified then b.quoted_total_ugx else null end
  from public.bookings b
  join public.room_types rt on rt.id = b.room_type_id
  cross join lateral (
    select (
      v_proof <> ''
      and (
        lower(coalesce(b.guest_email, '')) = v_proof
        or (
          length(v_proof_digits) >= 4
          and right(regexp_replace(coalesce(b.guest_phone, ''), '\D', '', 'g'), 4) = right(v_proof_digits, 4)
        )
      )
    ) as proof_verified
  ) matched
  where b.reference = v_reference
  limit 1;
end;
$$;

revoke all on function public.get_public_booking_confirmation(text, text) from public;
grant execute on function public.get_public_booking_confirmation(text, text) to mcr_storefront_app;

commit;
