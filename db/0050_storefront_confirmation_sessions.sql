-- =====================================================================
-- Mubende Country Resort - session-bound storefront confirmation access
-- =====================================================================
-- A booking confirmation is shown only to the browser that started that
-- booking.  The opaque token is stored in an HttpOnly cookie and is never
-- placed in a URL.  This replaces the email/phone knowledge check used by
-- the public confirmation page.

begin;

create table if not exists public.storefront_confirmation_sessions (
  booking_id uuid primary key
    references public.bookings(id) on update cascade on delete cascade,
  session_token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

revoke all on public.storefront_confirmation_sessions from public;
revoke all on public.storefront_confirmation_sessions from mcr_storefront_app;
revoke all on public.storefront_confirmation_sessions from mcr_payment_reconciler;

create or replace function public.create_online_booking_with_confirmation_session(
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
  payment_capability uuid,
  confirmation_session_token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_id uuid;
  v_reference text;
  v_total bigint;
  v_payment_capability uuid;
  v_confirmation_session_token uuid := gen_random_uuid();
begin
  select created.booking_id, created.reference, created.quoted_total_ugx, created.payment_capability
  into v_booking_id, v_reference, v_total, v_payment_capability
  from public.create_online_booking_with_payment_capability(
    p_room_type_slug,
    p_check_in,
    p_check_out,
    p_guests_adults,
    p_guests_children,
    p_guest_full_name,
    p_guest_email,
    p_guest_phone,
    p_special_requests
  ) as created;

  if v_booking_id is null or v_payment_capability is null then
    raise exception 'Booking creation returned no payment capability';
  end if;

  insert into public.storefront_confirmation_sessions (booking_id, session_token)
  values (v_booking_id, v_confirmation_session_token);

  return query select
    v_booking_id,
    v_reference,
    v_total,
    v_payment_capability,
    v_confirmation_session_token;
end;
$$;

revoke all on function public.create_online_booking_with_confirmation_session(
  text, date, date, int, int, text, text, text, text
) from public;
grant execute on function public.create_online_booking_with_confirmation_session(
  text, date, date, int, int, text, text, text, text
) to mcr_storefront_app;

create or replace function public.get_storefront_booking_confirmation_by_session(
  p_reference text,
  p_session_token uuid
)
returns table (
  reference text,
  status text,
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
begin
  if v_reference is null or p_session_token is null then
    return;
  end if;

  return query
  select
    b.reference,
    b.status::text,
    rt.title,
    b.check_in,
    b.check_out,
    b.guest_full_name,
    b.guests_adults,
    b.guests_children,
    b.quoted_total_ugx
  from public.storefront_confirmation_sessions s
  join public.bookings b on b.id = s.booking_id
  join public.room_types rt on rt.id = b.room_type_id
  where b.reference = v_reference
    and s.session_token = p_session_token
    and s.expires_at > now()
  limit 1;
end;
$$;

revoke all on function public.get_storefront_booking_confirmation_by_session(text, uuid) from public;
grant execute on function public.get_storefront_booking_confirmation_by_session(text, uuid)
  to mcr_storefront_app;

commit;
