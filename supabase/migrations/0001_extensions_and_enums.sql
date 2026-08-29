-- 0001_extensions_and_enums.sql
-- Extensions + enum types for the Smart Restaurant SaaS

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm"; -- for search on menu items / restaurant names

do $$ begin
  create type restaurant_status as enum ('active', 'suspended', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_role as enum ('super_admin', 'owner', 'manager', 'kitchen', 'waiter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type food_type as enum ('veg', 'non_veg', 'egg', 'vegan');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum (
    'placed', 'accepted', 'preparing', 'ready', 'served', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_request_type as enum ('waiter', 'water', 'bill');
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_request_status as enum ('pending', 'claimed', 'resolved', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type waiter_availability as enum ('free', 'busy', 'offline');
exception when duplicate_object then null; end $$;
