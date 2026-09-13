-- Phase 4: consumption is separate from the kitchen status transaction.
alter table public.orders
  add column if not exists inventory_deducted boolean not null default false;

create or replace function public.deduct_order_inventory(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_member_id uuid;
  v_enabled boolean;
  v_deduction record;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  select id into v_member_id from public.restaurant_members
  where restaurant_id = v_order.restaurant_id and user_id = auth.uid()
    and is_active and role in ('owner', 'manager', 'kitchen')
  order by id limit 1;
  if v_member_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Disabled calls exit without touching stock, logs, or the deduction marker.
  select inventory_tracking_enabled and recipe_auto_deduct_enabled into v_enabled
  from public.restaurants where id = v_order.restaurant_id for share;
  if v_enabled is distinct from true then return; end if;

  -- The order lock serializes all attempts, including requests from other devices.
  select * into v_order from public.orders
  where id = p_order_id and restaurant_id = v_order.restaurant_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if v_order.inventory_deducted then return; end if;
  if v_order.status not in ('preparing', 'ready', 'served') then return; end if;
  if v_order.auto_closed_at is not null then return; end if;

  -- Recipe saves lock their menu item, so this keeps mappings stable during deduction.
  perform m.id from public.menu_items m
  where m.restaurant_id = v_order.restaurant_id and m.id in (
    select oi.menu_item_id from public.order_items oi
    where oi.order_id = p_order_id and oi.status = 'active'
  ) order by m.id for share;

  -- Reject malformed legacy mappings rather than recording a partial deduction as complete.
  if exists (
    select 1 from public.order_items oi
    join public.menu_item_recipes r on r.menu_item_id = oi.menu_item_id
    join public.inventory_items i on i.id = r.inventory_item_id
    join public.menu_items m on m.id = oi.menu_item_id
    where oi.order_id = p_order_id and oi.status = 'active'
      and (r.restaurant_id <> v_order.restaurant_id or i.restaurant_id <> v_order.restaurant_id
        or m.restaurant_id <> v_order.restaurant_id or r.quantity_required <= 0
        or r.quantity_required > 999999999.999)
  ) then
    raise exception 'Invalid recipe mapping for this restaurant' using errcode = '22023';
  end if;

  -- One update/log per ingredient, even when it occurs in several dishes or order lines.
  -- Stable lock ordering prevents two orders with shared ingredients locking them in reverse.
  for v_deduction in
    select r.inventory_item_id, sum(r.quantity_required * oi.quantity) as quantity
    from public.order_items oi
    join public.menu_item_recipes r on r.menu_item_id = oi.menu_item_id
    where oi.order_id = p_order_id and oi.status = 'active'
      and r.restaurant_id = v_order.restaurant_id
    group by r.inventory_item_id
    order by r.inventory_item_id
  loop
    update public.inventory_items
    set current_stock = current_stock - v_deduction.quantity, updated_at = now()
    where id = v_deduction.inventory_item_id and restaurant_id = v_order.restaurant_id;
    if not found then
      raise exception 'Recipe ingredient no longer available' using errcode = 'P0002';
    end if;
    -- Negative balances are intentional: service continues and the shortage stays visible.
    insert into public.inventory_logs
      (restaurant_id, inventory_item_id, change_type, quantity, notes, performed_by)
    values
      (v_order.restaurant_id, v_deduction.inventory_item_id, 'auto_deduct',
       -v_deduction.quantity, 'Order #' || v_order.order_number, v_member_id);
  end loop;

  -- No mappings is a successful no-op; later recipe edits must not retroactively consume stock.
  -- A failure anywhere above rolls back every stock update, audit row, and this flag.
  update public.orders set inventory_deducted = true where id = p_order_id;
end;
$$;

revoke all on function public.deduct_order_inventory(uuid) from public, anon;
grant execute on function public.deduct_order_inventory(uuid) to authenticated;

create or replace function public.get_low_stock_count(p_restaurant_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.restaurants where id = p_restaurant_id and inventory_tracking_enabled
  ) then return 0; end if;
  -- inventory_items has no active/archive column; every existing raw ingredient counts.
  return (select count(*)::integer from public.inventory_items
    where restaurant_id = p_restaurant_id and current_stock <= min_alert_limit);
end;
$$;

revoke all on function public.get_low_stock_count(uuid) from public, anon;
grant execute on function public.get_low_stock_count(uuid) to authenticated;

-- Keep staff stock indicators and long-running kitchen toggle state up to date.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.inventory_items;
    exception when duplicate_object then null; end;
    begin
      alter publication supabase_realtime add table public.restaurants;
    exception when duplicate_object then null; end;
  end if;
end $$;
alter table public.inventory_items replica identity full;
