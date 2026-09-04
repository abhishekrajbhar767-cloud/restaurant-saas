-- 0027_order_customer_details.sql
--
-- Wires the 0026 feature toggles into order creation, and gives orders
-- somewhere to keep the customer's details.
--
-- IMPORTANT — require_table_assignment changes meaning here. In 0026 it was
-- read as "an order must carry a table_id", which is already true for every
-- row, so it shipped defaulting to true. It now means the stricter "the
-- table must actually be seated before an order is accepted", which exists
-- to stop someone photographing a QR code and ordering from home. Left at
-- true, applying this migration would instantly reject the first order at
-- every table nobody had marked as dining yet. Nothing reads the column
-- yet, so the default is corrected to false and existing rows are reset:
-- a restaurant now opts in to the strict rule deliberately.

alter table public.restaurants
  alter column require_table_assignment set default false;

update public.restaurants set require_table_assignment = false;

alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_mobile text;

-- The old two-argument signature is dropped rather than overloaded: with
-- both versions present PostgREST cannot tell which one a two-argument call
-- from the customer cart is asking for.
drop function if exists public.create_order(uuid, public.order_line_input[]);

create function public.create_order(
  p_qr_token uuid,
  p_lines public.order_line_input[],
  p_customer_name text default null,
  p_customer_mobile text default null
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
  v_is_staff    boolean;
  v_name        text;
  v_mobile      text;
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

  -- anon callers have no auth.uid(), so this is false for every QR customer.
  v_is_staff := public.auth_has_role_in_restaurant(
    v_restaurant.id, array['owner','manager','waiter']::member_role[]
  );

  -- The seating rule only defends against remote ordering, which is not a
  -- thing a signed-in waiter standing at the table can be doing.
  if v_restaurant.require_table_assignment and not v_is_staff and v_table.status = 'empty' then
    raise exception 'TABLE_NOT_SEATED: please ask a staff member to seat you before ordering'
      using errcode = 'P0007';
  end if;

  v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_mobile := nullif(btrim(coalesce(p_customer_mobile, '')), '');

  -- A detail that is switched off is discarded rather than stored, so
  -- turning a field off stops collecting it even if a stale client keeps
  -- sending one.
  if not v_restaurant.enable_customer_name then
    v_name := null;
  elsif v_name is null then
    raise exception 'CUSTOMER_NAME_REQUIRED: please enter a name' using errcode = 'P0008';
  end if;

  if not v_restaurant.enable_customer_mobile then
    v_mobile := null;
  elsif v_mobile is null or length(regexp_replace(v_mobile, '\D', '', 'g')) < 7 then
    raise exception 'CUSTOMER_MOBILE_REQUIRED: please enter a valid mobile number' using errcode = 'P0009';
  end if;

  insert into public.orders (restaurant_id, table_id, status, subtotal, customer_name, customer_mobile)
  values (v_restaurant.id, v_table.id, 'placed', 0, left(v_name, 80), left(v_mobile, 20))
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

  -- Staff punching in an order at an empty table is itself proof that the
  -- table is occupied. Doing it here also starts the turnaround clock the
  -- same way seating it by hand on the live map would, and it is the only
  -- way a waiter can move table status at all — tables_write_owner_manager
  -- excludes them.
  if v_is_staff and v_table.status = 'empty' then
    update public.tables set status = 'dining' where id = v_table.id;
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.create_order(uuid, public.order_line_input[], text, text) from public;
grant execute on function public.create_order(uuid, public.order_line_input[], text, text) to anon, authenticated;
