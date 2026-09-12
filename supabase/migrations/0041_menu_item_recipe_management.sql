-- Phase 3: recipe mapping only. Neither function changes stock or inventory logs.
create or replace function public.save_menu_item_recipe(p_menu_item_id uuid, p_ingredients jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_enabled boolean;
  v_ingredient_count integer;
begin
  select restaurant_id into v_restaurant_id from public.menu_items where id = p_menu_item_id;
  if not found then
    raise exception 'Menu item not found' using errcode = 'P0002';
  end if;
  if not public.auth_has_role_in_restaurant(v_restaurant_id, array['owner','manager']::member_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- All recipe writes lock restaurant -> dish -> ingredients in that order.
  select inventory_tracking_enabled into v_enabled from public.restaurants
  where id = v_restaurant_id for share;
  if v_enabled is distinct from true then
    raise exception 'Inventory tracking is disabled' using errcode = '42501';
  end if;
  perform id from public.menu_items
  where id = p_menu_item_id and restaurant_id = v_restaurant_id for update;
  if not found then
    raise exception 'Menu item not found' using errcode = 'P0002';
  end if;

  -- [] explicitly clears the recipe. A missing or malformed payload must not clear it.
  if jsonb_typeof(p_ingredients) is distinct from 'array' then
    raise exception 'Ingredients must be an array' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_ingredients) as entry(value)
    where jsonb_typeof(value) is distinct from 'object'
      or jsonb_typeof(value->'inventory_item_id') is distinct from 'string'
      or jsonb_typeof(value->'quantity_required') is distinct from 'number'
  ) then
    raise exception 'Every ingredient needs an ID and a numeric quantity' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_ingredients) as line(inventory_item_id uuid, quantity_required numeric)
    where quantity_required <= 0 or quantity_required > 999999999.999
      or quantity_required <> round(quantity_required, 3)
  ) then
    raise exception 'Quantities must be positive, below 1000000000, and have at most 3 decimals' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_ingredients) as line(inventory_item_id uuid)
    group by inventory_item_id having count(*) > 1
  ) then
    raise exception 'Each ingredient can only appear once' using errcode = '22023';
  end if;

  -- Validate and lock every selected ingredient before changing any mapping.
  -- The restaurant check applies to the dish AND each raw ingredient.
  perform i.id from public.inventory_items i
  join jsonb_to_recordset(p_ingredients) as line(inventory_item_id uuid) on line.inventory_item_id = i.id
  where i.restaurant_id = v_restaurant_id
  order by i.id for share of i;
  get diagnostics v_ingredient_count = row_count;
  if v_ingredient_count <> jsonb_array_length(p_ingredients) then
    raise exception 'One or more ingredients are unavailable in this restaurant' using errcode = '22023';
  end if;

  delete from public.menu_item_recipes r
  where r.menu_item_id = p_menu_item_id and r.restaurant_id = v_restaurant_id
    and not exists (
      select 1 from jsonb_to_recordset(p_ingredients) as line(inventory_item_id uuid)
      where line.inventory_item_id = r.inventory_item_id
    );

  insert into public.menu_item_recipes (restaurant_id, menu_item_id, inventory_item_id, quantity_required)
  select v_restaurant_id, p_menu_item_id, line.inventory_item_id, line.quantity_required
  from jsonb_to_recordset(p_ingredients) as line(inventory_item_id uuid, quantity_required numeric)
  on conflict (menu_item_id, inventory_item_id) do update
    set quantity_required = excluded.quantity_required
    where public.menu_item_recipes.restaurant_id = excluded.restaurant_id;
  get diagnostics v_ingredient_count = row_count;
  if v_ingredient_count <> jsonb_array_length(p_ingredients) then
    raise exception 'Recipe contains an inconsistent restaurant mapping' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.delete_recipe_ingredient(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipe public.menu_item_recipes%rowtype;
  v_enabled boolean;
begin
  select * into v_recipe from public.menu_item_recipes where id = p_recipe_id;
  if not found then
    raise exception 'Recipe ingredient not found' using errcode = 'P0002';
  end if;
  if not public.auth_has_role_in_restaurant(v_recipe.restaurant_id, array['owner','manager']::member_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select inventory_tracking_enabled into v_enabled from public.restaurants
  where id = v_recipe.restaurant_id for share;
  if v_enabled is distinct from true then
    raise exception 'Inventory tracking is disabled' using errcode = '42501';
  end if;
  -- Serialize single-row deletion with full recipe saves on the same dish.
  perform id from public.menu_items
  where id = v_recipe.menu_item_id and restaurant_id = v_recipe.restaurant_id for update;
  if not found then
    raise exception 'Menu item not found' using errcode = 'P0002';
  end if;
  delete from public.menu_item_recipes
  where id = p_recipe_id and menu_item_id = v_recipe.menu_item_id and restaurant_id = v_recipe.restaurant_id;
end;
$$;

revoke all on function public.save_menu_item_recipe(uuid, jsonb) from public, anon;
revoke all on function public.delete_recipe_ingredient(uuid) from public, anon;
grant execute on function public.save_menu_item_recipe(uuid, jsonb) to authenticated;
grant execute on function public.delete_recipe_ingredient(uuid) to authenticated;
