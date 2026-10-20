-- Feature 03: atomic stock reservation, cash settlement, and Midtrans Snap status.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('open', 'pending_payment', 'paid', 'paid_review', 'cancelled', 'expired', 'refunded'));
alter table public.orders add column if not exists paid_at timestamptz;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  store_id uuid not null,
  provider_order_id text not null unique,
  amount integer not null check (amount >= 0),
  status text not null check (status in ('initiating', 'pending', 'succeeded', 'failed', 'cancelled', 'expired', 'duplicate_payment')),
  payment_type text,
  transaction_id text unique,
  snap_token text,
  redirect_url text,
  stock_reserved boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, store_id) references public.orders(id, store_id) on delete restrict
);

create index if not exists payments_order_created_idx on public.payments (order_id, created_at desc);
create index if not exists payments_store_status_idx on public.payments (store_id, status, created_at desc);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  product_id uuid not null references public.products(id),
  order_id uuid not null references public.orders(id),
  payment_id uuid references public.payments(id),
  quantity_delta integer not null,
  reason text not null check (reason in ('reserved', 'sale', 'released', 'paid_stock_shortage')),
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_order_idx on public.inventory_movements (order_id, created_at);

alter table public.payments enable row level security;
alter table public.inventory_movements enable row level security;

drop policy if exists "members can view payments" on public.payments;
create policy "members can view payments" on public.payments
  for select to authenticated using (public.is_store_member(store_id));
drop policy if exists "admins and employees can view inventory history" on public.inventory_movements;
create policy "admins and employees can view inventory history" on public.inventory_movements
  for select to authenticated using (public.is_store_member(store_id));
grant select on public.payments, public.inventory_movements to authenticated;

