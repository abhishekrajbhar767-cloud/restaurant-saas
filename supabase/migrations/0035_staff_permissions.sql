-- 0035_staff_permissions.sql
-- Per-staff capability flags and a restaurant-level waiter-approval switch.
--
-- Defaults preserve today's behaviour: every staff member can take orders
-- (can_take_orders = true) just as they do now, billing stays a deliberate
-- opt-in (can_handle_billing = false), and orders are not gated on waiter
-- approval until an owner/manager turns it on (require_waiter_approval = false).

alter table public.restaurant_members
  add column if not exists can_take_orders    boolean not null default true,
  add column if not exists can_handle_billing boolean not null default false;

alter table public.restaurants
  add column if not exists require_waiter_approval boolean not null default false;

-- ---------------------------------------------------------------------
-- get_restaurant_staff: surface the two new permission flags to the
-- manager's staff roster. The return type changes, so the function has to
-- be dropped and recreated rather than CREATE OR REPLACE'd (see 0012).
-- ---------------------------------------------------------------------
drop function if exists public.get_restaurant_staff(uuid);

create function public.get_restaurant_staff(p_restaurant_id uuid)
returns table (
  member_id uuid,
  role member_role,
  display_name text,
  phone text,
  is_active boolean,
  email text,
  created_at timestamptz,
  availability waiter_availability,
  can_take_orders boolean,
  can_handle_billing boolean
)
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

  return query
  select m.id, m.role, m.display_name, m.phone, m.is_active, u.email::text, m.created_at,
         ws.availability, m.can_take_orders, m.can_handle_billing
  from public.restaurant_members m
  join auth.users u on u.id = m.user_id
  left join public.waiter_status ws on ws.member_id = m.id
  where m.restaurant_id = p_restaurant_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.get_restaurant_staff(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- set_restaurant_feature_toggles: add p_require_waiter_approval. Adding a
-- parameter changes the signature, so drop the previous 4/5-arg versions
-- first to avoid leaving ambiguous overloads behind. Every parameter still
-- defaults to null meaning "leave this one alone".
-- ---------------------------------------------------------------------
drop function if exists public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean);
drop function if exists public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean);

create or replace function public.set_restaurant_feature_toggles(
  p_restaurant_id uuid,
  p_require_table_assignment boolean default null,
  p_enable_customer_name boolean default null,
  p_enable_customer_mobile boolean default null,
  p_enable_loyalty_pass boolean default null,
  p_require_waiter_approval boolean default null
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
        require_waiter_approval  = coalesce(p_require_waiter_approval, require_waiter_approval),
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

revoke all on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_restaurant_feature_toggles(uuid, boolean, boolean, boolean, boolean, boolean) to authenticated;
