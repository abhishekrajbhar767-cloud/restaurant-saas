-- 0031_loyalty_settings_and_media.sql
--
-- Turns the 0030 punch-card (hardcoded 10% on the 5th visit, URL-pasted
-- banners) into a manager-configurable Loyalty Pass plus a storage-backed
-- banner library.
--
-- restaurant_media is a public-read bucket so the customer menu can render
-- banners without auth. Writes are scoped to that restaurant's owner/manager
-- via the same path convention as menu-images: restaurant_media/<restaurant_id>/…
--
-- Loyalty knobs live on loyalty_settings (one row per restaurant).
-- restaurants.enable_loyalty_pass stays as a denormalized switch so existing
-- reads keep working; a SECURITY DEFINER trigger keeps the two in sync.

-- ---------------------------------------------------------------------
-- storage.buckets.restaurant_media
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('restaurant_media', 'restaurant_media', true)
on conflict (id) do update
  set public = true;

-- Newer Supabase versions expose these columns. Skip quietly on older ones
-- so this migration still applies; the app already compresses to < 300KB.
do $$ begin
  update storage.buckets
    set file_size_limit = 307200,
        allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
    where id = 'restaurant_media';
exception when undefined_column then
  null;
end $$;

drop policy if exists restaurant_media_public_read on storage.objects;
create policy restaurant_media_public_read
  on storage.objects for select
  using (bucket_id = 'restaurant_media');

drop policy if exists restaurant_media_owner_manager_write on storage.objects;
create policy restaurant_media_owner_manager_write
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'restaurant_media'
    and (
      public.auth_has_role_in_restaurant((storage.foldername(name))[1]::uuid, array['owner','manager']::member_role[])
      or public.auth_is_super_admin()
    )
  );

drop policy if exists restaurant_media_owner_manager_update on storage.objects;
create policy restaurant_media_owner_manager_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'restaurant_media'
    and (
      public.auth_has_role_in_restaurant((storage.foldername(name))[1]::uuid, array['owner','manager']::member_role[])
      or public.auth_is_super_admin()
    )
  );

drop policy if exists restaurant_media_owner_manager_delete on storage.objects;
create policy restaurant_media_owner_manager_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'restaurant_media'
    and (
      public.auth_has_role_in_restaurant((storage.foldername(name))[1]::uuid, array['owner','manager']::member_role[])
      or public.auth_is_super_admin()
    )
  );

-- ---------------------------------------------------------------------
-- loyalty_settings
-- ---------------------------------------------------------------------

create table if not exists public.loyalty_settings (
  restaurant_id       uuid primary key references public.restaurants(id) on delete cascade,
  is_enabled          boolean not null default false,
  visit_threshold     integer not null default 5 check (visit_threshold between 1 and 50),
  discount_percentage integer not null default 10 check (discount_percentage between 1 and 100),
  custom_text         text not null default 'Get 10% OFF on your 5th visit!',
  banner_image_url    text,
  updated_at          timestamptz not null default now(),
  constraint loyalty_settings_custom_text_present check (length(btrim(custom_text)) > 0)
);

comment on table public.loyalty_settings is
  'Per-restaurant Loyalty Pass: punch-card length, discount, guest copy, and optional banner art.';

alter table public.loyalty_settings enable row level security;

-- The customer menu needs the copy, art, and numbers without an account.
-- Nothing here is secret — it is literally printed on the public carousel.
drop policy if exists loyalty_settings_select_public on public.loyalty_settings;
create policy loyalty_settings_select_public
  on public.loyalty_settings for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = loyalty_settings.restaurant_id
        and r.status = 'active'
    )
    or public.auth_is_super_admin()
    or restaurant_id in (select public.auth_restaurant_ids())
  );

drop policy if exists loyalty_settings_write_owner_manager on public.loyalty_settings;
create policy loyalty_settings_write_owner_manager
  on public.loyalty_settings for all
  to authenticated
  using (
    public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[])
    or public.auth_is_super_admin()
  )
  with check (
    public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[])
    or public.auth_is_super_admin()
  );

insert into public.loyalty_settings (restaurant_id, is_enabled)
select id, enable_loyalty_pass from public.restaurants
on conflict (restaurant_id) do nothing;

