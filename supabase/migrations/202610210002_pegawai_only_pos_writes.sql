-- The admin role is dashboard-only. Authenticated POS writes require an
-- employee account that owns the record; trusted server callbacks have no
-- end-user auth.uid() and continue to update payment/order state.
create or replace function public.enforce_pegawai_pos_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row jsonb;
  v_old jsonb;
  v_store_id uuid;
  v_record_user_id uuid;
begin
  if v_user_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_store_id := (v_row->>'store_id')::uuid;

  if not public.has_store_role(v_store_id, array['pegawai']) then
    raise exception 'POS writes are available to pegawai accounts only' using errcode = '42501';
  end if;

  if tg_table_name in ('orders', 'cashier_shifts') then
    v_record_user_id := (v_row->>'cashier_id')::uuid;
  elsif tg_table_name = 'space_reservations' then
    v_record_user_id := (v_row->>'reserved_by')::uuid;
  elsif tg_table_name = 'payments' then
    select o.cashier_id into v_record_user_id
    from public.orders o
    where o.id = (v_row->>'order_id')::uuid and o.store_id = v_store_id;
  end if;

  if v_record_user_id is distinct from v_user_id then
    raise exception 'pegawai may only operate their own POS records' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    if tg_table_name in ('orders', 'cashier_shifts')
      and (v_old->>'cashier_id')::uuid is distinct from v_user_id then
      raise exception 'pegawai may only update their own POS records' using errcode = '42501';
    elsif tg_table_name = 'space_reservations'
      and (v_old->>'reserved_by')::uuid is distinct from v_user_id then
      raise exception 'pegawai may only update their own reservations' using errcode = '42501';
    elsif tg_table_name = 'payments' then
      select o.cashier_id into v_record_user_id
      from public.orders o
      where o.id = (v_old->>'order_id')::uuid and o.store_id = (v_old->>'store_id')::uuid;
      if v_record_user_id is distinct from v_user_id then
        raise exception 'pegawai may only update their own payments' using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.enforce_pegawai_pos_write() from public, anon, authenticated;

drop trigger if exists orders_pegawai_write_guard on public.orders;
create trigger orders_pegawai_write_guard
before insert or update or delete on public.orders
for each row execute function public.enforce_pegawai_pos_write();

drop trigger if exists payments_pegawai_write_guard on public.payments;
create trigger payments_pegawai_write_guard
before insert or update or delete on public.payments
for each row execute function public.enforce_pegawai_pos_write();

drop trigger if exists cashier_shifts_pegawai_write_guard on public.cashier_shifts;
create trigger cashier_shifts_pegawai_write_guard
before insert or update or delete on public.cashier_shifts
for each row execute function public.enforce_pegawai_pos_write();

drop trigger if exists reservations_pegawai_write_guard on public.space_reservations;
create trigger reservations_pegawai_write_guard
before insert or update or delete on public.space_reservations
for each row execute function public.enforce_pegawai_pos_write();
