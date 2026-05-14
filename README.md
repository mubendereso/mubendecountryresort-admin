# Mubende Country Resort — Admin & Database

Admin panel and database home for Mubende Country Resort.

Manages bookings, room types, amenities, experiences, services, gallery content, contact submissions, and Pesapal payment state.

## Architecture

- Storefront: [`mubende_country_resort`](https://github.com/mubendereso/mubende_country_resort) (Next.js public site)
- Admin (this repo): Next.js admin panel
- Shared Neon Postgres database

The database schema is the **canonical source of truth for both apps** and lives in this repo.
The database is not exposed directly to browsers; public reads, booking writes,
payments, and admin actions should flow through server-only Next.js code.

## Repo layout

```
db/
  0001_init.sql        # Full initial schema: content tables, bookings, payment_attempts
                       # journal, Pesapal IPN events, durable recovery queue,
                       # contact submissions, ops_incidents, admin users/sessions,
                       # and Postgres business functions.
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
- Overbooking prevention: `create_booking` takes a `FOR UPDATE` lock on the
  `room_types` row; concurrent attempts serialise. Inventory-shrink trigger blocks
  unsafe `inventory_count` reductions.
- Access control: handled by server-only Next.js code and Neon credentials, not
  Supabase RLS/API roles.

## Applying the schema

In the Neon SQL editor, run:

- `db/0001_init.sql`
- `db/seed.sql`

Or run both against `DATABASE_URL` with `psql`.

After applying the schema, create the first admin user:

```bash
npm run admin:create-user -- staff@example.com "temporary-password" superadmin "Staff Name"
```

## Status

- [x] Repo initialised
- [x] Initial schema written (`db/0001_init.sql`)
- [x] Seed data ported from storefront (`db/seed.sql`)
- [x] Schema applied to live Neon database
- [ ] Storefront wired to read from DB (currently reads hardcoded `data.ts`)
- [x] Admin app scaffolded
- [ ] Pesapal initiation + IPN handlers (live in storefront repo)
- [ ] Pending-payment recovery scheduler (live in storefront repo)
