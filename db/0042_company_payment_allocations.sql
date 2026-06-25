-- Company-level AR payments allocated into issued group invoices and group folios.
begin;

create table if not exists public.company_account_payments (
  id                 uuid        primary key default gen_random_uuid(),
  company_account_id uuid        not null references public.company_accounts(id) on delete restrict,
  amount_ugx         bigint      not null check (amount_ugx > 0),
  method             text        not null check (method in ('pesapal_manual', 'cash', 'mpesa', 'card', 'transfer')),
  reference          text,
  note               text,
  recorded_by        uuid        references public.admin_users(id),
  recorded_at        timestamptz not null default now()
);

create index if not exists company_account_payments_company_idx
  on public.company_account_payments(company_account_id, recorded_at desc);

alter table public.group_folio_payments
  add column if not exists company_payment_id uuid references public.company_account_payments(id) on delete restrict,
  add column if not exists company_invoice_id uuid references public.invoices(id) on delete restrict;

create index if not exists group_folio_payments_company_payment_idx
  on public.group_folio_payments(company_payment_id)
  where company_payment_id is not null;

create index if not exists group_folio_payments_company_invoice_idx
  on public.group_folio_payments(company_invoice_id)
  where company_invoice_id is not null;

create table if not exists public.company_account_payment_allocations (
  id                 uuid        primary key default gen_random_uuid(),
  company_payment_id uuid        not null references public.company_account_payments(id) on delete restrict,
  invoice_id         uuid        not null references public.invoices(id) on delete restrict,
  group_id           uuid        not null references public.reservation_groups(id) on delete restrict,
  group_payment_id   uuid        not null references public.group_folio_payments(id) on delete restrict,
  amount_ugx         bigint      not null check (amount_ugx > 0),
  created_at         timestamptz not null default now(),
  unique(company_payment_id, invoice_id)
);

create index if not exists company_payment_allocations_company_payment_idx
  on public.company_account_payment_allocations(company_payment_id);

create index if not exists company_payment_allocations_invoice_idx
  on public.company_account_payment_allocations(invoice_id);

create index if not exists company_payment_allocations_group_idx
  on public.company_account_payment_allocations(group_id);

comment on table public.company_account_payments is
  'Company-level AR receipts. Allocations create group folio payments so booking folios and receipt triggers remain authoritative.';

comment on table public.company_account_payment_allocations is
  'Allocation ledger from one company AR receipt into issued group invoices and their group folio payments.';

comment on column public.group_folio_payments.company_payment_id is
  'Company AR receipt that created this group folio payment, when payment was recorded at company level.';

comment on column public.group_folio_payments.company_invoice_id is
  'Issued company/group invoice that this group folio payment was allocated to.';

commit;
