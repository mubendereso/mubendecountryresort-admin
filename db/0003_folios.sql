-- =====================================================================
-- Mubende Country Resort — guest folio tables
-- =====================================================================
-- folio_charges: line items posted against a booking (accommodation,
--   food, beverage, other, tax, discounts). Soft-voided, never deleted.
-- folio_payments: cash/mobile-money receipts recorded against a booking.
--   The balance due = sum(active charges) - sum(payments).
-- =====================================================================

begin;

create table public.folio_charges (
  id           uuid        primary key default gen_random_uuid(),
  booking_id   uuid        not null references bookings(id),
  description  text        not null,
  amount_ugx   bigint      not null check (amount_ugx > 0),
  category     text        not null
                           check (category in ('accommodation','food','beverage','other','tax','discount')),
  posted_by    uuid        references admin_users(id),
  posted_at    timestamptz not null default now(),
  voided_at    timestamptz,
  voided_by    uuid        references admin_users(id)
);

create index folio_charges_booking_idx on public.folio_charges(booking_id);

create table public.folio_payments (
  id           uuid        primary key default gen_random_uuid(),
  booking_id   uuid        not null references bookings(id),
  amount_ugx   bigint      not null check (amount_ugx > 0),
  method       text        not null
                           check (method in ('pesapal','cash','mpesa','card','transfer')),
  reference    text,
  recorded_by  uuid        references admin_users(id),
  recorded_at  timestamptz not null default now()
);

create index folio_payments_booking_idx on public.folio_payments(booking_id);

commit;
