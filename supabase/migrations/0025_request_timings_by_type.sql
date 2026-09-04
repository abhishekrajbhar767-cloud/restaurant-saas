-- 0025_request_timings_by_type.sql
--
-- get_staff_request_timings now returns one row per staff member PER request
-- type. A single blended average hid the thing a manager actually wants to
-- act on: fetching water is a 30 second job and settling a bill is not, so a
-- waiter who looks slow overall may simply be the one handling every bill.
--
-- The OUT columns change, which CREATE OR REPLACE cannot do, so the old
-- signature is dropped first.

drop function if exists public.get_staff_request_timings(uuid, date);

create function public.get_staff_request_timings(p_restaurant_id uuid, p_day date default null)
returns table (
  staff_id uuid,
  display_name text,
  email text,
  role member_role,
  request_type service_request_type,
  requests_completed integer,
  average_minutes numeric,
  longest_minutes integer
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
    m.id,
    m.display_name,
    u.email::text,
    m.role,
    sr.type,
    count(*)::int,
    round(avg((extract(epoch from (sr.resolved_at - sr.claimed_at)) / 60)::numeric), 1),
    coalesce(max((extract(epoch from (sr.resolved_at - sr.claimed_at)) / 60)::numeric), 0)::int
  from public.service_requests sr
  join public.restaurant_members m on m.id = sr.claimed_by
  join auth.users u on u.id = m.user_id
  where sr.restaurant_id = p_restaurant_id
    and sr.status = 'resolved'
    and sr.claimed_at is not null
    and sr.resolved_at is not null
    and sr.resolved_at >= v_start
    and sr.resolved_at < v_end
  group by m.id, m.display_name, u.email, m.role, sr.type
  order by m.display_name nulls last, u.email, sr.type;
end;
$$;

revoke all on function public.get_staff_request_timings(uuid, date) from public, anon;
grant execute on function public.get_staff_request_timings(uuid, date) to authenticated;
