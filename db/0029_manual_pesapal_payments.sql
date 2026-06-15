-- Allow staff-verified Pesapal balance payments without weakening the
-- one-provider-receipt-per-booking idempotency rule.
begin;

alter table public.folio_payments
  drop constraint if exists folio_payments_method_check;

alter table public.folio_payments
  add constraint folio_payments_method_check
  check (
    method in (
      'pesapal',
      'pesapal_manual',
      'cash',
      'mpesa',
      'card',
      'transfer'
    )
  );

commit;
