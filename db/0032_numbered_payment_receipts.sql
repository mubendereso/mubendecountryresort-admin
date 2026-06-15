-- Immutable numbered receipt snapshots for every folio payment.
begin;

create sequence if not exists public.payment_receipt_number_seq;

create table if not exists public.payment_receipts (
  id                    uuid primary key default gen_random_uuid(),
  payment_id            uuid not null unique references public.folio_payments(id) on delete restrict,
  booking_id            uuid not null references public.bookings(id) on delete restrict,
  receipt_number        text not null unique,
  booking_reference     text not null,
  guest_full_name       text not null,
  guest_email           text,
  guest_phone           text,
  room_type_title       text not null,
  check_in              date not null,
  check_out             date not null,
  amount_ugx            bigint not null check (amount_ugx > 0),
  payment_method        text not null,
  payment_reference     text,
  recorded_by_name      text,
  issued_at             timestamptz not null,
  created_at            timestamptz not null default now()
);

create index if not exists payment_receipts_booking_idx
  on public.payment_receipts(booking_id, issued_at);

create or replace function public.issue_payment_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence bigint;
  v_year text;
  v_inserted int;
begin
  v_sequence := nextval('public.payment_receipt_number_seq');
  v_year := to_char(new.recorded_at at time zone 'Africa/Kampala', 'YYYY');

  insert into public.payment_receipts (
    payment_id,
    booking_id,
    receipt_number,
    booking_reference,
    guest_full_name,
    guest_email,
    guest_phone,
    room_type_title,
    check_in,
    check_out,
    amount_ugx,
    payment_method,
    payment_reference,
    recorded_by_name,
    issued_at
  )
  select
    new.id,
    b.id,
    'RCT-' || v_year || '-' || lpad(v_sequence::text, 6, '0'),
    b.reference,
    b.guest_full_name,
    b.guest_email,
    b.guest_phone,
    rt.title,
    b.check_in,
    b.check_out,
    new.amount_ugx,
    new.method,
    new.reference,
    au.full_name,
    new.recorded_at
  from public.bookings b
  join public.room_types rt on rt.id = b.room_type_id
  left join public.admin_users au on au.id = new.recorded_by
  where b.id = new.booking_id;

  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'Payment receipt snapshot could not be created';
  end if;

  return new;
end;
$$;

drop trigger if exists folio_payments_issue_receipt on public.folio_payments;
create trigger folio_payments_issue_receipt
after insert on public.folio_payments
for each row
execute function public.issue_payment_receipt();

insert into public.payment_receipts (
  payment_id,
  booking_id,
  receipt_number,
  booking_reference,
  guest_full_name,
  guest_email,
  guest_phone,
  room_type_title,
  check_in,
  check_out,
  amount_ugx,
  payment_method,
  payment_reference,
  recorded_by_name,
  issued_at
)
select
  fp.id,
  b.id,
  'RCT-' ||
    to_char(fp.recorded_at at time zone 'Africa/Kampala', 'YYYY') ||
    '-' ||
    lpad(nextval('public.payment_receipt_number_seq')::text, 6, '0'),
  b.reference,
  b.guest_full_name,
  b.guest_email,
  b.guest_phone,
  rt.title,
  b.check_in,
  b.check_out,
  fp.amount_ugx,
  fp.method,
  fp.reference,
  au.full_name,
  fp.recorded_at
from public.folio_payments fp
join public.bookings b on b.id = fp.booking_id
join public.room_types rt on rt.id = b.room_type_id
left join public.admin_users au on au.id = fp.recorded_by
where not exists (
  select 1
  from public.payment_receipts pr
  where pr.payment_id = fp.id
)
order by fp.recorded_at, fp.id;

create or replace function public.prevent_payment_receipt_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Payment receipts are immutable';
end;
$$;

drop trigger if exists payment_receipts_immutable on public.payment_receipts;
create trigger payment_receipts_immutable
before update or delete on public.payment_receipts
for each row
execute function public.prevent_payment_receipt_changes();

commit;
