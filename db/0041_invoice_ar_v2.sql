-- Invoice V2: due dates, payment terms, and AR aging support.
begin;

alter table public.invoices
  add column if not exists payment_terms_days integer not null default 0 check (payment_terms_days >= 0),
  add column if not exists due_date date;

update public.invoices
set due_date = (issued_at at time zone 'Africa/Kampala')::date + payment_terms_days
where status in ('issued', 'voided')
  and issued_at is not null
  and due_date is null;

create index if not exists invoices_due_date_idx
  on public.invoices(due_date, status)
  where due_date is not null;

comment on column public.invoices.payment_terms_days is
  'Payment terms captured when the draft invoice is created. Due date is based on issue date plus this term.';

comment on column public.invoices.due_date is
  'Invoice due date for AR aging. Draft invoices may be null until issue.';

commit;
