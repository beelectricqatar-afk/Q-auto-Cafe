-- Q-Auto Cafe online ordering (qautocafe.vercel.app). Safe to run more than once.
--
-- Customers never touch the POS tables. The customer site can only:
--   1. read the menu        → online_menu()
--   2. place an order       → place_online_order(order)
--   3. follow its own order → online_order_status(id, token)
-- Prices, item names and the 15% are worked out here from menu_items, so a
-- customer cannot send their own price.
--
-- An order waits in online_orders until a barista accepts it. Accepting places
-- it through the POS like any counter order (stock, billing, finance).

create table if not exists public.online_orders (
  id text primary key default gen_random_uuid()::text,
  data jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'onway', 'delivered', 'rejected')),
  -- Proves the customer placed this order, so only they can follow it.
  token text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists online_orders_status_idx on public.online_orders (status);
create index if not exists online_orders_created_at_idx on public.online_orders (created_at);

-- Same access as every other table today: the POS has no login, so it reads and
-- updates with the public key. This tightens once the admin login exists.
alter table public.online_orders enable row level security;
drop policy if exists "open_all" on public.online_orders;
create policy "open_all" on public.online_orders for all to anon, authenticated using (true) with check (true);

-- ── The menu, as the customer sees it ─────────────────────────────────────
-- Active, priced items only; free add-ons stay a counter thing. `milk` says
-- whether the drink offers fresh vs lactose-free.
create or replace function public.online_menu()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.data->>'name', 'sortOrder', (c.data->>'sortOrder')::int)
                       order by (c.data->>'sortOrder')::int)
      from categories c), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.data->>'name', 'price', (m.data->>'price')::numeric,
        'categoryId', m.data->>'categoryId',
        'milk', exists (
          select 1 from jsonb_array_elements(m.data->'recipe') r
          join ingredients i on i.id = r->>'ingredientId'
          where i.data->>'name' ~* '(fresh\s*milk|lactose)')
      ) order by m.data->>'name')
      from menu_items m
      where coalesce((m.data->>'active')::boolean, false)
        and not coalesce((m.data->>'addOn')::boolean, false)
        and (m.data->>'price')::numeric > 0), '[]'::jsonb)
  );
$$;

