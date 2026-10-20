-- Feature 02: persisted POS orders and server-authoritative totals.
create table if not exists public.store_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 10000),
  service_rate_bps integer not null default 0 check (service_rate_bps between 0 and 10000),
  discount_rate_bps integer not null default 0 check (discount_rate_bps between 0 and 10000),
  updated_at timestamptz not null default now()
);

insert into public.store_settings (store_id)
select id from public.stores
on conflict (store_id) do nothing;

create or replace function public.seed_store_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.store_settings (store_id) values (new.id) on conflict (store_id) do nothing;
  return new;
end;
$$;

drop trigger if exists stores_seed_settings on public.stores;
create trigger stores_seed_settings after insert on public.stores
for each row execute function public.seed_store_settings();

create table if not exists public.orders (
  id uuid primary key,
  store_id uuid not null references public.stores(id),
  order_code text not null unique,
  cashier_id uuid not null references auth.users(id),
  request_id uuid not null,
  status text not null default 'open' check (status in ('open', 'pending_payment', 'paid', 'cancelled', 'expired', 'refunded')),
  subtotal integer not null check (subtotal >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  tax_amount integer not null default 0 check (tax_amount >= 0),
  service_amount integer not null default 0 check (service_amount >= 0),
  total_amount integer not null check (total_amount >= 0),
  customer_name text,
  table_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, request_id),
  unique (id, store_id)
);

create index if not exists orders_store_created_idx on public.orders (store_id, created_at desc);
create index if not exists orders_store_status_idx on public.orders (store_id, status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  store_id uuid not null,
  product_id uuid not null references public.products(id),
  product_name text not null,
  kind text not null check (kind in ('product', 'space')),
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  line_total integer not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  foreign key (order_id, store_id) references public.orders(id, store_id) on delete cascade
);

create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.store_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "members can view store settings" on public.store_settings;
create policy "members can view store settings" on public.store_settings
  for select to authenticated using (public.is_store_member(store_id));
drop policy if exists "admins can update store settings" on public.store_settings;
create policy "admins can update store settings" on public.store_settings
  for update to authenticated using (public.has_store_role(store_id, array['owner', 'admin']))
  with check (public.has_store_role(store_id, array['owner', 'admin']));

drop policy if exists "members can view orders" on public.orders;
create policy "members can view orders" on public.orders
  for select to authenticated using (public.is_store_member(store_id));
drop policy if exists "members can view order items" on public.order_items;
create policy "members can view order items" on public.order_items
  for select to authenticated using (public.is_store_member(store_id));

grant select on public.store_settings to authenticated;
grant update (tax_rate_bps, service_rate_bps, discount_rate_bps) on public.store_settings to authenticated;
grant select on public.orders, public.order_items to authenticated;

