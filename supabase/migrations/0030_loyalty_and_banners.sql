-- 0030_loyalty_and_banners.sql
--
-- Optional per-restaurant Loyalty Pass (punch-card: 10% off on the 5th visit)
-- and manager-authored promotional banners for the customer menu carousel.
--
-- Customers are anonymous, so every guest write goes through a SECURITY
-- DEFINER RPC rather than a table policy. visits_count is only ever bumped
-- by increment_loyalty_visit(), which the cart calls after a successful
-- create_order. The 10% itself is applied inside create_order so the kitchen
-- and the guest see the same bill even if the increment call is dropped.

-- ---------------------------------------------------------------------
-- restaurants.enable_loyalty_pass
-- ---------------------------------------------------------------------

alter table public.restaurants
  add column if not exists enable_loyalty_pass boolean not null default false;

comment on column public.restaurants.enable_loyalty_pass is
  'When true, the customer menu shows the Loyalty Pass banner and the 5th-visit discount can fire.';

-- Adding a 5th argument would otherwise leave the 4-arg version in place and
-- PostgREST could not tell which one a named-arg call was asking for.
drop function if exists public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean);

create function public.set_restaurant_feature_toggles(
  p_restaurant_id uuid,
  p_require_table_assignment boolean default null,
  p_enable_customer_name boolean default null,
  p_enable_customer_mobile boolean default null,
  p_enable_loyalty_pass boolean default null
)
returns void
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

  update public.restaurants
    set require_table_assignment = coalesce(p_require_table_assignment, require_table_assignment),
        enable_customer_name     = coalesce(p_enable_customer_name, enable_customer_name),
        enable_customer_mobile   = coalesce(p_enable_customer_mobile, enable_customer_mobile),
        enable_loyalty_pass      = coalesce(p_enable_loyalty_pass, enable_loyalty_pass),
        updated_at = now()
    where id = p_restaurant_id;

  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;
end;
$$;

revoke all on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- customers
--
-- Scoped per restaurant: the same mobile at two tenants is two punch cards.
-- mobile_number is unique within a restaurant so orders.customer_mobile can
-- reference it as a composite foreign key.
-- ---------------------------------------------------------------------

create table if not exists public.customers (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  name           text not null,
  mobile_number  text not null,
  visits_count   integer not null default 0 check (visits_count >= 0),
  created_at     timestamptz not null default now(),
  constraint customers_mobile_number_present check (length(btrim(mobile_number)) > 0),
  constraint customers_mobile_per_restaurant unique (restaurant_id, mobile_number)
);

comment on table public.customers is
  'Loyalty / identified guests. One row per mobile per restaurant; visits_count is the punch card.';

create index if not exists idx_customers_restaurant_id on public.customers (restaurant_id);
create index if not exists idx_customers_restaurant_mobile on public.customers (restaurant_id, mobile_number);

alter table public.customers enable row level security;

-- Staff can see their own restaurant's guests. Anon has no SELECT — the
-- guest reads their own row back through upsert_loyalty_customer /
-- get_loyalty_customer so a public key cannot enumerate the list.
drop policy if exists customers_select_staff on public.customers;
create policy customers_select_staff
  on public.customers for select
  to authenticated
  using (
    restaurant_id in (select public.auth_restaurant_ids())
    or public.auth_is_super_admin()
  );

-- Existing orders may already carry a free-text mobile. Those rows have to
-- exist in customers before the FK can go on, otherwise apply would fail.
insert into public.customers (restaurant_id, name, mobile_number)
select distinct on (o.restaurant_id, btrim(o.customer_mobile))
  o.restaurant_id,
  coalesce(nullif(btrim(o.customer_name), ''), 'Guest'),
  left(btrim(o.customer_mobile), 20)
from public.orders o
where o.customer_mobile is not null
  and btrim(o.customer_mobile) <> ''
on conflict (restaurant_id, mobile_number) do nothing;

-- Blank strings are not a real guest and would fail the FK; treat them as
-- "no mobile attached", which is what create_order already writes.
update public.orders
  set customer_mobile = null
  where customer_mobile is not null and btrim(customer_mobile) = '';

do $$ begin
  alter table public.orders
    add constraint orders_customer_mobile_fkey
    foreign key (restaurant_id, customer_mobile)
    references public.customers (restaurant_id, mobile_number)
    on update cascade
    on delete set null;
exception when duplicate_object then null; end $$;

comment on column public.orders.customer_mobile is
  'Optional guest mobile. When set, it references customers(restaurant_id, mobile_number).';

