-- =====================================================================
-- Mubende Country Resort — rate-limit primitive (MCR-INFRA-01)
-- =====================================================================
-- A durable, strictly-global fixed-window rate limiter living in Neon.
-- Underpins login throttle (MCR-SEC-02), booking anti-abuse (MCR-SEC-09),
-- contact anti-abuse (MCR-SEC-10), and IPN throttling (MCR-SEC-11).
--
-- Why a Neon RPC (not the Cloudflare Workers binding): for a SECURITY
-- limiter the property that matters is global atomicity — an attacker
-- must not be able to multiply their allowance by hitting different edge
-- colos. The CF binding is per-colo and approximate, and does not run
-- under `next dev`. consume_rate_limit() is a single atomic statement
-- (INSERT ... ON CONFLICT), so it is correct even though the Neon HTTP
-- driver cannot run multi-statement transactions. A CF binding can be
-- layered in front later as a pure speed optimization.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- rate_limits: one row per limiter key, holding the current window.
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  rate_key     text primary key,
  window_start timestamptz not null,
  count        integer not null
);

-- For periodic pruning of stale keys (see prune_rate_limits).
create index if not exists rate_limits_window_start_idx
  on public.rate_limits(window_start);

-- ---------------------------------------------------------------------
-- consume_rate_limit: record one hit against p_key and report whether it
-- is still within the allowance. Returns true if allowed, false if the
-- caller has exceeded p_max hits within the p_window_seconds window.
--
-- Fixed-window: the first hit (or the first hit after a window expires)
-- opens a new window anchored at now(); subsequent hits increment until
-- the window rolls over. Atomic via a single upsert.
-- ---------------------------------------------------------------------
create or replace function public.consume_rate_limit(
  p_key            text,
  p_max            integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now    timestamptz := now();
  v_expiry interval    := make_interval(secs => greatest(1, p_window_seconds));
  v_count  integer;
begin
  insert into public.rate_limits as r (rate_key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (rate_key) do update
    set
      window_start = case
        when r.window_start + v_expiry <= v_now then v_now
        else r.window_start
      end,
      count = case
        when r.window_start + v_expiry <= v_now then 1
        else r.count + 1
      end
  returning r.count into v_count;

  return v_count <= greatest(1, p_max);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;

-- ---------------------------------------------------------------------
-- prune_rate_limits: delete keys whose window opened before the cutoff.
-- Call opportunistically (e.g. occasionally from a guarded path) or from
-- a Workers cron so the table cannot grow without bound.
-- ---------------------------------------------------------------------
create or replace function public.prune_rate_limits(
  p_older_than_seconds integer default 86400
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where window_start < now() - make_interval(secs => greatest(60, p_older_than_seconds));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_rate_limits(integer) from public;

commit;
