-- Q-Auto Cafe: only a signed-in cafe account can read or change the POS data.
-- Safe to run more than once.
--
-- Before running this, in the Supabase dashboard:
--   1. Authentication → Users → Add user: the shared cafe email + password (auto-confirm).
--   2. Authentication → Sign In / Providers → Email: turn OFF "Allow new users to sign up",
--      so nobody can make their own account with the public key.
-- And deploy the POS with the login first, so the tablets are signed in.
--
-- The customer site (qautocafe.vercel.app) is not affected: it only calls
-- online_menu, place_online_order and online_order_status, which stay open.

do $$
declare t text;
begin
  foreach t in array array[
    'backups', 'categories', 'deletion_logs', 'departments', 'finance_expenses', 'finance_receipts',
    'finance_wastages', 'ingredients', 'inventory_adjustments', 'menu_items', 'meta', 'online_orders',
    'orders', 'requests', 'staff'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "open_all" on public.%I', t);
    execute format('drop policy if exists "signed_in" on public.%I', t);
    execute format('create policy "signed_in" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