-- ---------------------------------------------------------------------
-- promotional_banners
-- ---------------------------------------------------------------------

create table if not exists public.promotional_banners (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  image_url      text not null,
  title          text not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint promotional_banners_title_present check (length(btrim(title)) > 0),
  constraint promotional_banners_image_url_present check (length(btrim(image_url)) > 0)
);

comment on table public.promotional_banners is
  'Manager-authored offer slides for the customer menu carousel.';

create index if not exists idx_promotional_banners_restaurant_active
  on public.promotional_banners (restaurant_id, is_active, created_at desc);

alter table public.promotional_banners enable row level security;

-- Active banners on an active restaurant are public — the menu carousel
-- is rendered for anonymous guests. Inactive rows stay staff-only so a
-- draft offer is not leaked by toggling the query.
drop policy if exists promotional_banners_select_public on public.promotional_banners;
create policy promotional_banners_select_public
  on public.promotional_banners for select
  to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.restaurants r
      where r.id = promotional_banners.restaurant_id
        and r.status = 'active'
    )
  );

drop policy if exists promotional_banners_select_staff on public.promotional_banners;
create policy promotional_banners_select_staff
  on public.promotional_banners for select
  to authenticated
  using (
    restaurant_id in (select public.auth_restaurant_ids())
    or public.auth_is_super_admin()
  );

drop policy if exists promotional_banners_write_owner_manager on public.promotional_banners;
create policy promotional_banners_write_owner_manager
  on public.promotional_banners for all
  to authenticated
  using (
    public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[])
    or public.auth_is_super_admin()
  )
  with check (
    public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[])
    or public.auth_is_super_admin()
  );

-- ---------------------------------------------------------------------
-- upsert_loyalty_customer: join / sign-in from the guest drawer.
-- ---------------------------------------------------------------------

