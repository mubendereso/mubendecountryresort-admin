-- Immutable night audit close records for the resort's business day.
-- Staff can review the audit screen; admin/superadmin can close a day.
-- A closed day can be voided by superadmin if it was signed off in error.
begin;

create table if not exists public.night_audit_closures (
  id                         uuid primary key default gen_random_uuid(),
  business_date              date not null,
  closed_by                  uuid not null references public.admin_users(id) on delete restrict,
  closed_at                  timestamptz not null default now(),
  opening_float_ugx          bigint not null default 0 check (opening_float_ugx >= 0),
  cash_counted_ugx           bigint not null default 0 check (cash_counted_ugx >= 0),
  cash_difference_ugx        bigint not null,
  total_units                integer not null,
  occupied_room_nights       integer not null,
  occupancy_percent          integer not null,
  arrivals                   integer not null,
  departures                 integer not null,
  total_charged_ugx          bigint not null,
  total_collected_ugx        bigint not null,
  cash_total_ugx             bigint not null,
  mpesa_total_ugx            bigint not null,
  card_total_ugx             bigint not null,
  transfer_total_ugx         bigint not null,
  pesapal_total_ugx          bigint not null,
  pesapal_manual_total_ugx   bigint not null,
  receipt_count              integer not null,
  missing_receipt_count      integer not null,
  voided_charges_count       integer not null,
  voided_charges_amount_ugx  bigint not null,
  open_balance_count         integer not null,
  open_balance_amount_ugx    bigint not null,
  pending_payment_count      integer not null,
  pending_payment_amount_ugx bigint not null,
  notes                      text,
  voided_at                  timestamptz,
  voided_by                  uuid references public.admin_users(id) on delete set null,
  void_reason                text
);

create unique index if not exists night_audit_closures_business_date_active_uidx
  on public.night_audit_closures(business_date)
  where voided_at is null;

create index if not exists night_audit_closures_closed_at_idx
  on public.night_audit_closures(closed_at desc);

create index if not exists night_audit_closures_voided_at_idx
  on public.night_audit_closures(voided_at desc nulls last);

comment on table public.night_audit_closures is
  'Signed night-audit close records for a resort business date. '
  'One active close per business_date; superadmin may void a close to reopen it.';

commit;
