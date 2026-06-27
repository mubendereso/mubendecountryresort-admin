-- Corporate Billing V2: standalone booking payers, credit controls, negotiated rates,
-- and booking-invoice company payment allocations.
begin;

alter table public.bookings
  add column if not exists company_account_id uuid references public.company_accounts(id) on delete set null;

create index if not exists bookings_company_account_idx
  on public.bookings(company_account_id)
  where company_account_id is not null;

alter table public.company_accounts
  add column if not exists is_suspended boolean not null default false,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references public.admin_users(id),
  add column if not exists suspension_reason text;

alter table public.company_accounts
  drop constraint if exists company_accounts_suspension_check;

alter table public.company_accounts
  add constraint company_accounts_suspension_check check (
    (is_suspended = false and suspended_at is null and suspended_by is null and suspension_reason is null)
    or
    (is_suspended = true and suspended_at is not null and suspension_reason is not null)
  );

create table if not exists public.company_room_rates (
  id                 uuid        primary key default gen_random_uuid(),
  company_account_id uuid        not null references public.company_accounts(id) on delete cascade,
  room_type_id       uuid        not null references public.room_types(id) on delete restrict,
  rate_ugx           bigint      not null check (rate_ugx > 0),
  valid_from         date        not null,
  valid_to           date,
  status             text        not null default 'active' check (status in ('active', 'archived')),
  notes              text,
  created_by         uuid        references public.admin_users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint company_room_rates_date_check check (valid_to is null or valid_to >= valid_from)
);

create index if not exists company_room_rates_lookup_idx
  on public.company_room_rates(company_account_id, room_type_id, status, valid_from desc, valid_to);

drop trigger if exists company_room_rates_set_updated_at on public.company_room_rates;
create trigger company_room_rates_set_updated_at
before update on public.company_room_rates
for each row
execute function public.set_updated_at();

alter table public.company_account_payment_allocations
  alter column group_id drop not null,
  alter column group_payment_id drop not null,
  add column if not exists booking_id uuid references public.bookings(id) on delete restrict,
  add column if not exists folio_payment_id uuid references public.folio_payments(id) on delete restrict;

alter table public.company_account_payment_allocations
  drop constraint if exists company_payment_allocations_target_check;

alter table public.company_account_payment_allocations
  add constraint company_payment_allocations_target_check check (
    (group_id is not null and group_payment_id is not null and booking_id is null and folio_payment_id is null)
    or
    (group_id is null and group_payment_id is null and booking_id is not null and folio_payment_id is not null)
  );

create index if not exists company_payment_allocations_booking_idx
  on public.company_account_payment_allocations(booking_id)
  where booking_id is not null;

alter table public.folio_payments
  add column if not exists company_payment_id uuid references public.company_account_payments(id) on delete restrict,
  add column if not exists company_invoice_id uuid references public.invoices(id) on delete restrict;

create index if not exists folio_payments_company_payment_idx
  on public.folio_payments(company_payment_id)
  where company_payment_id is not null;

comment on column public.bookings.company_account_id is
  'Optional direct company payer. Group-member bookings inherit billing from reservation_groups instead.';

comment on table public.company_room_rates is
  'Date-bounded company-specific room rates that feed the existing agreed-room-price discount model.';

comment on column public.company_accounts.is_suspended is
  'Credit-control suspension. Suspended accounts cannot receive new company-billed business without reactivation.';

commit;
