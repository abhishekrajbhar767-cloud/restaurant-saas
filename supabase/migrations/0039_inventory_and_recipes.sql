-- 0039_inventory_and_recipes.sql
--
-- Phase 1 of the optional Inventory & Recipe system: schema and the
-- restaurant-level toggles only. No deduction logic and no UI yet — this
-- migration just gives a restaurant somewhere to store stock levels and
-- recipes, gated off by default so nothing changes for a restaurant that
-- never turns it on.
--
-- This codebase's staff table is restaurant_members (role: member_role
-- enum — 'owner' is the top tenant role; there is no 'admin'), not a
-- separate "staff" table, so performed_by and the RLS policies below are
-- written against that.

alter table public.restaurants
  add column if not exists inventory_tracking_enabled boolean not null default false,
  add column if not exists recipe_auto_deduct_enabled boolean not null default false;

create table if not exists public.inventory_items (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  name             text not null,
  unit             text not null check (unit in ('kg', 'gram', 'litre', 'ml', 'pcs')),
  current_stock    numeric(12,3) not null default 0.000,
  min_alert_limit  numeric(12,3) not null default 1.000,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.menu_item_recipes (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id        uuid not null references public.menu_items(id) on delete cascade,
  inventory_item_id   uuid not null references public.inventory_items(id) on delete cascade,
  quantity_required   numeric(12,3) not null,
  constraint menu_item_recipes_unique_line unique (menu_item_id, inventory_item_id)
);

create table if not exists public.inventory_logs (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  inventory_item_id  uuid not null references public.inventory_items(id) on delete cascade,
  change_type        text not null check (change_type in ('manual_restock', 'auto_deduct', 'waste', 'correction')),
  quantity           numeric(12,3) not null,
  notes              text,
  performed_by       uuid references public.restaurant_members(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists idx_inventory_items_restaurant_stock on public.inventory_items (restaurant_id, current_stock);
create index if not exists idx_menu_item_recipes_menu_item_id on public.menu_item_recipes (menu_item_id);
create index if not exists idx_menu_item_recipes_restaurant_id on public.menu_item_recipes (restaurant_id);
create index if not exists idx_menu_item_recipes_inventory_item_id on public.menu_item_recipes (inventory_item_id);
create index if not exists idx_inventory_logs_restaurant_id on public.inventory_logs (restaurant_id);
create index if not exists idx_inventory_logs_inventory_item_id on public.inventory_logs (inventory_item_id);

alter table public.inventory_items enable row level security;
alter table public.menu_item_recipes enable row level security;
alter table public.inventory_logs enable row level security;

-- Owner/manager only, same shape as items_write_owner_manager on menu_items.
-- Kitchen/waiter never read or write raw stock directly in this phase —
-- deduction (phase 2) will go through a SECURITY DEFINER function instead
-- of widening these policies.
create policy inventory_items_owner_manager
  on public.inventory_items for all
  to authenticated
  using (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin())
  with check (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin());

create policy menu_item_recipes_owner_manager
  on public.menu_item_recipes for all
  to authenticated
  using (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin())
  with check (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin());

create policy inventory_logs_owner_manager
  on public.inventory_logs for all
  to authenticated
  using (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin())
  with check (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin());

-- ---------------------------------------------------------------------
-- set_restaurant_feature_toggles: add the two inventory switches. Adding
-- parameters changes the signature, so the previous 6-arg version is
-- dropped first to avoid leaving an ambiguous overload behind. Every
-- parameter still defaults to null meaning "leave this one alone".
-- ---------------------------------------------------------------------
drop function if exists public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean, boolean);

create or replace function public.set_restaurant_feature_toggles(
  p_restaurant_id uuid,
  p_require_table_assignment boolean default null,
  p_enable_customer_name boolean default null,
  p_enable_customer_mobile boolean default null,
  p_enable_loyalty_pass boolean default null,
  p_require_waiter_approval boolean default null,
  p_inventory_tracking_enabled boolean default null,
  p_recipe_auto_deduct_enabled boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory_on boolean;
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select inventory_tracking_enabled into v_inventory_on from public.restaurants where id = p_restaurant_id;
  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;

  -- Auto-deduct is meaningless without inventory tracking, so turning
  -- tracking off always turns auto-deduct off with it rather than leaving a
  -- stranded switch that would silently do nothing.
  update public.restaurants
    set require_table_assignment  = coalesce(p_require_table_assignment, require_table_assignment),
        enable_customer_name      = coalesce(p_enable_customer_name, enable_customer_name),
        enable_customer_mobile    = coalesce(p_enable_customer_mobile, enable_customer_mobile),
        enable_loyalty_pass       = coalesce(p_enable_loyalty_pass, enable_loyalty_pass),
        require_waiter_approval   = coalesce(p_require_waiter_approval, require_waiter_approval),
        inventory_tracking_enabled = coalesce(p_inventory_tracking_enabled, inventory_tracking_enabled),
        recipe_auto_deduct_enabled = case
          when coalesce(p_inventory_tracking_enabled, v_inventory_on) = false then false
          else coalesce(p_recipe_auto_deduct_enabled, recipe_auto_deduct_enabled)
        end,
        updated_at = now()
    where id = p_restaurant_id;

  if p_enable_loyalty_pass is not null then
    insert into public.loyalty_settings (restaurant_id, is_enabled)
    values (p_restaurant_id, p_enable_loyalty_pass)
    on conflict (restaurant_id) do update
      set is_enabled = excluded.is_enabled;
  end if;
end;
$$;

revoke all on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;
