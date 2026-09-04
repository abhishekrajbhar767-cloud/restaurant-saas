-- 0021_staff_shifts_geofencing.sql
--
-- Clock-in has to be judged by the database, not the browser. The client can
-- pick any coordinates it likes, so the distance check lives here where it
-- cannot be skipped by editing JS. The browser's own check is only there to
-- explain the refusal before the round trip.
--
-- Settings also need an RPC: restaurants_update_owner_settings is owner-only,
-- so a manager cannot write geofence columns through a plain table update.

create or replace function public.geo_distance_meters(
  p_lat1 numeric, p_lon1 numeric, p_lat2 numeric, p_lon2 numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  -- Haversine. least(1, ...) guards the float rounding that can push the
  -- argument of asin just past 1 for two nearly identical points.
  select (
    2 * 6371000 * asin(least(1, sqrt(
      power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
      + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
        * power(sin(radians((p_lon2 - p_lon1)::double precision) / 2), 2)
    )))
  )::numeric;
$$;

grant execute on function public.geo_distance_meters(numeric, numeric, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- set_restaurant_geofence: owner OR manager. Passing all nulls clears the
-- geofence, which turns location enforcement off for that restaurant.
-- ---------------------------------------------------------------------
create or replace function public.set_restaurant_geofence(
  p_restaurant_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_radius_meters integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_all_null boolean;
  v_all_set boolean;
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_all_null := p_latitude is null and p_longitude is null and p_radius_meters is null;
  v_all_set  := p_latitude is not null and p_longitude is not null and p_radius_meters is not null;

  if not (v_all_null or v_all_set) then
    raise exception 'Latitude, longitude and radius must be set together' using errcode = 'P0040';
  end if;

  if v_all_set then
    if p_latitude < -90 or p_latitude > 90 then
      raise exception 'Latitude must be between -90 and 90' using errcode = 'P0041';
    end if;
    if p_longitude < -180 or p_longitude > 180 then
      raise exception 'Longitude must be between -180 and 180' using errcode = 'P0042';
    end if;
    if p_radius_meters <= 0 then
      raise exception 'Radius must be greater than zero' using errcode = 'P0043';
    end if;
  end if;

  update public.restaurants
    set latitude = p_latitude,
        longitude = p_longitude,
        geofence_radius_meters = p_radius_meters,
        updated_at = now()
    where id = p_restaurant_id;

  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- clock_in: the geofence gate. Coordinates come from the caller, so they
-- are only as trustworthy as the device — but the comparison itself is
-- never client-side, and a restaurant with no geofence configured simply
-- skips the distance check.
-- ---------------------------------------------------------------------
create or replace function public.clock_in(
  p_restaurant_id uuid,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_restaurant public.restaurants%rowtype;
  v_distance numeric;
  v_shift_id uuid;
begin
  v_member_id := public.auth_member_id(p_restaurant_id);
  if v_member_id is null then
    raise exception 'Not an active staff member of this restaurant' using errcode = 'P0021';
  end if;

  select * into v_restaurant from public.restaurants where id = p_restaurant_id;
  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;
  if v_restaurant.status <> 'active' then
    raise exception 'This restaurant is not currently active' using errcode = 'P0003';
  end if;

  if exists (
    select 1 from public.staff_shifts
    where staff_id = v_member_id and clock_out_time is null
  ) then
    raise exception 'You are already clocked in' using errcode = 'P0045';
  end if;

  if v_restaurant.latitude is not null and v_restaurant.longitude is not null then
    if p_latitude is null or p_longitude is null then
      raise exception 'Location is required to clock in at this restaurant' using errcode = 'P0046';
    end if;

    v_distance := public.geo_distance_meters(
      p_latitude, p_longitude, v_restaurant.latitude, v_restaurant.longitude
    );

    if v_distance > v_restaurant.geofence_radius_meters then
      raise exception 'You are % m away — clock-in is allowed within % m of %',
        round(v_distance), v_restaurant.geofence_radius_meters, v_restaurant.name
        using errcode = 'P0047';
    end if;
  end if;

  insert into public.staff_shifts (
    restaurant_id, staff_id, clock_in_time, clock_in_latitude, clock_in_longitude
  )
  values (
    p_restaurant_id, v_member_id, now(),
    case when p_longitude is null then null else p_latitude end,
    case when p_latitude is null then null else p_longitude end
  )
  returning id into v_shift_id;

  return v_shift_id;
exception
  -- idx_staff_shifts_one_open_shift is the real guard against two devices
  -- clocking the same person in at once; the check above is just the
  -- friendlier message for the common case.
  when unique_violation then
    raise exception 'You are already clocked in' using errcode = 'P0045';
end;
$$;

-- ---------------------------------------------------------------------
-- clock_out: no argument closes your own open shift. Passing a shift id
-- is how a manager closes someone else's forgotten shift.
-- ---------------------------------------------------------------------
create or replace function public.clock_out(p_shift_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.staff_shifts%rowtype;
begin
  if p_shift_id is null then
    select s.* into v_shift
      from public.staff_shifts s
      join public.restaurant_members m on m.id = s.staff_id
      where m.user_id = auth.uid()
        and m.is_active
        and s.clock_out_time is null
      order by s.clock_in_time desc
      limit 1;

    if not found then
      raise exception 'You are not clocked in' using errcode = 'P0048';
    end if;
  else
    select * into v_shift from public.staff_shifts where id = p_shift_id;
    if not found then
      raise exception 'Shift not found' using errcode = 'P0049';
    end if;

    if not (
      v_shift.staff_id = public.auth_member_id(v_shift.restaurant_id)
      or public.auth_is_super_admin()
      or public.auth_has_role_in_restaurant(v_shift.restaurant_id, array['owner','manager']::member_role[])
    ) then
      raise exception 'Not authorized' using errcode = '42501';
    end if;

    if v_shift.clock_out_time is not null then
      raise exception 'That shift is already closed' using errcode = 'P0050';
    end if;
  end if;

  update public.staff_shifts set clock_out_time = now() where id = v_shift.id;
end;
$$;

-- ---------------------------------------------------------------------
-- get_active_shifts: the manager attendance view. Joins auth.users for
-- email, which is why it must be SECURITY DEFINER.
-- ---------------------------------------------------------------------
create or replace function public.get_active_shifts(p_restaurant_id uuid)
returns table (
  shift_id uuid,
  staff_id uuid,
  display_name text,
  email text,
  role member_role,
  clock_in_time timestamptz,
  clock_in_latitude numeric,
  clock_in_longitude numeric,
  total_offline_minutes integer
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
  select s.id, s.staff_id, m.display_name, u.email::text, m.role,
         s.clock_in_time, s.clock_in_latitude, s.clock_in_longitude, s.total_offline_minutes
  from public.staff_shifts s
  join public.restaurant_members m on m.id = s.staff_id
  join auth.users u on u.id = m.user_id
  where s.restaurant_id = p_restaurant_id
    and s.clock_out_time is null
  order by s.clock_in_time asc;
end;
$$;

revoke all on function public.set_restaurant_geofence(uuid, numeric, numeric, integer) from public, anon;
revoke all on function public.clock_in(uuid, numeric, numeric) from public, anon;
revoke all on function public.clock_out(uuid) from public, anon;
revoke all on function public.get_active_shifts(uuid) from public, anon;

grant execute on function public.set_restaurant_geofence(uuid, numeric, numeric, integer) to authenticated;
grant execute on function public.clock_in(uuid, numeric, numeric) to authenticated;
grant execute on function public.clock_out(uuid) to authenticated;
grant execute on function public.get_active_shifts(uuid) to authenticated;

-- Attendance is a live surface for the manager, same as the table map.
do $$ begin
  alter publication supabase_realtime add table public.staff_shifts;
exception when duplicate_object then null; end $$;

alter table public.staff_shifts replica identity full;