create or replace function public.claim_snap_payment(p_order_id uuid)
returns table (
  payment_id uuid,
  provider_order_id text,
  amount integer,
  payment_status text,
  snap_token text,
  redirect_url text,
  is_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_payment_id uuid;
  v_provider_order_id text;
  v_item record;
  v_product public.products%rowtype;
  v_has_stock boolean := false;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_user_id is null or not public.is_store_member(v_order.store_id) then
    raise exception 'not authorized for this order' using errcode = '42501';
  end if;
  if v_order.cashier_id <> v_user_id and not public.has_store_role(v_order.store_id, array['admin']) then
    raise exception 'not authorized for this order' using errcode = '42501';
  end if;
  if v_order.status = 'paid' or v_order.status = 'paid_review' then
    raise exception 'order is already paid' using errcode = '22023';
  end if;
  if v_order.status not in ('open', 'pending_payment') then
    raise exception 'order cannot be paid' using errcode = '22023';
  end if;

  select * into v_payment from public.payments p where p.order_id = p_order_id and p.status in ('initiating', 'pending')
    order by p.created_at desc limit 1 for update;
  if found then
    return query select v_payment.id, v_payment.provider_order_id, v_payment.amount, v_payment.status,
      v_payment.snap_token, v_payment.redirect_url, false;
    return;
  end if;

  -- Reserve finite stock atomically before sending the shopper to Midtrans.
  for v_item in
    select oi.product_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi where oi.order_id = p_order_id and oi.store_id = v_order.store_id
    group by oi.product_id order by oi.product_id
  loop
    select * into v_product from public.products p where p.id = v_item.product_id for update;
    if v_product.stock is not null then
      if v_product.stock < v_item.quantity then
        raise exception 'insufficient stock for %', v_product.name using errcode = '22023';
      end if;
      update public.products set stock = stock - v_item.quantity, updated_at = now() where id = v_product.id;
      v_has_stock := true;
    end if;
  end loop;

  v_payment_id := gen_random_uuid();
  v_provider_order_id := v_order.order_code || '-P-' || upper(substr(replace(v_payment_id::text, '-', ''), 1, 10));
  insert into public.payments (id, order_id, store_id, provider_order_id, amount, status, stock_reserved)
    values (v_payment_id, p_order_id, v_order.store_id, v_provider_order_id, v_order.total_amount, 'initiating', v_has_stock);
  for v_item in
    select oi.product_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi where oi.order_id = p_order_id and oi.store_id = v_order.store_id
    group by oi.product_id order by oi.product_id
  loop
    if exists (select 1 from public.products p where p.id = v_item.product_id and p.stock is not null) then
      insert into public.inventory_movements (store_id, product_id, order_id, payment_id, quantity_delta, reason)
      values (v_order.store_id, v_item.product_id, p_order_id, v_payment_id, -v_item.quantity, 'reserved');
    end if;
  end loop;
  update public.orders set status = 'pending_payment', updated_at = now() where id = p_order_id;
  return query select v_payment_id, v_provider_order_id, v_order.total_amount, 'initiating'::text, null::text, null::text, true;
end;
$$;

create or replace function public.fail_snap_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_item record;
  v_user_id uuid := auth.uid();
begin
  select * into v_payment from public.payments p where p.id = p_payment_id;
  if not found then raise exception 'payment not found'; end if;
  select * into v_order from public.orders o where o.id = v_payment.order_id for update;
  select * into v_payment from public.payments p where p.id = p_payment_id for update;
  if v_user_id is null or (v_order.cashier_id <> v_user_id and not public.has_store_role(v_order.store_id, array['admin'])) then
    raise exception 'not authorized for this payment' using errcode = '42501';
  end if;
  if v_payment.status not in ('initiating', 'pending') then return; end if;
  update public.payments set status = 'failed', stock_reserved = false, updated_at = now() where id = p_payment_id;
  if v_payment.stock_reserved then
    update public.inventory_movements set reason = 'released'
      where payment_id = p_payment_id and reason = 'reserved';
    for v_item in
      select oi.product_id, sum(oi.quantity)::integer as quantity
      from public.order_items oi where oi.order_id = v_payment.order_id group by oi.product_id order by oi.product_id
    loop
      update public.products set stock = stock + v_item.quantity, updated_at = now()
      where id = v_item.product_id and stock is not null;
      if found then
        insert into public.inventory_movements (store_id, product_id, order_id, payment_id, quantity_delta, reason)
        values (v_payment.store_id, v_item.product_id, v_payment.order_id, p_payment_id, v_item.quantity, 'released');
      end if;
    end loop;
  end if;
  update public.orders set status = 'open', updated_at = now()
    where id = v_payment.order_id and status = 'pending_payment'
      and not exists (select 1 from public.payments p where p.order_id = v_payment.order_id and p.id <> p_payment_id and p.status in ('initiating', 'pending'));
end;
$$;

create or replace function public.take_cash_payment(p_order_id uuid)
returns table (payment_id uuid, order_code text, total_amount integer, paid_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_provider_order_id text;
  v_item record;
  v_product public.products%rowtype;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_user_id is null or not public.is_store_member(v_order.store_id) then
    raise exception 'not authorized for this order' using errcode = '42501';
  end if;
  if v_order.cashier_id <> v_user_id and not public.has_store_role(v_order.store_id, array['admin']) then
    raise exception 'not authorized for this order' using errcode = '42501';
  end if;
  if v_order.status <> 'open' then raise exception 'only open orders can be paid with cash' using errcode = '22023'; end if;

  for v_item in
    select oi.product_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi where oi.order_id = p_order_id group by oi.product_id order by oi.product_id
  loop
    select * into v_product from public.products p where p.id = v_item.product_id for update;
    if v_product.stock is not null and v_product.stock < v_item.quantity then
      raise exception 'insufficient stock for %', v_product.name using errcode = '22023';
    end if;
  end loop;

  v_provider_order_id := 'CASH-' || upper(substr(replace(v_payment_id::text, '-', ''), 1, 20));
  insert into public.payments (id, order_id, store_id, provider_order_id, amount, status, payment_type, paid_at)
    values (v_payment_id, p_order_id, v_order.store_id, v_provider_order_id, v_order.total_amount, 'succeeded', 'cash', now());
  for v_item in
    select oi.product_id, sum(oi.quantity)::integer as quantity
    from public.order_items oi where oi.order_id = p_order_id group by oi.product_id order by oi.product_id
  loop
    update public.products set stock = stock - v_item.quantity, updated_at = now()
      where id = v_item.product_id and stock is not null;
    if found then
      insert into public.inventory_movements (store_id, product_id, order_id, payment_id, quantity_delta, reason)
        values (v_order.store_id, v_item.product_id, p_order_id, v_payment_id, -v_item.quantity, 'sale');
    end if;
  end loop;
  update public.orders set status = 'paid', paid_at = now(), updated_at = now() where id = p_order_id;
  return query select v_payment_id, v_order.order_code, v_order.total_amount, now();
end;
$$;

create or replace function public.process_midtrans_notification(
  p_provider_order_id text,
  p_transaction_id text,
  p_payment_type text,
  p_status text,
  p_gross_amount numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_item record;
  v_product public.products%rowtype;
  v_shortage boolean := false;
  v_existing_pending boolean := false;
  v_other_payment public.payments%rowtype;
begin
  select * into v_payment from public.payments p where p.provider_order_id = p_provider_order_id;
  if not found then raise exception 'payment was not found'; end if;
  if p_gross_amount is null or p_gross_amount <> v_payment.amount::numeric then raise exception 'payment amount mismatch'; end if;
  select * into v_order from public.orders o where o.id = v_payment.order_id for update;
  select * into v_payment from public.payments p where p.provider_order_id = p_provider_order_id for update;

  if p_status = 'pending' then
    if v_payment.status in ('initiating', 'pending') then
      update public.payments set status = 'pending', transaction_id = coalesce(p_transaction_id, transaction_id),
        payment_type = coalesce(p_payment_type, payment_type), updated_at = now() where id = v_payment.id;
    end if;
    return 'pending';
  end if;
  if p_status in ('failed', 'cancelled', 'expired') then
    if v_payment.status not in ('initiating', 'pending') then return v_payment.status; end if;
    update public.payments set status = p_status, transaction_id = coalesce(p_transaction_id, transaction_id),
      payment_type = coalesce(p_payment_type, payment_type), stock_reserved = false, updated_at = now() where id = v_payment.id;
    if v_payment.stock_reserved then
      update public.inventory_movements set reason = 'released'
        where payment_id = v_payment.id and reason = 'reserved';
      for v_item in
        select oi.product_id, sum(oi.quantity)::integer as quantity
        from public.order_items oi where oi.order_id = v_payment.order_id group by oi.product_id order by oi.product_id
      loop
        update public.products set stock = stock + v_item.quantity, updated_at = now()
          where id = v_item.product_id and stock is not null;
        if found then
          insert into public.inventory_movements (store_id, product_id, order_id, payment_id, quantity_delta, reason)
          values (v_payment.store_id, v_item.product_id, v_payment.order_id, v_payment.id, v_item.quantity, 'released');
        end if;
      end loop;
    end if;
    select exists(select 1 from public.payments p where p.order_id = v_order.id and p.id <> v_payment.id and p.status in ('initiating', 'pending')) into v_existing_pending;
    if not v_existing_pending and v_order.status = 'pending_payment' then
      update public.orders set status = 'open', updated_at = now() where id = v_order.id;
    end if;
    return p_status;
  end if;
  if p_status <> 'succeeded' then raise exception 'unsupported payment status'; end if;
  if v_payment.status = 'succeeded' then return 'succeeded'; end if;
  if not v_payment.stock_reserved then
    select * into v_other_payment from public.payments p where p.order_id = v_order.id and p.id <> v_payment.id
      and p.status in ('initiating', 'pending') and p.stock_reserved order by p.created_at desc limit 1 for update;
    if found then
      update public.inventory_movements set payment_id = v_payment.id
        where payment_id = v_other_payment.id and reason = 'reserved';
      update public.payments set status = 'cancelled', stock_reserved = false, updated_at = now()
        where id = v_other_payment.id;
      update public.payments set stock_reserved = true where id = v_payment.id;
      v_payment.stock_reserved := true;
    end if;
  end if;
  if v_order.status in ('paid', 'paid_review') then
    if v_payment.stock_reserved then
      update public.inventory_movements set reason = 'released'
        where payment_id = v_payment.id and reason = 'reserved';
      for v_item in
        select oi.product_id, sum(oi.quantity)::integer as quantity
        from public.order_items oi where oi.order_id = v_order.id group by oi.product_id order by oi.product_id
      loop
        update public.products set stock = stock + v_item.quantity, updated_at = now()
          where id = v_item.product_id and stock is not null;
        if found then
          insert into public.inventory_movements (store_id, product_id, order_id, payment_id, quantity_delta, reason)
          values (v_payment.store_id, v_item.product_id, v_order.id, v_payment.id, v_item.quantity, 'released');
        end if;
      end loop;
    end if;
    update public.payments set status = 'duplicate_payment', transaction_id = p_transaction_id,
      payment_type = p_payment_type, stock_reserved = false, updated_at = now() where id = v_payment.id;
    return 'duplicate_payment';
  end if;

  if not v_payment.stock_reserved then
    for v_item in
      select oi.product_id, sum(oi.quantity)::integer as quantity
      from public.order_items oi where oi.order_id = v_order.id group by oi.product_id order by oi.product_id
    loop
      select * into v_product from public.products p where p.id = v_item.product_id for update;
      if v_product.stock is not null and v_product.stock < v_item.quantity then v_shortage := true; end if;
    end loop;
    if not v_shortage then
      for v_item in
        select oi.product_id, sum(oi.quantity)::integer as quantity
        from public.order_items oi where oi.order_id = v_order.id group by oi.product_id order by oi.product_id
      loop
        update public.products set stock = stock - v_item.quantity, updated_at = now()
          where id = v_item.product_id and stock is not null;
        if found then
          insert into public.inventory_movements (store_id, product_id, order_id, payment_id, quantity_delta, reason)
          values (v_order.store_id, v_item.product_id, v_order.id, v_payment.id, -v_item.quantity, 'sale');
        end if;
      end loop;
    end if;
  else
    update public.inventory_movements set reason = 'sale'
      where payment_id = v_payment.id and reason = 'reserved';
  end if;

  -- A late settlement can race with a retry. Release any still-pending attempt so
  -- one order never holds or consumes inventory twice.
  for v_other_payment in
    select * from public.payments p where p.order_id = v_order.id and p.id <> v_payment.id
      and p.status in ('initiating', 'pending') order by p.id for update
  loop
    if v_other_payment.stock_reserved then
      for v_item in
        select oi.product_id, sum(oi.quantity)::integer as quantity
        from public.order_items oi where oi.order_id = v_order.id group by oi.product_id order by oi.product_id
      loop
        update public.products set stock = stock + v_item.quantity, updated_at = now()
          where id = v_item.product_id and stock is not null;
        if found then
          insert into public.inventory_movements (store_id, product_id, order_id, payment_id, quantity_delta, reason)
          values (v_order.store_id, v_item.product_id, v_order.id, v_other_payment.id, v_item.quantity, 'released');
        end if;
      end loop;
      update public.inventory_movements set reason = 'released'
        where payment_id = v_other_payment.id and reason = 'reserved';
    end if;
    update public.payments set status = 'cancelled', stock_reserved = false, updated_at = now()
      where id = v_other_payment.id;
  end loop;

  update public.payments set status = 'succeeded', transaction_id = p_transaction_id,
    payment_type = p_payment_type, stock_reserved = false, paid_at = now(), updated_at = now() where id = v_payment.id;
  update public.orders set status = case when v_shortage then 'paid_review' else 'paid' end,
    paid_at = now(), updated_at = now() where id = v_order.id;
  if v_shortage then
    insert into public.inventory_movements (store_id, product_id, order_id, payment_id, quantity_delta, reason)
    select v_order.store_id, oi.product_id, v_order.id, v_payment.id, 0, 'paid_stock_shortage'
    from public.order_items oi join public.products p on p.id = oi.product_id
    where oi.order_id = v_order.id and p.stock is not null
    group by v_order.store_id, oi.product_id, v_order.id, v_payment.id, p.stock
    having p.stock < sum(oi.quantity);
    return 'paid_review';
  end if;
  return 'succeeded';
end;
$$;

revoke all on function public.claim_snap_payment(uuid) from public, anon;
revoke all on function public.fail_snap_payment(uuid) from public, anon;
revoke all on function public.take_cash_payment(uuid) from public, anon;
revoke all on function public.process_midtrans_notification(text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.claim_snap_payment(uuid) to authenticated;
grant execute on function public.fail_snap_payment(uuid) to authenticated;
grant execute on function public.take_cash_payment(uuid) to authenticated;
grant execute on function public.process_midtrans_notification(text, text, text, text, numeric) to service_role;
