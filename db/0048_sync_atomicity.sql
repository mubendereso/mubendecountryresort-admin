-- Strengthen sync push atomicity:
--   - bind idempotency to a stable request hash
--   - keep the hash in the same ledger row that records the applied result
--   - leave existing historical rows nullable so old replays keep working

begin;

alter table public.sync_applied_mutations
  add column if not exists request_hash text;

comment on column public.sync_applied_mutations.request_hash is
  'Stable SHA-256 hash of the queued mutation payload used to detect same-key replay drift.';

commit;

