-- Numbered invoice snapshots for booking and group folios.
begin;

create sequence if not exists public.invoice_number_seq;

create table if not exists public.invoices (
  id                    uuid        primary key default gen_random_uuid(),
  invoice_number        text        unique,
  invoice_type          text        not null check (invoice_type in ('booking', 'group')),
  status                text        not null default 'draft' check (status in ('draft', 'issued', 'voided')),
  booking_id            uuid        references public.bookings(id) on delete restrict,
  group_id              uuid        references public.reservation_groups(id) on delete restrict,
  company_account_id    uuid        references public.company_accounts(id) on delete set null,
  source_reference      text        not null,
  source_title          text        not null,
  bill_to_name          text        not null,
  bill_to_contact       text,
  bill_to_email         text,
  bill_to_phone         text,
  bill_to_address       text,
  tax_id                text,
  stay_start            date,
  stay_end              date,
  total_charges_ugx     bigint      not null default 0,
  total_paid_ugx        bigint      not null default 0,
  balance_due_ugx       bigint      not null default 0,
  note                  text,
  source_snapshot       jsonb       not null default '{}'::jsonb,
  created_by            uuid        references public.admin_users(id),
  issued_by             uuid        references public.admin_users(id),
  voided_by             uuid        references public.admin_users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  issued_at             timestamptz,
  voided_at             timestamptz,
  void_reason           text,
  constraint invoices_source_check check (
    (invoice_type = 'booking' and booking_id is not null and group_id is null)
    or
    (invoice_type = 'group' and group_id is not null and booking_id is null)
  ),
  constraint invoices_status_dates_check check (
    (status = 'draft' and issued_at is null and voided_at is null)
    or
    (status = 'issued' and issued_at is not null and voided_at is null)
    or
    (status = 'voided' and issued_at is not null and voided_at is not null and void_reason is not null)
  )
);

create index if not exists invoices_status_idx
  on public.invoices(status, created_at desc);

create index if not exists invoices_booking_idx
  on public.invoices(booking_id, created_at desc)
  where booking_id is not null;

create index if not exists invoices_group_idx
  on public.invoices(group_id, created_at desc)
  where group_id is not null;

create index if not exists invoices_company_idx
  on public.invoices(company_account_id, created_at desc)
  where company_account_id is not null;

create table if not exists public.invoice_lines (
  id                uuid        primary key default gen_random_uuid(),
  invoice_id        uuid        not null references public.invoices(id) on delete cascade,
  line_order        integer     not null,
  description       text        not null,
  category          text        not null,
  quantity          numeric     not null default 1,
  unit_amount_ugx   bigint      not null,
  amount_ugx        bigint      not null,
  source_charge_id  uuid        references public.folio_charges(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique(invoice_id, line_order)
);

create index if not exists invoice_lines_invoice_idx
  on public.invoice_lines(invoice_id, line_order);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row
execute function public.set_updated_at();

create or replace function public.prevent_issued_invoice_line_changes()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.invoices
  where id = coalesce(new.invoice_id, old.invoice_id);

  if v_status <> 'draft' then
    raise exception 'Issued or voided invoice lines are immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists invoice_lines_immutable_after_issue on public.invoice_lines;
create trigger invoice_lines_immutable_after_issue
before update or delete on public.invoice_lines
for each row
execute function public.prevent_issued_invoice_line_changes();

comment on table public.invoices is
  'Draft, issued, and voided billing invoice snapshots generated from booking or group folios. These are resort invoices, not EFRIS fiscal invoices.';

comment on table public.invoice_lines is
  'Snapshot line items copied from active folio charges when an invoice draft is generated.';

commit;
