-- 0020_manager_financials.sql
-- Voids and discounts are money. Kitchen staff already have UPDATE on
-- orders (orders_update_kitchen_staff), and order_items have no UPDATE
-- policy at all — so these writes MUST go through SECURITY DEFINER RPCs
-- that re-check owner/manager (or super_admin) against the row's own
-- restaurant_id. A tampered id can only ever come back as a rejection.

create or replace function public.void_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_reason text;
begin
  v_reason := nullif(btrim(p_reason), '');
  if v_reason is null then
    raise exception 'A void reason is required' using errcode = 'P0030';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0010';
  end if;

  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(v_order.restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_order.status in ('voided', 'cancelled') then
    raise exception 'Order is already %', v_order.status using errcode = 'P0031';
  end if;

  update public.order_items
    set status = 'voided',
        void_reason = coalesce(nullif(btrim(void_reason), ''), v_reason)
    where order_id = p_order_id
      and status = 'active';

  update public.orders
    set status = 'voided',
        void_reason = v_reason
    where id = p_order_id;
end;
$$;

create or replace function public.void_order_item(p_item_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_reason text;
  v_remaining integer;
begin
  v_reason := nullif(btrim(p_reason), '');
  if v_reason is null then
    raise exception 'A void reason is required' using errcode = 'P0030';
  end if;

  select * into v_item from public.order_items where id = p_item_id;
  if not found then
    raise exception 'Order item not found' using errcode = 'P0032';
  end if;

  select * into v_order from public.orders where id = v_item.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0010';
  end if;

  select * into v_item from public.order_items where id = p_item_id for update;

  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(v_order.restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_order.status in ('voided', 'cancelled') then
    raise exception 'Order is already %', v_order.status using errcode = 'P0031';
  end if;

  if v_item.status = 'voided' then
    raise exception 'Item is already voided' using errcode = 'P0033';
  end if;

  update public.order_items
    set status = 'voided', void_reason = v_reason
    where id = p_item_id;

  -- An order-level discount cannot sit on a now-smaller bill.
  update public.orders o
    set discount_amount = least(
      o.discount_amount,
      coalesce((
        select sum(oi.unit_price * oi.quantity - oi.discount_amount)
        from public.order_items oi
        where oi.order_id = o.id and oi.status = 'active'
      ), 0)
    )
    where o.id = v_order.id;

  select count(*)::int into v_remaining
    from public.order_items
    where order_id = v_order.id and status = 'active';

  if v_remaining = 0 then
    update public.orders
      set status = 'voided',
          void_reason = coalesce(nullif(btrim(void_reason), ''), v_reason)
      where id = v_order.id;
  end if;
end;
$$;

create or replace function public.apply_order_discount(p_order_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_amount numeric(10,2);
  v_items_net numeric(10,2);
begin
  if p_amount is null then
    raise exception 'Discount amount is required' using errcode = 'P0034';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount < 0 then
    raise exception 'Discount cannot be negative' using errcode = 'P0035';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0010';
  end if;

  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(v_order.restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_order.status in ('voided', 'cancelled') then
    raise exception 'Cannot discount a % order', v_order.status using errcode = 'P0031';
  end if;

  select coalesce(sum(oi.unit_price * oi.quantity - oi.discount_amount), 0)
    into v_items_net
    from public.order_items oi
    where oi.order_id = v_order.id and oi.status = 'active';

  if v_amount > v_items_net then
    raise exception 'Discount cannot exceed the remaining order total' using errcode = 'P0036';
  end if;

  update public.orders set discount_amount = v_amount where id = v_order.id;
end;
$$;

create or replace function public.apply_order_item_discount(p_item_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_amount numeric(10,2);
  v_line numeric(10,2);
  v_items_net numeric(10,2);
begin
  if p_amount is null then
    raise exception 'Discount amount is required' using errcode = 'P0034';
  end if;
  v_amount := round(p_amount, 2);
  if v_amount < 0 then
    raise exception 'Discount cannot be negative' using errcode = 'P0035';
  end if;

  select * into v_item from public.order_items where id = p_item_id;
  if not found then
    raise exception 'Order item not found' using errcode = 'P0032';
  end if;

  select * into v_order from public.orders where id = v_item.order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0010';
  end if;

  select * into v_item from public.order_items where id = p_item_id for update;

  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(v_order.restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_order.status in ('voided', 'cancelled') then
    raise exception 'Cannot discount a % order', v_order.status using errcode = 'P0031';
  end if;

  if v_item.status = 'voided' then
    raise exception 'Cannot discount a voided item' using errcode = 'P0033';
  end if;

  v_line := v_item.unit_price * v_item.quantity;
  if v_amount > v_line then
    raise exception 'Discount cannot exceed the item total' using errcode = 'P0036';
  end if;

  update public.order_items set discount_amount = v_amount where id = p_item_id;

  select coalesce(sum(oi.unit_price * oi.quantity - oi.discount_amount), 0)
    into v_items_net
    from public.order_items oi
    where oi.order_id = v_order.id and oi.status = 'active';

  if v_order.discount_amount > v_items_net then
    update public.orders set discount_amount = v_items_net where id = v_order.id;
  end if;
end;
$$;

revoke all on function public.void_order(uuid, text) from public, anon;
revoke all on function public.void_order_item(uuid, text) from public, anon;
revoke all on function public.apply_order_discount(uuid, numeric) from public, anon;
revoke all on function public.apply_order_item_discount(uuid, numeric) from public, anon;

grant execute on function public.void_order(uuid, text) to authenticated;
grant execute on function public.void_order_item(uuid, text) to authenticated;
grant execute on function public.apply_order_discount(uuid, numeric) to authenticated;
grant execute on function public.apply_order_item_discount(uuid, numeric) to authenticated;

-- Helper used by stats. Not granted to clients; it only exists so the
-- revenue query stays one definition instead of two copied subselects.
create or replace function public.order_net_total(p_order_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((
      select sum(oi.unit_price * oi.quantity - oi.discount_amount)
      from public.order_items oi
      where oi.order_id = p_order_id and oi.status = 'active'
    ), 0)
    - coalesce((select discount_amount from public.orders where id = p_order_id), 0),
    0
  );
$$;

revoke all on function public.order_net_total(uuid) from public, anon, authenticated;

-- Revenue should not count cancelled/voided tickets, and should net out
-- both item-level and order-level discounts.
create or replace function public.get_restaurant_stats(p_restaurant_id uuid)
returns table (
  total_orders integer,
  today_orders integer,
  total_revenue numeric,
  today_revenue numeric,
  table_count integer,
  active_table_count integer,
  staff_count integer,
  pending_service_requests integer,
  preparing_orders integer,
  ready_orders integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id),
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id and created_at >= date_trunc('day', now())),
    (
      select coalesce(sum(public.order_net_total(o.id)), 0)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.status not in ('cancelled', 'voided')
    ),
    (
      select coalesce(sum(public.order_net_total(o.id)), 0)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.status not in ('cancelled', 'voided')
        and o.created_at >= date_trunc('day', now())
    ),
    (select count(*)::int from public.tables where restaurant_id = p_restaurant_id),
    (select count(*)::int from public.tables where restaurant_id = p_restaurant_id and is_active),
    (select count(*)::int from public.restaurant_members where restaurant_id = p_restaurant_id and is_active),
    (select count(*)::int from public.service_requests where restaurant_id = p_restaurant_id and status = 'pending'),
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id and status = 'preparing'),
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id and status = 'ready');
end;
$$;

grant execute on function public.get_restaurant_stats(uuid) to authenticated;
