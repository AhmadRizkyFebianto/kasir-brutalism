-- Consolidate application access into two roles and keep staff display names
-- alongside each store membership. Legacy role values are converted in place.
alter table public.store_members
  add column if not exists display_name text not null default '';

alter table public.store_members
  drop constraint if exists store_members_role_check;

update public.store_members
set role = case role
  when 'owner' then 'admin'
  when 'cashier' then 'pegawai'
  else role
end
where role in ('owner', 'cashier');

alter table public.store_members
  add constraint store_members_role_check check (role in ('admin', 'pegawai'));

-- Translate legacy function arguments so already-installed RPCs keep their
-- original access behavior after the role values have been migrated.
create or replace function public.has_store_role(target_store_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_members m
    where m.store_id = target_store_id
      and m.user_id = (select auth.uid())
      and m.role = any (
        array(
          select case requested.role
            when 'owner' then 'admin'
            when 'admin' then 'admin'
            when 'cashier' then 'pegawai'
            else requested.role
          end
          from unnest(allowed_roles) as requested(role)
        )
      )
  );
$$;

revoke all on function public.has_store_role(uuid, text[]) from public;
grant execute on function public.has_store_role(uuid, text[]) to authenticated;

drop policy if exists "admins can view store memberships" on public.store_members;
create policy "admins can view store memberships" on public.store_members
  for select to authenticated
  using (public.has_store_role(store_id, array['admin']));

drop policy if exists "admins and cashiers can view inventory history" on public.inventory_movements;
drop policy if exists "admins and employees can view inventory history" on public.inventory_movements;
create policy "admins and employees can view inventory history" on public.inventory_movements
  for select to authenticated using (public.is_store_member(store_id));
