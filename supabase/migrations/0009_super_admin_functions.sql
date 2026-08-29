-- 0009_super_admin_functions.sql
-- Read-side RPCs backing the Super Admin dashboard. Each checks its own
-- authorization at the top (super_admin, or owner/manager for the
-- restaurant-scoped ones) rather than relying solely on the RLS of the
-- tables it aggregates — necessary because these do cross-tenant counts
-- and a join into auth.users that plain client-side queries can't do
-- under RLS at all.

create or replace function public.get_platform_stats()
returns table (
  total_restaurants integer,
  active_restaurants integer,
  suspended_restaurants integer,
  total_orders integer,
  today_orders integer,
  total_revenue numeric,
  active_staff integer,
  active_tables integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.auth_is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::int from public.restaurants),
    (select count(*)::int from public.restaurants where status = 'active'),
    (select count(*)::int from public.restaurants where status = 'suspended'),
    (select count(*)::int from public.orders),
    (select count(*)::int from public.orders where created_at >= date_trunc('day', now())),
    (select coalesce(sum(subtotal), 0) from public.orders where status <> 'cancelled'),
    (select count(*)::int from public.restaurant_members where is_active and role <> 'super_admin'),
    (select count(*)::int from public.tables where is_active);
end;
$$;

grant execute on function public.get_platform_stats() to authenticated;

-- One row per restaurant with the counts the dashboard table needs, plus the
-- current owner's name/email (owner email lives in auth.users, which normal
-- clients can never read — this function can, because it runs as definer).
create or replace function public.get_restaurant_overview()
returns table (
  restaurant_id uuid,
  name text,
  slug text,
  status restaurant_status,
  created_at timestamptz,
  owner_name text,
  owner_email text,
  table_count bigint,
  staff_count bigint,
  today_order_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.auth_is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.name,
    r.slug,
    r.status,
    r.created_at,
    om.display_name,
    u.email::text,
    (select count(*) from public.tables t where t.restaurant_id = r.id and t.is_active),
    (select count(*) from public.restaurant_members m where m.restaurant_id = r.id and m.is_active),
    (select count(*) from public.orders o where o.restaurant_id = r.id and o.created_at >= date_trunc('day', now()))
  from public.restaurants r
  left join lateral (
    select * from public.restaurant_members m2
    where m2.restaurant_id = r.id and m2.role = 'owner' and m2.is_active
    order by m2.created_at asc limit 1
  ) om on true
  left join auth.users u on u.id = om.user_id
  order by r.created_at desc;
end;
$$;

grant execute on function public.get_restaurant_overview() to authenticated;

-- Staff roster for one restaurant, with email resolved from auth.users.
-- Callable by Super Admin OR that restaurant's own owner/manager (this same
-- function backs the staff list on /admin in a later phase).
create or replace function public.get_restaurant_staff(p_restaurant_id uuid)
returns table (
  member_id uuid,
  role member_role,
  display_name text,
  phone text,
  is_active boolean,
  email text,
  created_at timestamptz
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
  select m.id, m.role, m.display_name, m.phone, m.is_active, u.email::text, m.created_at
  from public.restaurant_members m
  join auth.users u on u.id = m.user_id
  where m.restaurant_id = p_restaurant_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.get_restaurant_staff(uuid) to authenticated;

-- Per-restaurant stat block, reused by both the Super Admin restaurant-detail
-- view and the Restaurant Admin dashboard (Phase 5).
create or replace function public.get_restaurant_stats(p_restaurant_id uuid)
returns table (
  total_orders integer,
  today_orders integer,
  total_revenue numeric,
  today_revenue numeric,
  table_count integer,
  active_table_count integer,
  staff_count integer,
  pending_service_requests integer
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
  select
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id),
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id and created_at >= date_trunc('day', now())),
    (select coalesce(sum(subtotal), 0) from public.orders where restaurant_id = p_restaurant_id and status <> 'cancelled'),
    (select coalesce(sum(subtotal), 0) from public.orders where restaurant_id = p_restaurant_id and status <> 'cancelled' and created_at >= date_trunc('day', now())),
    (select count(*)::int from public.tables where restaurant_id = p_restaurant_id),
    (select count(*)::int from public.tables where restaurant_id = p_restaurant_id and is_active),
    (select count(*)::int from public.restaurant_members where restaurant_id = p_restaurant_id and is_active),
    (select count(*)::int from public.service_requests where restaurant_id = p_restaurant_id and status = 'pending');
end;
$$;

grant execute on function public.get_restaurant_stats(uuid) to authenticated;
