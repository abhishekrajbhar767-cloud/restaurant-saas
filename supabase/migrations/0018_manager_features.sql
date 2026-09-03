-- 0018_manager_features.sql
-- Database foundation for the manager dashboard.

-- Status types used by the table map and item-level voiding.
do $$ begin
  create type table_status as enum ('empty', 'dining', 'billed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_item_status as enum ('active', 'voided');
exception when duplicate_object then null; end $$;

-- The existing order_status type already backs public.orders.status.
alter type order_status add value if not exists 'voided';

-- Menu quick actions. This column exists in fresh installations, while the
-- IF NOT EXISTS keeps the migration safe for older or customized databases.
alter table public.menu_items
  add column if not exists is_available boolean not null default true;

-- Order- and item-level discounts and void audit details.
alter table public.orders
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists void_reason text;

alter table public.order_items
  add column if not exists discount_amount numeric(10,2) not null default 0,
  add column if not exists void_reason text,
  add column if not exists status order_item_status not null default 'active';

alter table public.orders
  add constraint orders_discount_amount_nonnegative
  check (discount_amount >= 0);

alter table public.order_items
  add constraint order_items_discount_amount_nonnegative
  check (discount_amount >= 0);

-- Physical table state for the manager's live floor map.
alter table public.tables
  add column if not exists status table_status not null default 'empty';

-- Restaurant location used to validate staff clock-ins.
alter table public.restaurants
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists geofence_radius_meters integer;

alter table public.restaurants
  add constraint restaurants_latitude_range
  check (latitude is null or latitude between -90 and 90),
  add constraint restaurants_longitude_range
  check (longitude is null or longitude between -180 and 180),
  add constraint restaurants_geofence_radius_positive
  check (geofence_radius_meters is null or geofence_radius_meters > 0),
  add constraint restaurants_geofence_location_complete
  check (
    (latitude is null and longitude is null and geofence_radius_meters is null)
    or
    (latitude is not null and longitude is not null and geofence_radius_meters is not null)
  );

-- Staff attendance and offline-time tracking.
-- The composite key guarantees that a shift cannot associate a staff member
-- with a different restaurant.
alter table public.restaurant_members
  add constraint restaurant_members_id_restaurant_unique
  unique (id, restaurant_id);

create table if not exists public.staff_shifts (
  id                      uuid primary key default gen_random_uuid(),
  restaurant_id           uuid not null references public.restaurants(id) on delete cascade,
  staff_id                 uuid not null,
  clock_in_time            timestamptz not null default now(),
  clock_out_time           timestamptz,
  total_offline_minutes    integer not null default 0,
  clock_in_latitude        numeric(9,6),
  clock_in_longitude       numeric(9,6),
  constraint staff_shifts_staff_restaurant_fk
    foreign key (staff_id, restaurant_id)
    references public.restaurant_members(id, restaurant_id)
    on delete cascade,
  constraint staff_shifts_time_order
    check (clock_out_time is null or clock_out_time >= clock_in_time),
  constraint staff_shifts_offline_minutes_nonnegative
    check (total_offline_minutes >= 0),
  constraint staff_shifts_latitude_range
    check (clock_in_latitude is null or clock_in_latitude between -90 and 90),
  constraint staff_shifts_longitude_range
    check (clock_in_longitude is null or clock_in_longitude between -180 and 180),
  constraint staff_shifts_clock_in_location_complete
    check (
      (clock_in_latitude is null and clock_in_longitude is null)
      or
      (clock_in_latitude is not null and clock_in_longitude is not null)
    )
);

create index if not exists idx_staff_shifts_restaurant_clock_in
  on public.staff_shifts (restaurant_id, clock_in_time desc);

create index if not exists idx_staff_shifts_staff_clock_in
  on public.staff_shifts (staff_id, clock_in_time desc);

-- At most one open shift per staff member.
create unique index if not exists idx_staff_shifts_one_open_shift
  on public.staff_shifts (staff_id)
  where clock_out_time is null;

alter table public.staff_shifts enable row level security;

create policy staff_shifts_select_staff
  on public.staff_shifts for select
  to authenticated
  using (
    restaurant_id in (select public.auth_restaurant_ids())
    or public.auth_is_super_admin()
  );

create policy staff_shifts_insert_self
  on public.staff_shifts for insert
  to authenticated
  with check (
    staff_id = public.auth_member_id(restaurant_id)
    or public.auth_has_role_in_restaurant(
      restaurant_id,
      array['owner','manager']::member_role[]
    )
    or public.auth_is_super_admin()
  );

create policy staff_shifts_update_self_or_manager
  on public.staff_shifts for update
  to authenticated
  using (
    staff_id = public.auth_member_id(restaurant_id)
    or public.auth_has_role_in_restaurant(
      restaurant_id,
      array['owner','manager']::member_role[]
    )
    or public.auth_is_super_admin()
  )
  with check (
    staff_id = public.auth_member_id(restaurant_id)
    or public.auth_has_role_in_restaurant(
      restaurant_id,
      array['owner','manager']::member_role[]
    )
    or public.auth_is_super_admin()
  );
