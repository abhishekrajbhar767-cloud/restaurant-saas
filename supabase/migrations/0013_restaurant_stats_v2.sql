-- 0013_restaurant_stats_v2.sql
-- Admin dashboard (section 24) needs "Preparing orders" and "Ready orders"
-- as their own cards, not just the pending-service-requests count already
-- returned. Return type changes, so drop + recreate.

drop function if exists public.get_restaurant_stats(uuid);

create function public.get_restaurant_stats(p_restaurant_id uuid)
returns table (
  total_orders integer,
  today_orders integer,
  total_revenue numeric,
  today_revenue numeric,
  table_count integer,
  active_table_count integer,
  staff_count integer,
  pending_service_requests integer,
  preparing_orders integer,
  ready_orders integer
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
    (select count(*)::int from public.service_requests where restaurant_id = p_restaurant_id and status = 'pending'),
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id and status = 'preparing'),
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id and status = 'ready');
end;
$$;

grant execute on function public.get_restaurant_stats(uuid) to authenticated;
