-- 0022_reports.sql
--
-- Reporting RPCs for the manager/owner analytics screen. Every one of these
-- re-checks the caller's role against the restaurant before returning a row,
-- so the reports route never has to be trusted on its own.
--
-- "Today" is the restaurant's own calendar day, not the server's. An IST
-- restaurant closing at 1am would otherwise have its late-night takings land
-- in the previous UTC day, which makes an end-of-day report useless.

create or replace function public.restaurant_day_start(p_restaurant_id uuid, p_day date default null)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_day is null
      then date_trunc('day', now() at time zone coalesce(nullif(r.timezone, ''), 'UTC'))
           at time zone coalesce(nullif(r.timezone, ''), 'UTC')
    else p_day::timestamp at time zone coalesce(nullif(r.timezone, ''), 'UTC')
  end
  from public.restaurants r
  where r.id = p_restaurant_id;
$$;

revoke all on function public.restaurant_day_start(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- get_eod_summary: the end-of-day headline numbers. Voided and cancelled
-- orders are excluded entirely, and voided lines inside a surviving order
-- contribute nothing — order_net_total() already enforces both.
-- ---------------------------------------------------------------------
create or replace function public.get_eod_summary(p_restaurant_id uuid, p_day date default null)
returns table (
  order_count integer,
  items_sold integer,
  gross_revenue numeric,
  discount_total numeric,
  net_revenue numeric,
  average_order_value numeric,
  voided_order_count integer,
  voided_item_count integer,
  voided_value numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_start := public.restaurant_day_start(p_restaurant_id, p_day);
  if v_start is null then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;
  v_end := v_start + interval '1 day';

  return query
  with counted as (
    select o.id, public.order_net_total(o.id) as net
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and o.created_at >= v_start
      and o.created_at < v_end
      and o.status not in ('cancelled', 'voided')
  ),
  counted_lines as (
    select oi.quantity, oi.unit_price
    from public.order_items oi
    join counted c on c.id = oi.order_id
    where oi.status = 'active'
  ),
  voided as (
    select oi.quantity, oi.unit_price
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.restaurant_id = p_restaurant_id
      and o.created_at >= v_start
      and o.created_at < v_end
      and oi.status = 'voided'
  )
  select
    (select count(*)::int from counted),
    (select coalesce(sum(quantity), 0)::int from counted_lines),
    (select coalesce(sum(unit_price * quantity), 0) from counted_lines),
    (select coalesce(sum(unit_price * quantity), 0) from counted_lines)
      - (select coalesce(sum(net), 0) from counted),
    (select coalesce(sum(net), 0) from counted),
    (select coalesce(sum(net), 0) / nullif(count(*), 0) from counted),
    (
      select count(*)::int from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.created_at >= v_start and o.created_at < v_end
        and o.status = 'voided'
    ),
    (select count(*)::int from voided),
    (select coalesce(sum(unit_price * quantity), 0) from voided);
end;
$$;

-- ---------------------------------------------------------------------
-- get_top_selling_items: ranked by volume. Grouped on the item_name
-- snapshot rather than menu_item_id, because a deleted menu item nulls
-- the id but the sale still happened and still belongs in the report.
-- ---------------------------------------------------------------------
create or replace function public.get_top_selling_items(
  p_restaurant_id uuid,
  p_day date default null,
  p_limit integer default 10
)
returns table (
  item_name text,
  quantity_sold integer,
  order_count integer,
  net_revenue numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_start := public.restaurant_day_start(p_restaurant_id, p_day);
  if v_start is null then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;
  v_end := v_start + interval '1 day';

  return query
  select
    oi.item_name,
    sum(oi.quantity)::int,
    count(distinct oi.order_id)::int,
    coalesce(sum(oi.unit_price * oi.quantity - oi.discount_amount), 0)
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.restaurant_id = p_restaurant_id
    and o.created_at >= v_start
    and o.created_at < v_end
    and o.status not in ('cancelled', 'voided')
    and oi.status = 'active'
  group by oi.item_name
  order by sum(oi.quantity) desc, coalesce(sum(oi.unit_price * oi.quantity - oi.discount_amount), 0) desc
  limit greatest(coalesce(p_limit, 10), 1);
end;
$$;

-- ---------------------------------------------------------------------
-- get_staff_shift_history: every clock-in/out for the day, one row per
-- shift, so breaks and split shifts stay visible instead of collapsing
-- into a single total. A shift is attributed to the day it started on.
-- Open shifts report minutes worked up to now.
-- ---------------------------------------------------------------------
create or replace function public.get_staff_shift_history(p_restaurant_id uuid, p_day date default null)
returns table (
  shift_id uuid,
  staff_id uuid,
  display_name text,
  email text,
  role member_role,
  clock_in_time timestamptz,
  clock_out_time timestamptz,
  minutes_worked integer,
  is_open boolean,
  clock_in_latitude numeric,
  clock_in_longitude numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_start := public.restaurant_day_start(p_restaurant_id, p_day);
  if v_start is null then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;
  v_end := v_start + interval '1 day';

  return query
  select
    s.id,
    s.staff_id,
    m.display_name,
    u.email::text,
    m.role,
    s.clock_in_time,
    s.clock_out_time,
    (extract(epoch from (coalesce(s.clock_out_time, now()) - s.clock_in_time)) / 60)::int,
    s.clock_out_time is null,
    s.clock_in_latitude,
    s.clock_in_longitude
  from public.staff_shifts s
  join public.restaurant_members m on m.id = s.staff_id
  join auth.users u on u.id = m.user_id
  where s.restaurant_id = p_restaurant_id
    and s.clock_in_time >= v_start
    and s.clock_in_time < v_end
  order by m.display_name nulls last, u.email, s.clock_in_time asc;
end;
$$;

revoke all on function public.get_eod_summary(uuid, date) from public, anon;
revoke all on function public.get_top_selling_items(uuid, date, integer) from public, anon;
revoke all on function public.get_staff_shift_history(uuid, date) from public, anon;

grant execute on function public.get_eod_summary(uuid, date) to authenticated;
grant execute on function public.get_top_selling_items(uuid, date, integer) to authenticated;
grant execute on function public.get_staff_shift_history(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- The admin dashboard's "today" was date_trunc('day', now()), i.e. UTC.
-- Left alone it would disagree with every number on the reports screen
-- for any restaurant not running on UTC.
-- ---------------------------------------------------------------------
create or replace function public.get_restaurant_stats(p_restaurant_id uuid)
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
declare
  v_start timestamptz;
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_start := public.restaurant_day_start(p_restaurant_id, null);

  return query
  select
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id),
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id and created_at >= v_start),
    (
      select coalesce(sum(public.order_net_total(o.id)), 0)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.status not in ('cancelled', 'voided')
    ),
    (
      select coalesce(sum(public.order_net_total(o.id)), 0)
      from public.orders o
      where o.restaurant_id = p_restaurant_id
        and o.status not in ('cancelled', 'voided')
        and o.created_at >= v_start
    ),
    (select count(*)::int from public.tables where restaurant_id = p_restaurant_id),
    (select count(*)::int from public.tables where restaurant_id = p_restaurant_id and is_active),
    (select count(*)::int from public.restaurant_members where restaurant_id = p_restaurant_id and is_active),
    (select count(*)::int from public.service_requests where restaurant_id = p_restaurant_id and status = 'pending'),
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id and status = 'preparing'),
    (select count(*)::int from public.orders where restaurant_id = p_restaurant_id and status = 'ready');
end;
$$;

grant execute on function public.get_restaurant_stats(uuid) to authenticated;
