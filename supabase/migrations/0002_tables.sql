-- 0002_tables.sql
-- Core multi-tenant schema. Every tenant-owned table carries restaurant_id.

create table if not exists public.restaurants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  logo_url      text,
  currency      text not null default 'INR',
  timezone      text not null default 'Asia/Kolkata',
  status        restaurant_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint restaurants_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.restaurants is 'One row per tenant. The whole app is scoped by restaurant_id derived from this table.';

-- restaurant_members links auth.users -> restaurant with a role.
-- super_admin rows are platform-level and MUST have restaurant_id = null.
-- every other role MUST belong to exactly one restaurant per row.
create table if not exists public.restaurant_members (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          member_role not null,
  is_active     boolean not null default true,
  display_name  text,
  phone         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint restaurant_members_super_admin_scope check (
    (role = 'super_admin' and restaurant_id is null)
    or (role <> 'super_admin' and restaurant_id is not null)
  ),
  constraint restaurant_members_unique_membership unique (restaurant_id, user_id, role)
);

create table if not exists public.tables (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number  text not null,
  qr_token      uuid not null default gen_random_uuid(),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint tables_unique_number unique (restaurant_id, table_number),
  constraint tables_unique_qr_token unique (qr_token)
);

create table if not exists public.menu_categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id   uuid not null references public.menu_categories(id) on delete cascade,
  name          text not null,
  description   text,
  price         numeric(10,2) not null check (price >= 0),
  image_url     text,
  food_type     food_type not null default 'veg',
  prep_time     integer not null default 15 check (prep_time >= 0), -- minutes
  is_available  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.orders (
  id                    uuid primary key default gen_random_uuid(),
  restaurant_id         uuid not null references public.restaurants(id) on delete cascade,
  table_id              uuid not null references public.tables(id) on delete restrict,
  order_number          integer generated always as identity,
  status                order_status not null default 'placed',
  subtotal              numeric(10,2) not null default 0,
  estimated_minutes     integer,
  cancellation_reason   text,
  created_at            timestamptz not null default now(),
  accepted_at           timestamptz,
  preparing_at          timestamptz,
  ready_at              timestamptz,
  served_at             timestamptz,
  cancelled_at          timestamptz
);

-- order_items snapshot name/price at time of order so later menu edits
-- never rewrite history.
create table if not exists public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders(id) on delete cascade,
  menu_item_id          uuid references public.menu_items(id) on delete set null,
  item_name             text not null,
  unit_price            numeric(10,2) not null check (unit_price >= 0),
  quantity              integer not null check (quantity > 0),
  special_instructions  text,
  created_at            timestamptz not null default now()
);

create table if not exists public.service_requests (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id      uuid not null references public.tables(id) on delete cascade,
  type          service_request_type not null,
  status        service_request_status not null default 'pending',
  claimed_by    uuid references public.restaurant_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  resolved_at   timestamptz
);

-- One row per waiter's live availability, kept separate from restaurant_members
-- so it can be updated frequently/realtime without touching membership data.
create table if not exists public.waiter_status (
  member_id     uuid primary key references public.restaurant_members(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  availability  waiter_availability not null default 'offline',
  updated_at    timestamptz not null default now()
);

-- optional: audit log for super-admin support-mode actions (section 27)
create table if not exists public.support_mode_audit_log (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  super_admin_id uuid not null references auth.users(id),
  action        text not null,
  details       jsonb,
  created_at    timestamptz not null default now()
);
