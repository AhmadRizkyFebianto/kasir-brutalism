-- Feature 04: space bookings, dining tables, and order assignment.
create extension if not exists btree_gist;

create table if not exists public.store_spaces (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id),
  code text not null,
  name text not null,
  capacity integer not null default 1 check (capacity > 0),
  min_duration_hours integer not null default 1 check (min_duration_hours between 1 and 12),
  max_duration_hours integer not null default 8 check (max_duration_hours between min_duration_hours and 12),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, code),
  unique (product_id)
);

create table if not exists public.store_tables (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,
  label text not null,
  area text not null default 'Indoor',
  capacity integer not null default 2 check (capacity > 0),
  status text not null default 'available' check (status in ('available', 'occupied', 'closed')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, code)
);

create table if not exists public.space_reservations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  space_id uuid not null references public.store_spaces(id),
  order_id uuid,
  reserved_by uuid not null references auth.users(id),
  customer_name text,
  guest_count integer not null default 1 check (guest_count > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'held' check (status in ('held', 'reserved', 'checked_in', 'completed', 'cancelled', 'no_show')),
  hold_expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (order_id, store_id) references public.orders(id, store_id) on delete set null (order_id),
  constraint space_reservations_no_overlap exclude using gist
    (space_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    where (status in ('held', 'reserved', 'checked_in'))
);

create index if not exists store_spaces_store_active_idx on public.store_spaces (store_id, is_active, code);
create index if not exists store_tables_store_status_idx on public.store_tables (store_id, status, code);
create index if not exists reservations_store_start_idx on public.space_reservations (store_id, starts_at desc);
create index if not exists reservations_order_idx on public.space_reservations (order_id);

alter table public.store_spaces enable row level security;
alter table public.store_tables enable row level security;
alter table public.space_reservations enable row level security;

drop policy if exists "members can view active spaces" on public.store_spaces;
create policy "members can view active spaces" on public.store_spaces
  for select to authenticated using (is_active and public.is_store_member(store_id));
drop policy if exists "members can view active tables" on public.store_tables;
create policy "members can view active tables" on public.store_tables
  for select to authenticated using (is_active and public.is_store_member(store_id));
drop policy if exists "members can view reservations" on public.space_reservations;
create policy "members can view reservations" on public.space_reservations
  for select to authenticated using (public.is_store_member(store_id));
grant select on public.store_spaces, public.store_tables, public.space_reservations to authenticated;

insert into public.store_spaces (store_id, product_id, code, name, capacity, min_duration_hours, max_duration_hours)
select p.store_id, p.id, 'POD-02', p.name, 2, 1, 8 from public.products p
where p.sku = 'POD-02' on conflict (product_id) do nothing;
insert into public.store_spaces (store_id, product_id, code, name, capacity, min_duration_hours, max_duration_hours)
select p.store_id, p.id, 'VIP-A', p.name, 8, 1, 8 from public.products p
where p.sku = 'VIP-ROOM-A' on conflict (product_id) do nothing;

insert into public.store_tables (store_id, code, label, area, capacity)
select s.id, v.code, v.label, v.area, v.capacity
from public.stores s cross join (values
  ('T-04', 'Table Indoor #04', 'Indoor', 4),
  ('VIP-A', 'VIP Room A', 'Private Room', 8),
  ('POD-2', 'Focus Pod 02', 'Booth', 2),
  ('OUT-1', 'Garden #01', 'Garden', 6)
) as v(code, label, area, capacity)
where s.slug = 'kopi-space-hub'
on conflict (store_id, code) do nothing;

create or replace function public.create_space_reservation(
  p_store_id uuid,
  p_product_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_customer_name text default null,
  p_guest_count integer default 1
)
returns table (reservation_id uuid, space_code text, starts_at timestamptz, ends_at timestamptz, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_space public.store_spaces%rowtype;
  v_reservation_id uuid := gen_random_uuid();
  v_hours numeric;
begin
  if v_user_id is null or not public.is_store_member(p_store_id) then
    raise exception 'not authorized for this store' using errcode = '42501';
  end if;
  select * into v_space from public.store_spaces s
  where s.product_id = p_product_id and s.store_id = p_store_id and s.is_active for update;
  if not found then raise exception 'space is unavailable' using errcode = '22023'; end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at < now() then
    raise exception 'reservation start time must be in the future' using errcode = '22023';
  end if;
  v_hours := extract(epoch from (p_ends_at - p_starts_at)) / 3600.0;
  if v_hours <> trunc(v_hours) or v_hours < v_space.min_duration_hours or v_hours > v_space.max_duration_hours then
    raise exception 'reservation duration is outside the allowed range' using errcode = '22023';
  end if;
  if p_guest_count is null or p_guest_count < 1 or p_guest_count > v_space.capacity then
    raise exception 'guest count exceeds space capacity' using errcode = '22023';
  end if;

  update public.space_reservations r set status = 'cancelled', updated_at = now()
    where r.store_id = p_store_id and r.status = 'held' and r.hold_expires_at < now();
  insert into public.space_reservations (id, store_id, space_id, reserved_by, customer_name, guest_count, starts_at, ends_at)
  values (v_reservation_id, p_store_id, v_space.id, v_user_id, nullif(trim(p_customer_name), ''), p_guest_count, p_starts_at, p_ends_at);
  return query select v_reservation_id, v_space.code, p_starts_at, p_ends_at, now() + interval '15 minutes';
exception when exclusion_violation then
  raise exception 'space is already booked for that time' using errcode = '23P01';
end;
$$;

create or replace function public.attach_space_reservation(p_order_id uuid, p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_reservation public.space_reservations%rowtype;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_user_id is null or not public.is_store_member(v_order.store_id) then
    raise exception 'not authorized for this order' using errcode = '42501';
  end if;
  if v_order.status <> 'open' or (v_order.cashier_id <> v_user_id and not public.has_store_role(v_order.store_id, array['owner', 'admin'])) then
    raise exception 'order cannot accept a reservation' using errcode = '42501';
  end if;
  select * into v_reservation from public.space_reservations r where r.id = p_reservation_id for update;
  if not found or v_reservation.store_id <> v_order.store_id or v_reservation.reserved_by <> v_user_id
    or v_reservation.status not in ('held', 'reserved') or v_reservation.hold_expires_at < now() then
    raise exception 'reservation is unavailable or expired' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.order_items oi join public.store_spaces s on s.product_id = oi.product_id
    where oi.order_id = p_order_id and s.id = v_reservation.space_id
  ) then raise exception 'the matching space must be on the order' using errcode = '22023'; end if;
  update public.space_reservations set order_id = p_order_id, status = 'reserved', hold_expires_at = 'infinity', updated_at = now()
    where id = p_reservation_id;
end;
$$;

create or replace function public.cancel_space_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.space_reservations%rowtype;
  v_user_id uuid := auth.uid();
begin
  select * into v_reservation from public.space_reservations r where r.id = p_reservation_id for update;
  if not found or v_user_id is null or not public.is_store_member(v_reservation.store_id)
    or (v_reservation.reserved_by <> v_user_id and not public.has_store_role(v_reservation.store_id, array['owner', 'admin'])) then
    raise exception 'not authorized for this reservation' using errcode = '42501';
  end if;
  if v_reservation.order_id is not null then
    raise exception 'cancel the open order to release its reservation' using errcode = '22023';
  end if;
  if v_reservation.status <> 'held' or v_reservation.hold_expires_at < now() then
    raise exception 'reservation can no longer be cancelled' using errcode = '22023';
  end if;
  update public.space_reservations set status = 'cancelled', updated_at = now() where id = p_reservation_id;
end;
$$;

create or replace function public.assign_order_table(p_order_id uuid, p_table_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_table public.store_tables%rowtype;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_user_id is null or not public.is_store_member(v_order.store_id) then
    raise exception 'not authorized for this order' using errcode = '42501';
  end if;
  if v_order.status <> 'open' or (v_order.cashier_id <> v_user_id and not public.has_store_role(v_order.store_id, array['owner', 'admin'])) then
    raise exception 'order cannot be assigned a table' using errcode = '42501';
  end if;
  select * into v_table from public.store_tables t where t.store_id = v_order.store_id and t.code = p_table_code and t.is_active for update;
  if not found then raise exception 'table is not available' using errcode = '22023'; end if;
  if v_table.status <> 'available' and v_order.table_code is distinct from v_table.code then
    raise exception 'table is already occupied or closed' using errcode = '22023';
  end if;
  if exists (select 1 from public.orders o where o.store_id = v_order.store_id and o.table_code = v_table.code
    and o.id <> v_order.id and o.status in ('open', 'pending_payment')) then
    raise exception 'table already has an open order' using errcode = '22023';
  end if;
  if v_order.table_code is not null and v_order.table_code <> v_table.code then
    update public.store_tables set status = 'available' where store_id = v_order.store_id and code = v_order.table_code;
  end if;
  update public.orders set table_code = v_table.code, updated_at = now() where id = v_order.id;
  update public.store_tables set status = 'occupied' where id = v_table.id;
end;
$$;

-- Keep the base order RPCs private so a cashier cannot set a table_code without
-- also claiming the corresponding store_tables row. These wrappers preserve an
-- existing table code and leave table assignment to assign_order_table().
create or replace function public.create_pos_order_draft(
  p_store_id uuid, p_request_id uuid, p_items jsonb, p_customer_name text default null
)
returns table (order_id uuid, order_code text, subtotal integer, discount_amount integer,
  tax_amount integer, service_amount integer, total_amount integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query select * from public.create_pos_order(p_store_id, p_request_id, p_items, p_customer_name, null);
end;
$$;

create or replace function public.update_pos_order_draft(
  p_order_id uuid, p_items jsonb, p_customer_name text default null
)
returns table (order_id uuid, order_code text, subtotal integer, discount_amount integer,
  tax_amount integer, service_amount integer, total_amount integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table_code text;
begin
  select o.table_code into v_table_code from public.orders o where o.id = p_order_id;
  return query select * from public.update_pos_order(p_order_id, p_items, p_customer_name, v_table_code);
end;
$$;

create or replace function public.clear_order_table(p_order_id uuid)
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
  if not found or v_user_id is null or not public.is_store_member(v_order.store_id)
    or (v_order.cashier_id <> v_user_id and not public.has_store_role(v_order.store_id, array['owner', 'admin'])) then
    raise exception 'not authorized for this order' using errcode = '42501';
  end if;
  if v_order.status <> 'open' then raise exception 'table can only be cleared on an open order' using errcode = '22023'; end if;
  update public.store_tables set status = 'available' where store_id = v_order.store_id and code = v_order.table_code;
  update public.orders set table_code = null, updated_at = now() where id = v_order.id;
end;
$$;

create or replace function public.release_order_resources()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('paid', 'paid_review', 'cancelled', 'expired') and old.status is distinct from new.status then
    if new.table_code is not null then
      update public.store_tables set status = 'available'
      where store_id = new.store_id and code = new.table_code;
    end if;
    if new.status in ('paid', 'paid_review') then
      update public.space_reservations set status = 'checked_in', updated_at = now()
      where order_id = new.id and status = 'reserved';
    elsif new.status in ('cancelled', 'expired') then
      update public.space_reservations set status = 'cancelled', updated_at = now()
      where order_id = new.id and status in ('held', 'reserved');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_release_resources on public.orders;
create trigger orders_release_resources after update of status on public.orders
for each row execute function public.release_order_resources();

revoke all on function public.create_space_reservation(uuid, uuid, timestamptz, timestamptz, text, integer) from public, anon;
revoke all on function public.attach_space_reservation(uuid, uuid) from public, anon;
revoke all on function public.cancel_space_reservation(uuid) from public, anon;
revoke all on function public.assign_order_table(uuid, text) from public, anon;
revoke all on function public.clear_order_table(uuid) from public, anon;
revoke all on function public.create_pos_order(uuid, uuid, jsonb, text, text) from authenticated, anon, public;
revoke all on function public.update_pos_order(uuid, jsonb, text, text) from authenticated, anon, public;
revoke all on function public.create_pos_order_draft(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.update_pos_order_draft(uuid, jsonb, text) from public, anon;
grant execute on function public.create_space_reservation(uuid, uuid, timestamptz, timestamptz, text, integer) to authenticated;
grant execute on function public.attach_space_reservation(uuid, uuid) to authenticated;
grant execute on function public.cancel_space_reservation(uuid) to authenticated;
grant execute on function public.assign_order_table(uuid, text) to authenticated;
grant execute on function public.clear_order_table(uuid) to authenticated;
grant execute on function public.create_pos_order_draft(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.update_pos_order_draft(uuid, jsonb, text) to authenticated;
