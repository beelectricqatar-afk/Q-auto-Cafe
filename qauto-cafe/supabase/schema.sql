-- Q-Auto Cafe POS — Supabase schema (shared sync mirror)
-- Safe to run more than once (idempotent).
--
-- Each domain store is mirrored with a generic shape:
--   id          text   primary key   (the record's id; for `meta` it's the key)
--   data        jsonb                (the full record, exactly as on-device)
--   updated_at  bigint               (milliseconds since epoch; last-write-wins)
--
-- These tables are never read by hand — the app's admin panel is the UI — so a
-- generic jsonb blob keeps the sync layer trivial and avoids field mapping.

-- ── Domain tables ──────────────────────────────────────────────────────────
create table if not exists public.departments (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.staff (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.ingredients (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.categories (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.menu_items (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.orders (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.inventory_adjustments (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.meta (
  id text primary key,            -- holds the meta "key"
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.deletion_logs (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.requests (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.finance_expenses (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.finance_receipts (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.finance_wastages (
  id text primary key,
  data jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- ── Backups (12h auto-snapshots) ───────────────────────────────────────────
create table if not exists public.backups (
  id text primary key default gen_random_uuid()::text,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  payload jsonb not null
);

-- ── Indexes for incremental pulls ──────────────────────────────────────────
create index if not exists departments_updated_at_idx           on public.departments (updated_at);
create index if not exists staff_updated_at_idx                 on public.staff (updated_at);
create index if not exists ingredients_updated_at_idx           on public.ingredients (updated_at);
create index if not exists categories_updated_at_idx            on public.categories (updated_at);
create index if not exists menu_items_updated_at_idx            on public.menu_items (updated_at);
create index if not exists orders_updated_at_idx                on public.orders (updated_at);
create index if not exists inventory_adjustments_updated_at_idx on public.inventory_adjustments (updated_at);
create index if not exists meta_updated_at_idx                  on public.meta (updated_at);
create index if not exists deletion_logs_updated_at_idx         on public.deletion_logs (updated_at);
create index if not exists requests_updated_at_idx              on public.requests (updated_at);
create index if not exists finance_expenses_updated_at_idx      on public.finance_expenses (updated_at);
create index if not exists finance_receipts_updated_at_idx      on public.finance_receipts (updated_at);
create index if not exists finance_wastages_updated_at_idx      on public.finance_wastages (updated_at);
create index if not exists backups_period_idx                   on public.backups ((payload->>'periodKey'));

-- ── Open access (no auth) ──────────────────────────────────────────────────
-- Matches the "no login anywhere" decision: anon + authenticated can do
-- everything. NOTE: the public URL means anyone with the link can read/write.
do $$
declare t text;
begin
  foreach t in array array[
    'departments','staff','ingredients','categories','menu_items',
    'orders','inventory_adjustments','meta','deletion_logs','requests','finance_expenses','finance_receipts','finance_wastages','backups'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "open_all" on public.%I;', t);
    execute format(
      'create policy "open_all" on public.%I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
