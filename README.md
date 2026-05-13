# Mubende Country Resort — Admin & Database

Admin panel and database home for Mubende Country Resort.

Manages bookings, room types, amenities, experiences, services, gallery content, contact submissions, and Pesapal payment state.

## Architecture

- Storefront: [`mubende_country_resort`](https://github.com/mubendereso/mubende_country_resort) (Next.js public site)
- Admin (this repo): Next.js admin panel — *not yet scaffolded*
- Shared Supabase project (Postgres + Auth + Storage)

The database schema is the **canonical source of truth for both apps** and lives in this repo.

## Repo layout

```
db/
  0001_init.sql        # Full initial schema: content tables, bookings, payment_attempts
                       # journal, Pesapal IPN events, durable recovery queue,
                       # contact submissions, ops_incidents, profiles, RLS, RPCs.
  seed.sql             # Ports the storefront's hardcoded content into the DB.
```

Schema design notes:

- Currency: UGX only. Prices stored as `bigint` in whole UGX.
- Payments: Pesapal v3. Booking auto-confirms on successful IPN.
- Recovery: event-driven, no cron. Durable queue (`pending_payment_recoveries`) +
  in-process scheduler triggered opportunistically from payment-adjacent routes.
  Ported from `thesmokehouse-admin/db/phase-37-durable-pending-payment-recovery.sql`.
- Inventory holds: `bookings.expires_at` (15-min hold). Stale `pending_payment`
  rows fade out of availability via predicate filter, no active sweep needed.
- Overbooking prevention: `create_booking` RPC takes a `FOR UPDATE` lock on the
  `room_types` row; concurrent attempts serialise. Inventory-shrink trigger blocks
  unsafe `inventory_count` reductions.

## Applying the schema

Either:

- Paste `db/0001_init.sql` then `db/seed.sql` into the Supabase SQL editor, or
- Use the Supabase CLI:

  ```bash
  supabase db push        # applies db/0001_init.sql
  supabase db seed        # runs db/seed.sql
  ```

## Status

- [x] Repo initialised
- [x] Initial schema written (`db/0001_init.sql`)
- [x] Seed data ported from storefront (`db/seed.sql`)
- [ ] Schema applied to live Supabase project
- [ ] Storefront wired to read from DB (currently reads hardcoded `data.ts`)
- [ ] Admin app scaffolded
- [ ] Pesapal initiation + IPN handlers (live in storefront repo)
- [ ] Pending-payment recovery scheduler (live in storefront repo)
