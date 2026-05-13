# Mubende Country Resort — Admin

Admin panel for [Mubende Country Resort](https://github.com/mubendereso/mubende_country_resort).

Manages bookings, room types, amenities, experiences, services, gallery content, contact submissions, and Pesapal payment state.

## Architecture

- Public site: `mubende_country_resort` (Next.js storefront)
- Admin (this repo): Next.js admin panel
- Shared Supabase project (Postgres + Auth + Storage)

The database schema and Pesapal payment recovery infrastructure live in the public site repo under `supabase/migrations/`.

## Status

Repo initialised. Admin app not yet scaffolded.
