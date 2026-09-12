-- Phase 2: atomic manual stock intake, using the existing Phase 1 tables.
create or replace function public.add_inventory_stock(
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_notes text default null
)
returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
  v_member_id uuid;
  v_enabled boolean;
  v_item public.inventory_items%rowtype;
begin
  -- numeric NaN/Infinity also compare above this finite maximum in Postgres.
  if p_quantity is null or p_quantity <= 0 or p_quantity > 999999999.999
     or p_quantity <> round(p_quantity, 3) then
    raise exception 'Quantity must be positive, below 1000000000, and have at most 3 decimals'
      using errcode = '22023';
  end if;
  if length(btrim(p_notes)) > 500 then
    raise exception 'Notes must be at most 500 characters' using errcode = '22023';
  end if;

  select restaurant_id into v_restaurant_id from public.inventory_items where id = p_inventory_item_id;
  if not found then
    raise exception 'Ingredient not found' using errcode = 'P0002';
  end if;

  -- Both authorization and audit identity come from the session, never RPC inputs.
  select id into v_member_id from public.restaurant_members
  where restaurant_id = v_restaurant_id and user_id = auth.uid()
    and is_active and role in ('owner', 'manager')
  order by id limit 1;
  if v_member_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Keep the feature enabled until this transaction finishes.
  select inventory_tracking_enabled into v_enabled from public.restaurants
  where id = v_restaurant_id for share;
  if v_enabled is distinct from true then
    raise exception 'Inventory tracking is disabled' using errcode = '42501';
  end if;

  -- UPDATE locks the item and increments its latest value, including concurrent intakes.
  update public.inventory_items
  set current_stock = current_stock + p_quantity, updated_at = now()
  where id = p_inventory_item_id and restaurant_id = v_restaurant_id
  returning * into v_item;
  if not found then
    raise exception 'Ingredient not found' using errcode = 'P0002';
  end if;

  insert into public.inventory_logs
    (restaurant_id, inventory_item_id, change_type, quantity, notes, performed_by)
  values
    (v_restaurant_id, v_item.id, 'manual_restock', p_quantity, nullif(btrim(p_notes), ''), v_member_id);

  -- Any failure (including log insertion) rolls back the stock increase as well.
  return v_item;
end;
$$;

revoke all on function public.add_inventory_stock(uuid, numeric, text) from public, anon;
grant execute on function public.add_inventory_stock(uuid, numeric, text) to authenticated;

create index if not exists idx_inventory_logs_item_recent
  on public.inventory_logs (restaurant_id, inventory_item_id, created_at desc, id desc);
