-- 0043_fix_waiter_approval_and_edit.sql
--
-- Bug fix: customer QR orders were reported reaching 'placed' status even
-- with require_waiter_approval on. The status branch in create_order
-- (0037) already reads correctly on inspection, but this re-asserts it
-- with a defensive coalesce (a null toggle can never silently fall through
-- to "approval off") and is the authoritative version going forward — if a
-- prior deploy had not picked up 0037 for any reason, this migration makes
-- the fix land regardless.
--
-- Feature: a waiter can now edit a held order's line items before sending
-- it on, instead of only approving or rejecting it as-is.

create or replace function public.create_order(
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
  v_loyalty     public.loyalty_settings%rowtype;
  v_order_id    uuid;
  v_subtotal    numeric(10,2) := 0;
  v_line        public.order_line_input;
  v_item        public.menu_items%rowtype;
  v_is_staff    boolean;
  v_name        text;
  v_mobile      text;
  v_customer    public.customers%rowtype;
  v_discount    numeric(10,2) := 0;
  v_loyalty_on  boolean := false;
  v_threshold   integer := 5;
  v_percent     integer := 10;
  v_apply       boolean := false;
  v_status      order_status := 'placed';
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

  select * into v_loyalty from public.loyalty_settings where restaurant_id = v_restaurant.id;
  v_loyalty_on := coalesce(v_loyalty.is_enabled, v_restaurant.enable_loyalty_pass, false);
  v_threshold := coalesce(v_loyalty.visit_threshold, 5);
  v_percent := coalesce(v_loyalty.discount_percentage, 10);

  -- v_is_staff is true only for an authenticated owner/manager/waiter of
  -- THIS restaurant (auth_has_role_in_restaurant checks auth.uid() against
  -- restaurant_members — an anonymous customer's auth.uid() is null, which
  -- never matches, so this is false for every genuine QR scan).
  v_is_staff := public.auth_has_role_in_restaurant(
    v_restaurant.id, array['owner','manager','waiter']::member_role[]
  );

  if v_restaurant.require_table_assignment and not v_is_staff and v_table.status = 'empty' then
    raise exception 'TABLE_NOT_SEATED: please ask a staff member to seat you before ordering'
      using errcode = 'P0007';
  end if;

  -- The bug fix: coalesce guards against require_waiter_approval ever being
  -- read as null (it never should be, since the column is NOT NULL, but a
  -- toggle this consequential does not get to fail open). A customer-placed
  -- order is held; a staff-placed order (waiter typing it in at the table)
  -- is not, since a human already vetted it by entering it.
  if coalesce(v_restaurant.require_waiter_approval, false) and not v_is_staff then
    v_status := 'pending_waiter_approval';
  end if;

  v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_mobile := nullif(btrim(coalesce(p_customer_mobile, '')), '');

  if not v_restaurant.enable_customer_name then
    if not v_loyalty_on then
      v_name := null;
    end if;
  elsif v_name is null then
    raise exception 'CUSTOMER_NAME_REQUIRED: please enter a name' using errcode = 'P0008';
  end if;

  if v_restaurant.enable_customer_mobile then
    if v_mobile is null or length(regexp_replace(v_mobile, '\D', '', 'g')) < 7 then
      raise exception 'CUSTOMER_MOBILE_REQUIRED: please enter a valid mobile number' using errcode = 'P0009';
    end if;
  elsif v_loyalty_on then
    if v_mobile is not null and length(regexp_replace(v_mobile, '\D', '', 'g')) < 7 then
      v_mobile := null;
    end if;
  else
    v_mobile := null;
  end if;

  if v_mobile is not null then
    v_mobile := left(v_mobile, 20);

    insert into public.customers (restaurant_id, name, mobile_number)
    values (v_restaurant.id, left(coalesce(v_name, 'Guest'), 80), v_mobile)
    on conflict (restaurant_id, mobile_number)
      do update set name = case
        when excluded.name <> 'Guest' then excluded.name
        else public.customers.name
      end
    returning * into v_customer;

    if v_loyalty_on and v_customer.visits_count = (v_threshold - 1) then
      v_apply := true;
    end if;
  end if;

  insert into public.orders (restaurant_id, table_id, status, subtotal, customer_name, customer_mobile)
  values (v_restaurant.id, v_table.id, v_status, 0, left(v_name, 80), v_mobile)
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

  if v_apply then
    v_discount := round(v_subtotal * (v_percent::numeric / 100.0), 2);
  end if;

  update public.orders
    set subtotal = v_subtotal,
        discount_amount = v_discount
    where id = v_order_id;

  -- A waiter placing an order for an empty table is seating it in the same
  -- motion, so this claims it exactly like set_table_status does. An owner
  -- or manager doing the same on someone's behalf does not — they are not
  -- the one who will be serving it.
  if v_is_staff and v_table.status = 'empty' then
    update public.tables
      set status = 'dining',
          assigned_waiter_id = case
            when public.auth_has_role_in_restaurant(v_restaurant.id, array['waiter']::member_role[])
              then coalesce(assigned_waiter_id, public.auth_member_id(v_restaurant.id))
            else assigned_waiter_id
          end
      where id = v_table.id;
  end if;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------
-- edit_and_approve_waiter_order: replaces a held order's line items with
-- p_lines, recomputes the subtotal from current trusted menu prices (never
-- from client input — same rule create_order follows), and moves the order
-- to 'placed' in the same step. Authorization mirrors approve/reject_
-- waiter_order exactly: the table's assigned waiter, any waiter if the
-- table is unassigned, or an owner/manager.
--
-- discount_amount is reset to 0 — a loyalty discount computed against the
-- pre-edit line-up no longer means anything once the lines change, and a
-- manager can always re-apply one afterward via apply_order_discount.
-- ---------------------------------------------------------------------
create or replace function public.edit_and_approve_waiter_order(
  p_order_id uuid,
  p_lines public.order_line_input[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order    public.orders%rowtype;
  v_table    public.tables%rowtype;
  v_member   uuid;
  v_manager  boolean;
  v_line     public.order_line_input;
  v_item     public.menu_items%rowtype;
  v_subtotal numeric(10,2) := 0;
begin
  if p_lines is null or array_length(p_lines, 1) is null then
    raise exception 'Order must contain at least one item' using errcode = 'P0001';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0010';
  end if;

  if v_order.status <> 'pending_waiter_approval' then
    raise exception 'Order is not awaiting approval' using errcode = 'P0052';
  end if;

  select * into v_table from public.tables where id = v_order.table_id;

  v_manager := public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(v_order.restaurant_id, array['owner','manager']::member_role[]);
  v_member := public.auth_member_id(v_order.restaurant_id);

  if not (
    v_manager
    or (v_table.assigned_waiter_id is null and public.auth_has_role_in_restaurant(v_order.restaurant_id, array['waiter']::member_role[]))
    or v_table.assigned_waiter_id = v_member
  ) then
    raise exception 'Not authorized to edit this order' using errcode = '42501';
  end if;

  delete from public.order_items where order_id = p_order_id;

  foreach v_line in array p_lines loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Invalid quantity for item %', v_line.menu_item_id using errcode = 'P0004';
    end if;

    select * into v_item
      from public.menu_items
      where id = v_line.menu_item_id
        and restaurant_id = v_order.restaurant_id;

    if not found then
      raise exception 'Menu item % does not belong to this restaurant', v_line.menu_item_id using errcode = 'P0005';
    end if;

    if not v_item.is_available then
      raise exception '% is currently unavailable', v_item.name using errcode = 'P0006';
    end if;

    insert into public.order_items (order_id, menu_item_id, item_name, unit_price, quantity, special_instructions)
    values (p_order_id, v_item.id, v_item.name, v_item.price, v_line.quantity, nullif(trim(v_line.special_instructions), ''));

    v_subtotal := v_subtotal + (v_item.price * v_line.quantity);
  end loop;

  update public.orders
    set subtotal = v_subtotal,
        discount_amount = 0,
        status = 'placed'
    where id = p_order_id;
end;
$$;

revoke all on function public.edit_and_approve_waiter_order(uuid, public.order_line_input[]) from public, anon;
grant execute on function public.edit_and_approve_waiter_order(uuid, public.order_line_input[]) to authenticated;
