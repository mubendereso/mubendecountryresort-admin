-- Company accounts and optional company payer on reservation groups.
begin;

create table if not exists public.company_accounts (
  id                 uuid        primary key default gen_random_uuid(),
  company_name       text        not null,
  contact_name       text,
  contact_email      text,
  contact_phone      text,
  billing_address    text,
  tax_id             text,
  payment_terms_days integer     not null default 14 check (payment_terms_days >= 0),
  credit_limit_ugx   bigint      not null default 0 check (credit_limit_ugx >= 0),
  notes              text,
  is_active          boolean     not null default true,
  created_by         uuid        references public.admin_users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists company_accounts_name_idx
  on public.company_accounts(lower(company_name));

create index if not exists company_accounts_active_idx
  on public.company_accounts(is_active, company_name);

drop trigger if exists company_accounts_set_updated_at on public.company_accounts;
create trigger company_accounts_set_updated_at
before update on public.company_accounts
for each row
execute function public.set_updated_at();

alter table public.reservation_groups
  add column if not exists company_account_id uuid references public.company_accounts(id) on delete set null;

create index if not exists reservation_groups_company_account_idx
  on public.reservation_groups(company_account_id)
  where company_account_id is not null;

comment on table public.company_accounts is
  'Corporate/company billing accounts that can be attached to reservation groups as the statement payer.';

comment on column public.reservation_groups.company_account_id is
  'Optional company payer for group statements and accounts receivable tracking.';

commit;
