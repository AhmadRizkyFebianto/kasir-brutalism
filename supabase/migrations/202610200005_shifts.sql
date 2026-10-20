-- Feature 05: cashier shifts and cash reconciliation.
create table if not exists public.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cashier_id uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash integer not null check (opening_cash >= 0),
  cash_sales integer not null default 0 check (cash_sales >= 0),
  other_sales integer not null default 0 check (other_sales >= 0),
  counted_cash integer check (counted_cash is null or counted_cash >= 0),
  cash_difference integer,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  check ((status = 'open' and closed_at is null and counted_cash is null) or (status = 'closed' and closed_at is not null and counted_cash is not null))
);

create unique index if not exists cashier_shifts_one_open_per_cashier
  on public.cashier_shifts (store_id, cashier_id) where status = 'open';
create index if not exists cashier_shifts_store_opened_idx
  on public.cashier_shifts (store_id, opened_at desc);

alter table public.payments add column if not exists shift_id uuid references public.cashier_shifts(id);
create index if not exists payments_shift_idx on public.payments (shift_id, status, paid_at);

alter table public.cashier_shifts enable row level security;
drop policy if exists "members can view cashier shifts" on public.cashier_shifts;
create policy "members can view cashier shifts" on public.cashier_shifts
  for select to authenticated using (public.is_store_member(store_id));
grant select on public.cashier_shifts to authenticated;

create or replace function public.link_payment_to_cashier_shift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shift_id is null and auth.uid() is not null then
    select s.id into new.shift_id from public.cashier_shifts s
    where s.store_id = new.store_id and s.cashier_id = auth.uid() and s.status = 'open'
    for update;
    if new.shift_id is null then
      raise exception 'open a cashier shift before taking payment' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_link_cashier_shift on public.payments;
create trigger payments_link_cashier_shift before insert on public.payments
for each row execute function public.link_payment_to_cashier_shift();

create or replace function public.open_cashier_shift(p_store_id uuid, p_opening_cash integer)
returns public.cashier_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.cashier_shifts%rowtype;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_store_member(p_store_id) or p_opening_cash is null or p_opening_cash < 0 then
    raise exception 'valid store membership and opening cash are required' using errcode = '42501';
  end if;
  if not public.has_store_role(p_store_id, array['owner', 'admin', 'cashier']) then
    raise exception 'not authorized for this store' using errcode = '42501';
  end if;
  insert into public.cashier_shifts (store_id, cashier_id, opening_cash)
  values (p_store_id, v_user_id, p_opening_cash) returning * into v_shift;
  return v_shift;
exception when unique_violation then
  raise exception 'a shift is already open for this cashier' using errcode = '23505';
end;
$$;

create or replace function public.close_cashier_shift(p_shift_id uuid, p_counted_cash integer)
returns table (shift_id uuid, cash_sales integer, other_sales integer, expected_cash integer, counted_cash integer, cash_difference integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.cashier_shifts%rowtype;
  v_cash integer;
  v_other integer;
  v_user_id uuid := auth.uid();
begin
  select * into v_shift from public.cashier_shifts s where s.id = p_shift_id for update;
  if not found or v_user_id is null or not public.is_store_member(v_shift.store_id)
    or (v_shift.cashier_id <> v_user_id and not public.has_store_role(v_shift.store_id, array['owner', 'admin'])) then
    raise exception 'not authorized for this shift' using errcode = '42501';
  end if;
  if v_shift.status <> 'open' then raise exception 'shift is already closed' using errcode = '22023'; end if;
  if p_counted_cash is null or p_counted_cash < 0 then raise exception 'counted cash must be zero or greater' using errcode = '22023'; end if;

  select coalesce(sum(p.amount) filter (where p.payment_type = 'cash'), 0)::integer,
         coalesce(sum(p.amount) filter (where p.payment_type is distinct from 'cash'), 0)::integer
    into v_cash, v_other
  from public.payments p where p.shift_id = p_shift_id and p.status = 'succeeded';

  update public.cashier_shifts s set closed_at = now(), cash_sales = v_cash, other_sales = v_other,
    counted_cash = p_counted_cash, cash_difference = p_counted_cash - (s.opening_cash + v_cash), status = 'closed'
  where s.id = p_shift_id;
  return query select p_shift_id, v_cash, v_other, v_shift.opening_cash + v_cash, p_counted_cash,
    p_counted_cash - (v_shift.opening_cash + v_cash);
end;
$$;

revoke all on function public.link_payment_to_cashier_shift() from public, anon, authenticated;
revoke all on function public.open_cashier_shift(uuid, integer) from public, anon;
revoke all on function public.close_cashier_shift(uuid, integer) from public, anon;
grant execute on function public.open_cashier_shift(uuid, integer) to authenticated;
grant execute on function public.close_cashier_shift(uuid, integer) to authenticated;
