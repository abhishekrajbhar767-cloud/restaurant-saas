-- 0028_waiter_table_status.sql
--
-- Waiters work the floor, so seating and clearing tables belongs to them —
-- but tables_write_owner_manager keeps them out of public.tables entirely,
-- and until now the only status change a waiter could cause was the implicit
-- 'dining' that create_order writes when they punch in an order. Widening
-- that policy would also hand them table_number, is_active and qr_token, so
-- this goes through a SECURITY DEFINER RPC that can only touch the one column
-- that belongs to service.
--
-- Nothing else has to change to make a cleared table lock the QR menu again:
-- create_order re-reads tables.status on every call, so the seating check
-- (for restaurants with require_table_assignment on) follows this write, and
-- trg_track_table_session closes the table_sessions row and clears
-- occupied_since so turnaround reporting stays honest.

create or replace function public.set_table_status(p_table_id uuid, p_status table_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  select restaurant_id into v_restaurant_id
  from public.tables
  where id = p_table_id and is_active;

  if not found then
    raise exception 'Invalid or inactive table' using errcode = 'P0002';
  end if;

  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(
         v_restaurant_id,
         array['owner','manager','waiter']::member_role[]
       )
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- A write that lands on the status the table already has is dropped rather
  -- than sent: it would cost every realtime subscriber a payload for nothing,
  -- and two waiters clearing the same table would otherwise race for the
  -- open table_sessions row.
  update public.tables
    set status = p_status
    where id = p_table_id and status <> p_status;
end;
$$;

revoke all on function public.set_table_status(uuid, table_status) from public, anon;
grant execute on function public.set_table_status(uuid, table_status) to authenticated;