create or replace function public.provision_loyalty_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.loyalty_settings (restaurant_id, is_enabled)
  values (new.id, new.enable_loyalty_pass)
  on conflict (restaurant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_provision_loyalty_settings on public.restaurants;
create trigger trg_provision_loyalty_settings
  after insert on public.restaurants
  for each row execute function public.provision_loyalty_settings();

drop trigger if exists trg_loyalty_settings_updated_at on public.loyalty_settings;
create trigger trg_loyalty_settings_updated_at
  before update on public.loyalty_settings
  for each row execute function public.set_updated_at();

-- Managers cannot UPDATE restaurants directly (owner-only RLS), so this
-- trigger is SECURITY DEFINER: flipping is_enabled here must still flip
-- the denormalized restaurants.enable_loyalty_pass the menu already reads.
create or replace function public.sync_loyalty_enabled_to_restaurant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.restaurants
    set enable_loyalty_pass = new.is_enabled
    where id = new.restaurant_id
      and enable_loyalty_pass is distinct from new.is_enabled;
  return new;
end;
$$;

drop trigger if exists trg_sync_loyalty_enabled on public.loyalty_settings;
create trigger trg_sync_loyalty_enabled
  after insert or update of is_enabled on public.loyalty_settings
  for each row execute function public.sync_loyalty_enabled_to_restaurant();

-- ---------------------------------------------------------------------
-- Banner quota: 3 rows per restaurant, including inactive drafts.
-- ---------------------------------------------------------------------

create or replace function public.enforce_promotional_banner_quota()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*) from public.promotional_banners
    where restaurant_id = new.restaurant_id
  ) >= 3 then
    raise exception 'BANNER_QUOTA: Maximum banner limit (3) reached. Please delete an old banner first.'
      using errcode = 'P0052';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_promotional_banner_quota on public.promotional_banners;
create trigger trg_promotional_banner_quota
  before insert on public.promotional_banners
  for each row execute function public.enforce_promotional_banner_quota();

-- ---------------------------------------------------------------------
-- set_restaurant_feature_toggles: keep loyalty_settings.is_enabled aligned
-- when the older restaurant-level switch is the one that moved.
-- ---------------------------------------------------------------------

create or replace function public.set_restaurant_feature_toggles(
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

  if p_enable_loyalty_pass is not null then
    insert into public.loyalty_settings (restaurant_id, is_enabled)
    values (p_restaurant_id, p_enable_loyalty_pass)
    on conflict (restaurant_id) do update
      set is_enabled = excluded.is_enabled;
  end if;
end;
$$;

revoke all on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Guest RPCs: honour loyalty_settings.is_enabled (fall back to the
-- restaurant flag if a row was never provisioned).
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
  v_loyalty public.loyalty_settings%rowtype;
  v_name text;
  v_mobile text;
  v_customer public.customers%rowtype;
  v_enabled boolean;
begin
  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if not found or v_restaurant.status <> 'active' then
    raise exception 'Restaurant is not currently accepting guests' using errcode = 'P0003';
  end if;

  select * into v_loyalty from public.loyalty_settings where restaurant_id = p_restaurant_id;
  v_enabled := coalesce(v_loyalty.is_enabled, v_restaurant.enable_loyalty_pass, false);

  if not v_enabled then
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
  v_loyalty public.loyalty_settings%rowtype;
  v_mobile text;
  v_customer public.customers%rowtype;
  v_enabled boolean;
begin
  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if not found or v_restaurant.status <> 'active' then
    return null;
  end if;

  select * into v_loyalty from public.loyalty_settings where restaurant_id = p_restaurant_id;
  v_enabled := coalesce(v_loyalty.is_enabled, v_restaurant.enable_loyalty_pass, false);
  if not v_enabled then
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
  v_loyalty public.loyalty_settings%rowtype;
  v_mobile text;
  v_customer public.customers%rowtype;
  v_enabled boolean;
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
  if not found then
    raise exception 'LOYALTY_DISABLED: this restaurant is not running a Loyalty Pass'
      using errcode = 'P0050';
  end if;

  select * into v_loyalty from public.loyalty_settings where restaurant_id = v_order.restaurant_id;
  v_enabled := coalesce(v_loyalty.is_enabled, v_restaurant.enable_loyalty_pass, false);
  if not v_enabled then
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
-- create_order: apply loyalty_settings.discount_percentage when this
-- ticket is visit_threshold (visits_count = threshold - 1 as they sit).
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

  if v_apply then
    v_discount := round(v_subtotal * (v_percent::numeric / 100.0), 2);
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