-- ── Place an order ─────────────────────────────────────────────────────────
-- order = { branch: 'audi'|'volkswagen', who: 'guest'|'retail', name,
--           ext (guest: the host's extension), mobile (retail: 8 digits),
--           pay (retail: 'cash'|'card'), deliverTo, note?,
--           lines: [{ itemId, qty, milk?: 'fresh'|'lactose-free' }] }
create or replace function public.place_online_order(o jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_branch text := o->>'branch';
  v_who    text := o->>'who';
  v_name   text := btrim(coalesce(o->>'name', ''));
  v_ext    text := regexp_replace(coalesce(o->>'ext', ''), '\D', '', 'g');
  v_mobile text := regexp_replace(coalesce(o->>'mobile', ''), '\D', '', 'g');
  v_pay    text := o->>'pay';
  v_to     text := btrim(coalesce(o->>'deliverTo', ''));
  v_note   text := left(btrim(coalesce(o->>'note', '')), 200);
  v_lines  jsonb := '[]'::jsonb;
  v_sub    numeric := 0;
  v_pct    int;
  v_total  numeric;
  v_no     int;
  v_now    bigint := (extract(epoch from now()) * 1000)::bigint;
  v_day    bigint := (extract(epoch from date_trunc('day', now() at time zone 'Asia/Qatar') at time zone 'Asia/Qatar') * 1000)::bigint;
  l jsonb; m jsonb; q int;
  v_id text; v_token text;
begin
  if v_branch is null or v_branch not in ('audi', 'volkswagen') then raise exception 'Pick a branch'; end if;
  if v_who is null or v_who not in ('guest', 'retail') then raise exception 'Pick who the order is for'; end if;
  if length(v_name) < 1 or length(v_name) > 60 then raise exception 'Add your name'; end if;
  if length(v_to) < 1 or length(v_to) > 120 then raise exception 'Add where to bring it'; end if;
  if v_who = 'guest' and (length(v_ext) < 1 or length(v_ext) > 6) then raise exception 'Add the extension'; end if;
  if v_who = 'retail' and length(v_mobile) <> 8 then raise exception 'Add an 8-digit mobile'; end if;
  if v_who = 'retail' and (v_pay is null or v_pay not in ('cash', 'card')) then raise exception 'Pick cash or card'; end if;
  if jsonb_typeof(o->'lines') is distinct from 'array' or jsonb_array_length(o->'lines') not between 1 and 20 then
    raise exception 'The order has no items';
  end if;
  -- A flood guard: the cafe can't be sent more than this many unanswered orders.
  if (select count(*) from online_orders where status = 'pending') >= 40 then
    raise exception 'The cafe is busy, please try again shortly';
  end if;

  for l in select * from jsonb_array_elements(o->'lines') loop
    q := (l->>'qty')::int;
    if q is null or q < 1 or q > 20 then raise exception 'Check the quantities'; end if;
    m := null;
    select data into m from menu_items where id = l->>'itemId'
      and coalesce((data->>'active')::boolean, false) and not coalesce((data->>'addOn')::boolean, false);
    if m is null then raise exception 'An item is no longer on the menu'; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'itemId', l->>'itemId', 'name', m->>'name', 'qty', q, 'unitPrice', (m->>'price')::numeric,
      'milk', case when l->>'milk' in ('fresh', 'lactose-free') then l->>'milk' end)));
    v_sub := v_sub + q * (m->>'price')::numeric;
  end loop;

  -- Same sums as the POS: ticketTotal then applyDiscount, both to 2 decimals.
  v_sub := round(v_sub, 2);
  v_pct := case when v_who = 'retail' then 15 else 0 end;
  v_total := round(v_sub * (1 - v_pct / 100.0), 2);

  -- Numbers restart each day (Qatar time); the lock keeps two at once apart.
  perform pg_advisory_xact_lock(hashtext('online_orders_no'));
  select coalesce(max((data->>'no')::int), 0) + 1 into v_no from online_orders where created_at >= v_day;

  insert into online_orders (data, created_at, updated_at)
  values (jsonb_strip_nulls(jsonb_build_object(
    'no', v_no, 'branch', v_branch, 'who', v_who, 'name', v_name,
    'ext', case when v_who = 'guest' then nullif(v_ext, '') end,
    'mobile', case when v_who = 'retail' then v_mobile end,
    'pay', case when v_who = 'retail' then v_pay end,
    'deliverTo', v_to, 'note', nullif(v_note, ''),
    'lines', v_lines, 'subtotal', v_sub, 'discountPct', v_pct, 'total', v_total)), v_now, v_now)
  returning id, token into v_id, v_token;

  return jsonb_build_object('id', v_id, 'token', v_token, 'no', v_no,
    'subtotal', v_sub, 'discountPct', v_pct, 'total', v_total, 'status', 'pending');
end;
$$;

-- ── Follow an order ────────────────────────────────────────────────────────
create or replace function public.online_order_status(p_id text, p_token text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('status', status, 'no', data->'no', 'subtotal', data->'subtotal',
    'discountPct', data->'discountPct', 'total', data->'total', 'reason', data->'reason', 'updatedAt', updated_at)
  from online_orders where id = p_id and token = p_token;
$$;

revoke all on function public.online_menu() from public;
revoke all on function public.place_online_order(jsonb) from public;
revoke all on function public.online_order_status(text, text) from public;
grant execute on function public.online_menu() to anon, authenticated;
grant execute on function public.place_online_order(jsonb) to anon, authenticated;
grant execute on function public.online_order_status(text, text) to anon, authenticated;