create or replace function public.upsert_loyalty_customer(
  p_restaurant_id uuid,
  p_name text,
  p_mobile text
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_name text;
  v_mobile text;
  v_customer public.customers%rowtype;
begin
  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if not found or v_restaurant.status <> 'active' then
    raise exception 'Restaurant is not currently accepting guests' using errcode = 'P0003';
  end if;

  if not v_restaurant.enable_loyalty_pass then
    raise exception 'LOYALTY_DISABLED: this restaurant is not running a Loyalty Pass'
      using errcode = 'P0050';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  v_mobile := nullif(btrim(coalesce(p_mobile, '')), '');

  if v_name is null then
    raise exception 'Please enter your name' using errcode = 'P0008';
  end if;

  if v_mobile is null or length(regexp_replace(v_mobile, '\D', '', 'g')) < 7 then
    raise exception 'Please enter a valid mobile number' using errcode = 'P0009';
  end if;

  insert into public.customers (restaurant_id, name, mobile_number)
  values (p_restaurant_id, left(v_name, 80), left(v_mobile, 20))
  on conflict (restaurant_id, mobile_number)
    do update set name = excluded.name
  returning * into v_customer;

  return v_customer;
end;
$$;

revoke all on function public.upsert_loyalty_customer(uuid, text, text) from public;
grant execute on function public.upsert_loyalty_customer(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- get_loyalty_customer: refresh a locally stored session without
-- exposing the full customers table to anon SELECT.
-- ---------------------------------------------------------------------

create or replace function public.get_loyalty_customer(
  p_restaurant_id uuid,
  p_mobile text
)
returns public.customers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant public.restaurants%rowtype;
  v_mobile text;
  v_customer public.customers%rowtype;
begin
  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if not found or v_restaurant.status <> 'active' or not v_restaurant.enable_loyalty_pass then
    return null;
  end if;

  v_mobile := nullif(btrim(coalesce(p_mobile, '')), '');
  if v_mobile is null then
    return null;
  end if;

  select * into v_customer
    from public.customers
    where restaurant_id = p_restaurant_id
      and mobile_number = left(v_mobile, 20);

  if not found then
    return null;
  end if;

  return v_customer;
end;
$$;

revoke all on function public.get_loyalty_customer(uuid, text) from public;
grant execute on function public.get_loyalty_customer(uuid, text) to anon, authenticated;

alter table public.orders
  add column if not exists loyalty_visit_recorded boolean not null default false;

comment on column public.orders.loyalty_visit_recorded is
  'True once increment_loyalty_visit() punched this ticket. Stops a retried cart submit from counting twice.';

-- ---------------------------------------------------------------------
-- increment_loyalty_visit: attach the guest to the order and punch the card.
-- Idempotent per order so a retried cart submit cannot double-count.
-- ---------------------------------------------------------------------

create or replace function public.increment_loyalty_visit(
  p_order_id uuid,
  p_mobile text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_restaurant public.restaurants%rowtype;
  v_mobile text;
  v_customer public.customers%rowtype;
begin
  v_mobile := nullif(btrim(coalesce(p_mobile, '')), '');
  if v_mobile is null or length(regexp_replace(v_mobile, '\D', '', 'g')) < 7 then
    raise exception 'Please enter a valid mobile number' using errcode = 'P0009';
  end if;
  v_mobile := left(v_mobile, 20);

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0010';
  end if;

  select * into v_restaurant from public.restaurants where id = v_order.restaurant_id;
  if not found or not v_restaurant.enable_loyalty_pass then
    raise exception 'LOYALTY_DISABLED: this restaurant is not running a Loyalty Pass'
      using errcode = 'P0050';
  end if;

  select * into v_customer
    from public.customers
    where restaurant_id = v_order.restaurant_id
      and mobile_number = v_mobile
    for update;

  if not found then
    raise exception 'Loyalty guest not found' using errcode = 'P0051';
  end if;

  if v_order.loyalty_visit_recorded then
    return v_customer.visits_count;
  end if;

  -- Attach first so the FK is satisfied before we punch the card. A guest
  -- collected only through the loyalty drawer is already in customers.
  update public.orders
    set customer_mobile = v_mobile
    where id = v_order.id;

  update public.customers
    set visits_count = visits_count + 1
    where id = v_customer.id
    returning visits_count into v_customer.visits_count;

  update public.orders
    set loyalty_visit_recorded = true
    where id = v_order.id;

  return v_customer.visits_count;
end;
$$;

revoke all on function public.increment_loyalty_visit(uuid, text) from public;
grant execute on function public.increment_loyalty_visit(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- create_order: keep a loyalty mobile even when the checkout mobile
-- toggle is off, upsert the guest so the FK holds, and apply 10% when
-- this ticket is their 5th visit (visits_count = 4 as they sit down).
-- ---------------------------------------------------------------------

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
  v_order_id    uuid;
  v_subtotal    numeric(10,2) := 0;
  v_line        public.order_line_input;
  v_item        public.menu_items%rowtype;
  v_is_staff    boolean;
  v_name        text;
  v_mobile      text;
  v_customer    public.customers%rowtype;
  v_discount    numeric(10,2) := 0;
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

  v_is_staff := public.auth_has_role_in_restaurant(
    v_restaurant.id, array['owner','manager','waiter']::member_role[]
  );

  if v_restaurant.require_table_assignment and not v_is_staff and v_table.status = 'empty' then
    raise exception 'TABLE_NOT_SEATED: please ask a staff member to seat you before ordering'
      using errcode = 'P0007';
  end if;

  v_name := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_mobile := nullif(btrim(coalesce(p_customer_mobile, '')), '');

  if not v_restaurant.enable_customer_name then
    -- A loyalty join already collected a name; keep it on the ticket when
    -- the checkout field is switched off so the floor can still see who
    -- punched in.
    if not v_restaurant.enable_loyalty_pass then
      v_name := null;
    end if;
  elsif v_name is null then
    raise exception 'CUSTOMER_NAME_REQUIRED: please enter a name' using errcode = 'P0008';
  end if;

  if v_restaurant.enable_customer_mobile then
    if v_mobile is null or length(regexp_replace(v_mobile, '\D', '', 'g')) < 7 then
      raise exception 'CUSTOMER_MOBILE_REQUIRED: please enter a valid mobile number' using errcode = 'P0009';
    end if;
  elsif v_restaurant.enable_loyalty_pass then
    -- Optional: a signed-in punch-card guest. An invalid number is dropped
    -- rather than rejecting the order — they can still eat.
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

    if v_restaurant.enable_loyalty_pass and v_customer.visits_count = 4 then
      v_discount := 1; -- flag; the real amount is 10% of the subtotal below
    end if;
  end if;

  insert into public.orders (restaurant_id, table_id, status, subtotal, customer_name, customer_mobile)
  values (v_restaurant.id, v_table.id, 'placed', 0, left(v_name, 80), v_mobile)
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

  if v_discount = 1 then
    v_discount := round(v_subtotal * 0.10, 2);
  else
    v_discount := 0;
  end if;

  update public.orders
    set subtotal = v_subtotal,
        discount_amount = v_discount
    where id = v_order_id;

  if v_is_staff and v_table.status = 'empty' then
    update public.tables set status = 'dining' where id = v_table.id;
  end if;

  return v_order_id;
end;
$$;
