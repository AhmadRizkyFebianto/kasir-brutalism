-- Feature 01: tenant-safe authentication memberships and POS catalog.
create extension if not exists pgcrypto;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Asia/Jakarta',
  created_at timestamptz not null default now()
);

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'cashier')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sku text,
  name text not null,
  category text not null default 'Lainnya',
  kind text not null default 'product' check (kind in ('product', 'space')),
  price integer not null check (price >= 0),
  stock integer check (stock is null or stock >= 0),
  image_url text,
  tag text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, sku)
);

create index if not exists products_store_active_idx on public.products (store_id, is_active, name);
create index if not exists store_members_user_idx on public.store_members (user_id, store_id);

create or replace function public.is_store_member(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = target_store_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_store_role(target_store_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = target_store_id and m.user_id = (select auth.uid()) and m.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_store_member(uuid) from public;
revoke all on function public.has_store_role(uuid, text[]) from public;
grant execute on function public.is_store_member(uuid) to authenticated;
grant execute on function public.has_store_role(uuid, text[]) to authenticated;

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.products enable row level security;

drop policy if exists "members can view their stores" on public.stores;
create policy "members can view their stores" on public.stores
  for select to authenticated using (public.is_store_member(id));

drop policy if exists "members can view their own memberships" on public.store_members;
create policy "members can view their own memberships" on public.store_members
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "members can view active catalog" on public.products;
create policy "members can view active catalog" on public.products
  for select to authenticated using (is_active and public.is_store_member(store_id));

drop policy if exists "admins can manage catalog" on public.products;
create policy "admins can manage catalog" on public.products
  for all to authenticated using (public.has_store_role(store_id, array['owner', 'admin']))
  with check (public.has_store_role(store_id, array['owner', 'admin']));

grant select on public.stores, public.store_members, public.products to authenticated;
grant insert, update, delete on public.products to authenticated;

-- Starter data: safe to remove after the store's own catalog is loaded.
insert into public.stores (id, name, slug, timezone)
values ('10000000-0000-4000-8000-000000000001', 'Kopi & Space Hub', 'kopi-space-hub', 'Asia/Jakarta')
on conflict (slug) do nothing;

insert into public.products (store_id, sku, name, category, kind, price, stock, image_url, tag)
select s.id, v.sku, v.name, v.category, v.kind, v.price, v.stock, v.image_url, v.tag
from (values
  ('KOPI-AREN', 'Kopi Susu Gula Aren Hub', 'Kopi • Dingin', 'product', 22000, 48, 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=700&q=85', 'BESTSELLER'),
  ('V60-FLORES', 'Filter V60 Flores Bajawa', 'Single Origin • V60', 'product', 35000, 12, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=700&q=85', null),
  ('POD-02', 'Private Focus Pod 02', 'Sewa per jam • Spot #POD-02', 'space', 50000, null, 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=700&q=85', 'TERSEDIA'),
  ('VIP-ROOM-A', 'VIP Creative Room A', 'Hingga 15:30 • Reservasi', 'space', 150000, null, 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=700&q=85', 'TERPAKAI'),
  ('CROISSANT-TRUFFLE', 'Truffle Cheese Croissant', 'Bakery • Fresh Oven', 'product', 38000, 8, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=700&q=85', null),
  ('MATCHA-UJI', 'Kyoto Uji Matcha Latte', 'Non-coffee • Oat Milk', 'product', 39000, 24, 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=700&q=85', null),
  ('KOPI-PANDAN', 'Es Kopi Pandan', 'Kopi • Dingin', 'product', 27000, 18, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=700&q=85', 'BARU'),
  ('BANANA-BREAD', 'Banana Bread', 'Snack • Pastry', 'product', 28000, 10, 'https://images.unsplash.com/photo-1606101273945-e9eba6fad8f7?auto=format&fit=crop&w=700&q=85', null)
) as v(sku, name, category, kind, price, stock, image_url, tag)
cross join public.stores s
where s.slug = 'kopi-space-hub'
on conflict (store_id, sku) do nothing;

-- After creating a Supabase Auth user, grant store access explicitly as an owner:
-- insert into public.store_members (store_id, user_id, role)
-- select id, '<AUTH_USER_UUID>', 'owner' from public.stores where slug = 'kopi-space-hub';