create or replace function public.create_pos_order(
  p_store_id uuid,
  p_request_id uuid,
  p_items jsonb,
  p_customer_name text default null,
  p_table_code text default null
)
returns table (
  order_id uuid,
  order_code text,
  subtotal integer,
  discount_amount integer,
  tax_amount integer,
  service_amount integer,
  total_amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.orders%rowtype;
  v_order_id uuid := gen_random_uuid();
  v_order_code text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_tax bigint := 0;
  v_service bigint := 0;
  v_total bigint := 0;
  v_tax_rate integer := 0;
  v_service_rate integer := 0;
  v_discount_rate integer := 0;
  v_requested integer;
begin
  if v_user_id is null or not public.is_store_member(p_store_id) then
    raise exception 'not authorized for this store' using errcode = '42501';
  end if;
  if p_request_id is null or p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'order must contain at least one item' using errcode = '22023';
  end if;

  select * into v_existing from public.orders o
  where o.store_id = p_store_id and o.request_id = p_request_id;
  if found then
    return query select v_existing.id, v_existing.order_code, v_existing.subtotal,
      v_existing.discount_amount, v_existing.tax_amount, v_existing.service_amount, v_existing.total_amount;
    return;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'quantity must be between 1 and 99' using errcode = '22023';
    end if;
    select * into v_product from public.products p
    where p.id = (v_item->>'product_id')::uuid and p.store_id = p_store_id and p.is_active
    for update;
    if not found then
      raise exception 'product is unavailable' using errcode = '22023';
    end if;
    select coalesce(sum((e.value->>'quantity')::integer), 0)::integer into v_requested
    from jsonb_array_elements(p_items) e
    where e.value->>'product_id' = v_product.id::text;
    if v_product.stock is not null and v_requested > v_product.stock then
      raise exception 'insufficient stock for %', v_product.name using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + (v_product.price::bigint * v_qty);
  end loop;

  select coalesce(s.tax_rate_bps, 0), coalesce(s.service_rate_bps, 0), coalesce(s.discount_rate_bps, 0)
  into v_tax_rate, v_service_rate, v_discount_rate
  from public.store_settings s where s.store_id = p_store_id;
  v_discount := round(v_subtotal * v_discount_rate / 10000.0)::bigint;
  v_tax := round((v_subtotal - v_discount) * v_tax_rate / 10000.0)::bigint;
  v_service := round((v_subtotal - v_discount) * v_service_rate / 10000.0)::bigint;
  v_total := v_subtotal - v_discount + v_tax + v_service;
  if v_total > 2147483647 then raise exception 'order total exceeds supported range' using errcode = '22003'; end if;
  v_order_code := 'POS-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 8));

  begin
    insert into public.orders (id, store_id, order_code, cashier_id, request_id, subtotal,
      discount_amount, tax_amount, service_amount, total_amount, customer_name, table_code)
    values (v_order_id, p_store_id, v_order_code, v_user_id, p_request_id, v_subtotal,
    v_discount, v_tax, v_service, v_total, nullif(trim(p_customer_name), ''), null);
  exception when unique_violation then
    select * into v_existing from public.orders o
    where o.store_id = p_store_id and o.request_id = p_request_id;
    if found then
      return query select v_existing.id, v_existing.order_code, v_existing.subtotal,
        v_existing.discount_amount, v_existing.tax_amount, v_existing.service_amount, v_existing.total_amount;
      return;
    end if;
    raise;
  end;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products p
    where p.id = (v_item->>'product_id')::uuid and p.store_id = p_store_id and p.is_active;
    insert into public.order_items (order_id, store_id, product_id, product_name, kind, quantity, unit_price, line_total)
    values (v_order_id, p_store_id, v_product.id, v_product.name, v_product.kind, v_qty, v_product.price, v_product.price * v_qty);
  end loop;

  return query select v_order_id, v_order_code, v_subtotal::integer, v_discount::integer, v_tax::integer, v_service::integer, v_total::integer;
end;
$$;

revoke all on function public.create_pos_order(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.create_pos_order(uuid, uuid, jsonb, text, text) to authenticated;

create or replace function public.update_pos_order(
  p_order_id uuid,
  p_items jsonb,
  p_customer_name text default null,
  p_table_code text default null
)
returns table (
  order_id uuid,
  order_code text,
  subtotal integer,
  discount_amount integer,
  tax_amount integer,
  service_amount integer,
  total_amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_requested integer;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_tax bigint := 0;
  v_service bigint := 0;
  v_total bigint := 0;
  v_tax_rate integer := 0;
  v_service_rate integer := 0;
  v_discount_rate integer := 0;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_user_id is null or not public.is_store_member(v_order.store_id) then
    raise exception 'not authorized for this order' using errcode = '42501';
  end if;
  if v_order.status <> 'open' or (v_order.cashier_id <> v_user_id and not public.has_store_role(v_order.store_id, array['owner', 'admin'])) then
    raise exception 'order cannot be edited' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'order must contain at least one item' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'quantity must be between 1 and 99' using errcode = '22023';
    end if;
    select * into v_product from public.products p
    where p.id = (v_item->>'product_id')::uuid and p.store_id = v_order.store_id and p.is_active
    for update;
    if not found then raise exception 'product is unavailable' using errcode = '22023'; end if;
    select coalesce(sum((e.value->>'quantity')::integer), 0)::integer into v_requested
    from jsonb_array_elements(p_items) e where e.value->>'product_id' = v_product.id::text;
    if v_product.stock is not null and v_requested > v_product.stock then
      raise exception 'insufficient stock for %', v_product.name using errcode = '22023';
    end if;
    v_subtotal := v_subtotal + (v_product.price::bigint * v_qty);
  end loop;

  select coalesce(s.tax_rate_bps, 0), coalesce(s.service_rate_bps, 0), coalesce(s.discount_rate_bps, 0)
  into v_tax_rate, v_service_rate, v_discount_rate
  from public.store_settings s where s.store_id = v_order.store_id;
  v_discount := round(v_subtotal * v_discount_rate / 10000.0)::bigint;
  v_tax := round((v_subtotal - v_discount) * v_tax_rate / 10000.0)::bigint;
  v_service := round((v_subtotal - v_discount) * v_service_rate / 10000.0)::bigint;
  v_total := v_subtotal - v_discount + v_tax + v_service;
  if v_total > 2147483647 then raise exception 'order total exceeds supported range' using errcode = '22003'; end if;

  update public.orders set subtotal = v_subtotal, discount_amount = v_discount, tax_amount = v_tax,
    service_amount = v_service, total_amount = v_total,
    customer_name = nullif(trim(p_customer_name), ''), updated_at = now()
  where id = p_order_id;
  delete from public.order_items where order_items.order_id = p_order_id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products p
    where p.id = (v_item->>'product_id')::uuid and p.store_id = v_order.store_id and p.is_active;
    insert into public.order_items (order_id, store_id, product_id, product_name, kind, quantity, unit_price, line_total)
    values (p_order_id, v_order.store_id, v_product.id, v_product.name, v_product.kind, v_qty, v_product.price, v_product.price * v_qty);
  end loop;

  return query select p_order_id, v_order.order_code, v_subtotal::integer, v_discount::integer, v_tax::integer, v_service::integer, v_total::integer;
end;
$$;

revoke all on function public.update_pos_order(uuid, jsonb, text, text) from public, anon;
grant execute on function public.update_pos_order(uuid, jsonb, text, text) to authenticated;

create or replace function public.cancel_pos_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_user_id uuid := auth.uid();
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_user_id is null or not public.is_store_member(v_order.store_id) then
    raise exception 'not authorized for this order' using errcode = '42501';
  end if;
  if v_order.status <> 'open' or (v_order.cashier_id <> v_user_id and not public.has_store_role(v_order.store_id, array['owner', 'admin'])) then
    raise exception 'order cannot be cancelled' using errcode = '42501';
  end if;
  update public.orders set status = 'cancelled', updated_at = now() where id = p_order_id;
end;
$$;

revoke all on function public.cancel_pos_order(uuid) from public, anon;
grant execute on function public.cancel_pos_order(uuid) to authenticated;
