-- =====================================================================
-- Mubende Country Resort - least-privilege storefront DB role
-- =====================================================================
-- Fixes MCR-NEW-01 from the 2026-06-02 independent paranoid audit.
--
-- The public storefront must not connect as the Neon owner/admin role. This
-- role is intentionally limited to public content reads, booking/payment
-- initiation bookkeeping, payment recovery, contact inserts, and the strict
-- payment binding checks. It receives no access to admin_users,
-- admin_sessions, folios, audit_log, sync tables, or admin push tables.
--
-- Operational follow-up after applying this migration:
--   alter role mcr_storefront_app with password '<generated strong password>';
--   wrangler secret put DATABASE_URL   -- in the storefront repo, using this role
-- =====================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'mcr_storefront_app') then
    create role mcr_storefront_app login;
  end if;
end;
$$;

grant usage on schema public to mcr_storefront_app;

-- Enum values are used by direct payment_attempts/bookings updates.
grant usage on type
  public.booking_status,
  public.payment_attempt_status,
  public.payment_attempt_failure_phase,
  public.verified_payment_status
to mcr_storefront_app;

-- Start from a clean slate for this role. Existing owner/admin roles are not
-- affected; this only removes accidental grants from the storefront role.
revoke all privileges on all tables in schema public from mcr_storefront_app;
revoke all privileges on all sequences in schema public from mcr_storefront_app;
revoke all privileges on all functions in schema public from mcr_storefront_app;

-- Public content reads. Column-level grants reduce blast radius if the
-- storefront Worker is compromised.
grant select (
  id, slug, title, description, overview, price_ugx, cover_image_url,
  details, amenities, dining_hours, gallery, is_published, sort_order
) on public.room_types to mcr_storefront_app;

grant select (
  id, slug, icon, title, description, overview, highlights, gallery,
  is_published, sort_order
) on public.amenities to mcr_storefront_app;

grant select (
  id, slug, title, body, image, overview, details, gallery,
  is_published, sort_order
) on public.experiences to mcr_storefront_app;

grant select (
  id, slug, title, image, summary, overview, details, gallery,
  is_published, sort_order
) on public.services to mcr_storefront_app;

grant select (
  id, image_url, caption, sort_order, is_published
) on public.gallery_images to mcr_storefront_app;

-- Booking reads used by the confirmation page, recovery loop, and payment
-- binding checks. Do not grant notes/payment failure text beyond what the
-- storefront explicitly needs for its own payment lifecycle.
grant select (
  id, reference, room_type_id, check_in, check_out, guests_adults,
  guests_children, guest_full_name, status, quoted_total_ugx,
  order_tracking_id, active_payment_attempt_id, payment_expired_at, created_at
) on public.bookings to mcr_storefront_app;

grant update (
  status,
  payment_provider,
  payment_redirect_url,
  order_tracking_id,
  active_payment_attempt_id,
  payment_initiation_attempted_at,
  payment_initiation_failure_code,
  payment_initiation_failure_message,
  payment_initiation_failed_at,
  payment_last_verified_at,
  payment_expired_at
) on public.bookings to mcr_storefront_app;

-- Payment attempt journal: the storefront creates and updates its own Pesapal
-- attempt rows, and the binding helper reads the active attempt fields.
grant select (
  id, booking_id, provider_reference, merchant_reference, amount_ugx
) on public.payment_attempts to mcr_storefront_app;

grant insert (
  booking_id,
  merchant_reference,
  amount_ugx,
  provider_request_started_at
) on public.payment_attempts to mcr_storefront_app;

grant update (
  status,
  provider_reference,
  redirect_url,
  response_received_at,
  failure_message,
  failure_phase,
  verified_payment_status,
  last_verification_response,
  verified_at
) on public.payment_attempts to mcr_storefront_app;

-- IPN audit log: the storefront can insert raw Pesapal events and mark the
-- event row processed. It cannot read arbitrary historical IPN rows.
grant select (id) on public.pesapal_ipn_events to mcr_storefront_app;
grant insert (
  order_tracking_id,
  notification_type,
  raw_payload
) on public.pesapal_ipn_events to mcr_storefront_app;
grant update (processed_at) on public.pesapal_ipn_events to mcr_storefront_app;

-- Durable payment recovery queue. The enqueue/claim functions do the privileged
-- insert/claim work; direct updates only complete or reschedule claimed rows.
grant select (
  id, booking_id, order_tracking_id, attempt_count
) on public.pending_payment_recoveries to mcr_storefront_app;
grant update (
  status,
  next_attempt_at,
  locked_at,
  last_verified_at,
  last_error,
  completed_at
) on public.pending_payment_recoveries to mcr_storefront_app;

-- Public contact form inserts only.
grant insert (
  full_name,
  email,
  phone,
  subject,
  message
) on public.contact_submissions to mcr_storefront_app;

-- RPCs used by the storefront. Most are SECURITY DEFINER, so table privileges
-- are not enough; EXECUTE must be explicit after prior revokes.
grant execute on function public.create_online_booking(
  text, date, date, int, int, text, text, text, text
) to mcr_storefront_app;

grant execute on function public.confirm_booking_payment(
  uuid, text, text, bigint
) to mcr_storefront_app;

grant execute on function public.enqueue_pending_payment_recovery(
  uuid, text, text, text
) to mcr_storefront_app;

grant execute on function public.claim_pending_payment_recoveries(
  int, text, uuid
) to mcr_storefront_app;

grant execute on function public.consume_rate_limit(
  text, integer, integer
) to mcr_storefront_app;

grant execute on function public.room_type_units_available(
  uuid, date, date
) to mcr_storefront_app;

commit;
