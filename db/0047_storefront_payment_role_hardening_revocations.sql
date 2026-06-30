-- Apply only after the payment reconciler and updated storefront are deployed.
-- This removes the legacy path that allowed the storefront credential to
-- rewrite the database values trusted by payment confirmation.

begin;

revoke all on public.bookings from mcr_storefront_app;
revoke all on public.payment_attempts from mcr_storefront_app;
revoke all on public.pending_payment_recoveries from mcr_storefront_app;

revoke execute on function public.create_online_booking(
  text, date, date, int, int, text, text, text, text
) from mcr_storefront_app;
revoke execute on function public.confirm_booking_payment(
  uuid, text, text, bigint
) from mcr_storefront_app;
revoke execute on function public.enqueue_pending_payment_recovery(
  uuid, text, text, text
) from mcr_storefront_app;
revoke execute on function public.claim_pending_payment_recoveries(
  int, text, uuid
) from mcr_storefront_app;
revoke execute on function public.record_payment_recovery_dlq_incident(
  uuid, text, text, int, jsonb
) from mcr_storefront_app;

grant execute on function public.create_online_booking_with_payment_capability(
  text, date, date, int, int, text, text, text, text
) to mcr_storefront_app;
grant execute on function public.start_storefront_payment_attempt(uuid, uuid)
  to mcr_storefront_app;
grant execute on function public.record_storefront_payment_initiation_success(
  uuid, uuid, uuid, text, text
) to mcr_storefront_app;
grant execute on function public.record_storefront_payment_initiation_failure(
  uuid, uuid, uuid, text, text
) to mcr_storefront_app;
grant execute on function public.get_storefront_payment_queue_binding(text, text)
  to mcr_storefront_app;

revoke all on public.bookings from mcr_payment_reconciler;
revoke all on public.payment_attempts from mcr_payment_reconciler;
revoke all on public.pending_payment_recoveries from mcr_payment_reconciler;
revoke execute on function public.confirm_booking_payment(
  uuid, text, text, bigint
) from mcr_payment_reconciler;
revoke execute on function public.enqueue_pending_payment_recovery(
  uuid, text, text, text
) from mcr_payment_reconciler;
revoke execute on function public.claim_pending_payment_recoveries(
  int, text, uuid
) from mcr_payment_reconciler;

grant execute on function public.claim_payment_recovery_message(uuid, text, text)
  to mcr_payment_reconciler;
grant execute on function public.apply_payment_recovery_outcome(
  uuid, text, text, text, text, bigint, text, text, jsonb
) to mcr_payment_reconciler;
grant execute on function public.reschedule_claimed_payment_recovery(uuid, text)
  to mcr_payment_reconciler;
grant execute on function public.record_payment_recovery_dlq_incident(
  uuid, text, text, int, jsonb
) to mcr_payment_reconciler;

commit;
