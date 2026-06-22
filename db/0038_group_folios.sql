-- Group folios: master payment records allocated into member booking folios.
begin;

create table if not exists public.group_folio_payments (
  id           uuid        primary key default gen_random_uuid(),
  group_id     uuid        not null references public.reservation_groups(id) on delete restrict,
  amount_ugx   bigint      not null check (amount_ugx > 0),
  method       text        not null
                           check (method in ('pesapal_manual','cash','mpesa','card','transfer')),
  reference    text,
  note         text,
  recorded_by  uuid        references public.admin_users(id),
  recorded_at  timestamptz not null default now()
);

create index if not exists group_folio_payments_group_idx
  on public.group_folio_payments(group_id, recorded_at desc);

alter table public.folio_payments
  add column if not exists group_payment_id uuid references public.group_folio_payments(id) on delete restrict;

create index if not exists folio_payments_group_payment_idx
  on public.folio_payments(group_payment_id)
  where group_payment_id is not null;

create table if not exists public.group_folio_payment_allocations (
  id               uuid        primary key default gen_random_uuid(),
  group_payment_id uuid        not null references public.group_folio_payments(id) on delete restrict,
  booking_id       uuid        not null references public.bookings(id) on delete restrict,
  folio_payment_id uuid        not null unique references public.folio_payments(id) on delete restrict,
  amount_ugx       bigint      not null check (amount_ugx > 0),
  created_at       timestamptz not null default now()
);

create index if not exists group_folio_allocations_group_payment_idx
  on public.group_folio_payment_allocations(group_payment_id);

create index if not exists group_folio_allocations_booking_idx
  on public.group_folio_payment_allocations(booking_id);

comment on table public.group_folio_payments is
  'Master group folio payments. Each row is allocated into ordinary booking folio_payments so booking balances and receipt triggers remain authoritative.';

comment on table public.group_folio_payment_allocations is
  'Allocation ledger from one group-level payment to one or more member booking folio payments.';

commit;
