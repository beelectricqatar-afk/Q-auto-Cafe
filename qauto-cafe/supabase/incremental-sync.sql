-- Q-Auto Cafe: let devices download only what changed since their last sync.
-- Safe to run more than once. Only adds things; no data is changed or removed.
--
-- 1. Every synced table gets `synced_at`: the database's own clock (ms) at the
--    moment a row was last written. Devices' clocks can be off; this one isn't.
-- 2. `sync_deletions` remembers which rows were deleted and when, so other
--    devices can delete them too without downloading the whole table.
-- Older copies of the app keep working: they ignore both.

create or replace function public.stamp_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end $$;

create table if not exists public.sync_deletions (
  tbl text not null,
  id text not null,
  deleted_at bigint not null,
  primary key (tbl, id)
);
create index if not exists sync_deletions_deleted_at_idx on public.sync_deletions (deleted_at);
alter table public.sync_deletions enable row level security;
drop policy if exists "open_all" on public.sync_deletions;
create policy "open_all" on public.sync_deletions for all to anon, authenticated using (true) with check (true);

create or replace function public.record_sync_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into sync_deletions (tbl, id, deleted_at)
  values (tg_table_name, old.id, (extract(epoch from clock_timestamp()) * 1000)::bigint)
  on conflict (tbl, id) do update set deleted_at = excluded.deleted_at;
  return old;
end $$;

-- A row written again after a delete (e.g. restored) is no longer deleted.
create or replace function public.clear_sync_deletion() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from sync_deletions where tbl = tg_table_name and id = new.id;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'departments', 'staff', 'ingredients', 'categories', 'menu_items', 'orders',
    'inventory_adjustments', 'deletion_logs', 'finance_expenses', 'finance_receipts', 'finance_wastages'
  ] loop
    execute format('alter table public.%I add column if not exists synced_at bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint', t);
    execute format('create index if not exists %I on public.%I (synced_at)', t || '_synced_at_idx', t);
    execute format('drop trigger if exists stamp_synced_at on public.%I', t);
    execute format('create trigger stamp_synced_at before insert or update on public.%I for each row execute function public.stamp_synced_at()', t);
    execute format('drop trigger if exists record_sync_deletion on public.%I', t);
    execute format('create trigger record_sync_deletion after delete on public.%I for each row execute function public.record_sync_deletion()', t);
    execute format('drop trigger if exists clear_sync_deletion on public.%I', t);
    execute format('create trigger clear_sync_deletion after insert on public.%I for each row execute function public.clear_sync_deletion()', t);
  end loop;
end $$;
