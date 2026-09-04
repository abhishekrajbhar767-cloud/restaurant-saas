-- 0026_restaurant_feature_toggles.sql
--
-- Per-restaurant feature switches. Defaults deliberately reproduce today's
-- behaviour: every order already carries a table_id, and no customer details
-- are collected anywhere, so an existing restaurant sees no change until an
-- owner flips something.

alter table public.restaurants
  add column if not exists require_table_assignment boolean not null default true,
  add column if not exists enable_customer_name     boolean not null default false,
  add column if not exists enable_customer_mobile   boolean not null default false;

-- ---------------------------------------------------------------------
-- set_restaurant_feature_toggles: restaurants_update_owner_settings is
-- owner-only, but /admin/settings is open to managers too — same reason
-- set_restaurant_geofence() exists.
--
-- Every parameter defaults to null meaning "leave this one alone", so the
-- UI can save a single switch without sending the others back. Sending all
-- three would make two people toggling different switches at once clobber
-- each other with whatever their page happened to be showing.
-- ---------------------------------------------------------------------
create or replace function public.set_restaurant_feature_toggles(
  p_restaurant_id uuid,
  p_require_table_assignment boolean default null,
  p_enable_customer_name boolean default null,
  p_enable_customer_mobile boolean default null
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
        updated_at = now()
    where id = p_restaurant_id;

  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;
end;
$$;

revoke all on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean) to authenticated;
