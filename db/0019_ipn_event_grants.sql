-- =====================================================================
-- Mubende Country Resort - IPN event least-privilege grant repair
-- =====================================================================
-- Repairs production databases that applied 0018 before the dedupe_key SELECT
-- grant was added. The IPN route inserts with ON CONFLICT DO NOTHING, then
-- selects the existing event by dedupe_key on duplicate provider callbacks.
-- Without SELECT on dedupe_key, repeated IPNs fail with:
--   permission denied for table pesapal_ipn_events
-- =====================================================================

begin;

grant select (id, dedupe_key) on public.pesapal_ipn_events to mcr_storefront_app;
grant insert (
  order_tracking_id,
  notification_type,
  dedupe_key,
  raw_payload
) on public.pesapal_ipn_events to mcr_storefront_app;
grant update (processed_at) on public.pesapal_ipn_events to mcr_storefront_app;

commit;
