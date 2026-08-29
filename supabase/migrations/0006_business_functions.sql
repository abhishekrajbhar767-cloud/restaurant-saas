-- 0006_business_functions.sql
-- Critical business rules live here as SECURITY DEFINER functions so the
-- database — not the client, not even the Next.js server — is the single
-- source of truth for prices, totals, and concurrency-sensitive transitions.

-- ---------------------------------------------------------------------
-- create_order: resolves table by qr_token, verifies it belongs to an
-- active restaurant, fetches CURRENT trusted prices/availability for each
-- item server-side, computes the total, and inserts order + order_items
-- (with name/price snapshots) atomically. Client sends only item ids +
-- quantities + optional notes — never a price or a total.
-- ---------------------------------------------------------------------
create type public.order_line_input as (
  menu_item_id uuid,
  quantity integer,
  special_instructions text
);

create or replace function public.create_order(
  p_qr_token uuid,
  p_lines public.order_line_input[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table       public.tables%rowtype;
  v_restaurant  public.restaurants%rowtype;
  v_order_id    uuid;
  v_subtotal    numeric(10,2) := 0;
  v_line        public.order_line_input;
  v_item        public.menu_items%rowtype;
begin
  if p_lines is null or array_length(p_lines, 1) is null then
    raise exception 'Order must contain at least one item' using errcode = 'P0001';
  end if;

  select * into v_table from public.tables where qr_token = p_qr_token and is_active;
  if not found then
    raise exception 'Invalid or inactive table' using errcode = 'P0002';
  end if;

  select * into v_restaurant from public.restaurants where id = v_table.restaurant_id;
  if not found or v_restaurant.status <> 'active' then
    raise exception 'Restaurant is not currently accepting orders' using errcode = 'P0003';
  end if;

  insert into public.orders (restaurant_id, table_id, status, subtotal)
  values (v_restaurant.id, v_table.id, 'placed', 0)
  returning id into v_order_id;

  foreach v_line in array p_lines loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Invalid quantity for item %', v_line.menu_item_id using errcode = 'P0004';
    end if;

    select * into v_item
      from public.menu_items
      where id = v_line.menu_item_id
        and restaurant_id = v_restaurant.id;

    if not found then
      raise exception 'Menu item % does not belong to this restaurant', v_line.menu_item_id using errcode = 'P0005';
    end if;

    if not v_item.is_available then
      raise exception '% is currently unavailable', v_item.name using errcode = 'P0006';
    end if;

    insert into public.order_items (order_id, menu_item_id, item_name, unit_price, quantity, special_instructions)
    values (v_order_id, v_item.id, v_item.name, v_item.price, v_line.quantity, nullif(trim(v_line.special_instructions), ''));

    v_subtotal := v_subtotal + (v_item.price * v_line.quantity);
  end loop;

  update public.orders set subtotal = v_subtotal where id = v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.create_order(uuid, public.order_line_input[]) from public;
grant execute on function public.create_order(uuid, public.order_line_input[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- kitchen_accept_order: placed -> accepted, sets estimated_minutes.
-- Only callable by kitchen/manager/owner staff of that restaurant (RLS on
-- orders already restricts UPDATE, but this function also re-checks the
-- state machine so no arbitrary transition is possible even via RPC).
-- ---------------------------------------------------------------------
create or replace function public.kitchen_accept_order(p_order_id uuid, p_estimated_minutes integer)
returns void
language plpgsql
security invoker -- runs as the calling user so orders_update_kitchen_staff RLS applies
set search_path = public
as $$
declare
  v_status order_status;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0010';
  end if;
  if v_status <> 'placed' then
    raise exception 'Order cannot be accepted from status %', v_status using errcode = 'P0011';
  end if;
  if p_estimated_minutes is null or p_estimated_minutes <= 0 then
    raise exception 'estimated_minutes must be positive' using errcode = 'P0012';
  end if;

  update public.orders
    set status = 'accepted', estimated_minutes = p_estimated_minutes, accepted_at = now()
    where id = p_order_id;
end;
$$;

grant execute on function public.kitchen_accept_order(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- update_order_status: enforces the valid state machine for the
-- remaining transitions (preparing, ready, served, cancelled).
-- ---------------------------------------------------------------------
create or replace function public.update_order_status(p_order_id uuid, p_new_status order_status, p_cancellation_reason text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
  v_valid boolean := false;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0010';
  end if;

  v_valid := (v_status, p_new_status) in (
    ('accepted', 'preparing'),
    ('preparing', 'ready'),
    ('ready', 'served'),
    ('placed', 'cancelled'),
    ('accepted', 'cancelled'),
    ('preparing', 'cancelled')
  );

  if not v_valid then
    raise exception 'Invalid transition from % to %', v_status, p_new_status using errcode = 'P0013';
  end if;

  update public.orders set
    status = p_new_status,
    preparing_at = case when p_new_status = 'preparing' then now() else preparing_at end,
    ready_at = case when p_new_status = 'ready' then now() else ready_at end,
    served_at = case when p_new_status = 'served' then now() else served_at end,
    cancelled_at = case when p_new_status = 'cancelled' then now() else cancelled_at end,
    cancellation_reason = case when p_new_status = 'cancelled' then p_cancellation_reason else cancellation_reason end
  where id = p_order_id;
end;
$$;

grant execute on function public.update_order_status(uuid, order_status, text) to authenticated;

-- ---------------------------------------------------------------------
-- create_service_request: anonymous customers call this (not a raw
-- INSERT) so we can enforce "no duplicate pending request of same type
-- for the same table" atomically.
-- ---------------------------------------------------------------------
create or replace function public.create_service_request(p_qr_token uuid, p_type service_request_type)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.tables%rowtype;
  v_restaurant_status restaurant_status;
  v_existing uuid;
  v_id uuid;
begin
  select * into v_table from public.tables where qr_token = p_qr_token and is_active;
  if not found then
    raise exception 'Invalid or inactive table' using errcode = 'P0002';
  end if;

  select status into v_restaurant_status from public.restaurants where id = v_table.restaurant_id;
  if v_restaurant_status <> 'active' then
    raise exception 'Restaurant is not currently active' using errcode = 'P0003';
  end if;

  select id into v_existing from public.service_requests
    where table_id = v_table.id and type = p_type and status in ('pending', 'claimed')
    limit 1;
  if found then
    return v_existing; -- idempotent: return the existing request instead of erroring
  end if;

  insert into public.service_requests (restaurant_id, table_id, type, status)
  values (v_table.restaurant_id, v_table.id, p_type, 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_service_request(uuid, service_request_type) to anon, authenticated;

-- ---------------------------------------------------------------------
-- claim_service_request: THE atomic claim (section 16). Uses a
-- conditional UPDATE — "pending -> claimed only if still pending" — so
-- concurrent claims from multiple waiters race at the database row-lock
-- level, not in application code. Exactly one caller gets rows_affected = 1.
-- ---------------------------------------------------------------------
create or replace function public.claim_service_request(p_request_id uuid)
returns boolean
language plpgsql
security invoker -- RLS (service_requests_update_waiter_staff) must apply
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_member_id uuid;
  v_rows integer;
begin
  select restaurant_id into v_restaurant_id from public.service_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0020';
  end if;

  v_member_id := public.auth_member_id(v_restaurant_id);
  if v_member_id is null then
    raise exception 'Not an active staff member of this restaurant' using errcode = 'P0021';
  end if;

  update public.service_requests
    set status = 'claimed', claimed_by = v_member_id, claimed_at = now()
    where id = p_request_id
      and status = 'pending'; -- <-- the atomic guard; only succeeds for the first caller

  get diagnostics v_rows = row_count;

  if v_rows = 1 then
    update public.waiter_status set availability = 'busy', updated_at = now() where member_id = v_member_id;
  end if;

  return v_rows = 1; -- false means "already claimed" — caller shows that message
end;
$$;

grant execute on function public.claim_service_request(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- resolve_service_request: claimed -> resolved, frees the waiter.
-- ---------------------------------------------------------------------
create or replace function public.resolve_service_request(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status service_request_status;
  v_claimed_by uuid;
begin
  select status, claimed_by into v_status, v_claimed_by from public.service_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0020';
  end if;
  if v_status <> 'claimed' then
    raise exception 'Request must be claimed before it can be resolved' using errcode = 'P0022';
  end if;

  update public.service_requests set status = 'resolved', resolved_at = now() where id = p_request_id;

  if v_claimed_by is not null then
    update public.waiter_status set availability = 'free', updated_at = now() where member_id = v_claimed_by;
  end if;
end;
$$;

grant execute on function public.resolve_service_request(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- set_waiter_availability: manual FREE/BUSY/OFFLINE toggle.
-- ---------------------------------------------------------------------
create or replace function public.set_waiter_availability(p_restaurant_id uuid, p_availability waiter_availability)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  v_member_id := public.auth_member_id(p_restaurant_id);
  if v_member_id is null then
    raise exception 'Not an active staff member of this restaurant' using errcode = 'P0021';
  end if;

  insert into public.waiter_status (member_id, restaurant_id, availability, updated_at)
  values (v_member_id, p_restaurant_id, p_availability, now())
  on conflict (member_id) do update set availability = excluded.availability, updated_at = now();
end;
$$;

grant execute on function public.set_waiter_availability(uuid, waiter_availability) to authenticated;
