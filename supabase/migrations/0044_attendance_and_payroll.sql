-- 0044_attendance_and_payroll.sql
--
-- Attendance, payroll and the anti-fraud tightening around clock-in.
--
-- staff_shifts (0018/0021) stays the single source of truth for who was on
-- the clock and when. attendance_logs is a VIEW over it rather than a second
-- table: a parallel table would have to be kept in step with every clock-in,
-- clock-out and EOD force-close, and the day it drifts, payroll pays the
-- wrong number. Everything below derives from the shift rows instead.
--
-- Anti-fraud recap — two of the three guards already existed and are left
-- alone: the geofence radius is read from restaurants and compared inside
-- clock_in() (0021), and every timestamp is Postgres now(), never a value
-- the device sent. This migration adds the third: a mock-location flag the
-- client must report, which clock_in() refuses.

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------

-- Per-staff payroll terms. Null wage/salary simply means "not on payroll
-- yet" — the report still shows the attendance, with a zero payable.
alter table public.restaurant_members
  add column if not exists shift_start_time time,
  add column if not exists daily_wage numeric(10,2),
  add column if not exists monthly_salary numeric(10,2);

do $$ begin
  alter table public.restaurant_members
    add constraint restaurant_members_daily_wage_nonnegative check (daily_wage is null or daily_wage >= 0),
    add constraint restaurant_members_monthly_salary_nonnegative check (monthly_salary is null or monthly_salary >= 0);
exception when duplicate_object then null; end $$;

-- Restaurant-wide attendance policy. Defaults match the common QSR shift:
-- 10 minutes' grace, under 4h is half a day, 8h is a full one.
alter table public.restaurants
  add column if not exists late_grace_minutes integer not null default 10,
  add column if not exists half_day_max_hours numeric(4,2) not null default 4.00,
  add column if not exists full_day_min_hours numeric(4,2) not null default 8.00;

do $$ begin
  alter table public.restaurants
    add constraint restaurants_late_grace_nonnegative check (late_grace_minutes >= 0),
    add constraint restaurants_half_day_positive check (half_day_max_hours > 0),
    add constraint restaurants_full_day_positive check (full_day_min_hours > 0);
exception when duplicate_object then null; end $$;

create index if not exists idx_staff_shifts_restaurant_staff_clock_in
  on public.staff_shifts (restaurant_id, staff_id, clock_in_time desc);

-- ---------------------------------------------------------------------
-- clock_in_attempts: refused clock-ins, kept for the manager.
--
-- This is a separate table precisely because clock_in() rejects by raising,
-- and a raise rolls back everything the same call wrote — including any
-- audit row. The rejection is therefore recorded by its own RPC, in its own
-- statement, after the failed one has already unwound.
-- ---------------------------------------------------------------------
create table if not exists public.clock_in_attempts (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  staff_id        uuid not null references public.restaurant_members(id) on delete cascade,
  attempted_at    timestamptz not null default now(),
  reason          text not null check (reason in ('mock_location', 'outside_geofence')),
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  constraint clock_in_attempts_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint clock_in_attempts_longitude_range check (longitude is null or longitude between -180 and 180)
);

create index if not exists idx_clock_in_attempts_restaurant_time
  on public.clock_in_attempts (restaurant_id, attempted_at desc);

create index if not exists idx_clock_in_attempts_staff_time
  on public.clock_in_attempts (staff_id, attempted_at desc);

alter table public.clock_in_attempts enable row level security;

-- Read-only to owner/manager. Writes go exclusively through
-- record_clock_in_rejection(), which pins staff_id to the caller.
create policy clock_in_attempts_select_manager
  on public.clock_in_attempts for select
  to authenticated
  using (
    public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[])
    or public.auth_is_super_admin()
  );

-- ---------------------------------------------------------------------
-- record_clock_in_rejection: called by the server action after clock_in()
-- has already refused. staff_id comes from auth.uid(), never the caller, so
-- nobody can log an attempt against a colleague.
-- ---------------------------------------------------------------------
create or replace function public.record_clock_in_rejection(
  p_restaurant_id uuid,
  p_reason text,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if p_reason not in ('mock_location', 'outside_geofence') then
    raise exception 'Unknown rejection reason' using errcode = 'P0061';
  end if;

  v_member_id := public.auth_member_id(p_restaurant_id);
  if v_member_id is null then
    raise exception 'Not an active staff member of this restaurant' using errcode = 'P0021';
  end if;

  insert into public.clock_in_attempts (restaurant_id, staff_id, reason, latitude, longitude)
  values (p_restaurant_id, v_member_id, p_reason, p_latitude, p_longitude);
end;
$$;

revoke all on function public.record_clock_in_rejection(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.record_clock_in_rejection(uuid, text, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- orders_handled_in_window: how many live tickets landed on tables this
-- waiter was holding, inside a given window. table_sessions carries the
-- historical assignment (tables.assigned_waiter_id is current-only), so a
-- table handed over mid-service credits each waiter for their own stretch.
--
-- Security INVOKER on purpose: called from the attendance_logs view, which
-- runs as the reader, so the caller's own RLS on orders decides what counts.
-- ---------------------------------------------------------------------
create or replace function public.orders_handled_in_window(
  p_staff_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from public.orders o
  where o.created_at >= p_from
    and o.created_at < p_to
    and o.status not in ('cancelled', 'voided')
    and exists (
      select 1
      from public.table_sessions ts
      where ts.table_id = o.table_id
        and ts.assigned_waiter_id = p_staff_id
        and o.created_at >= ts.started_at
        and o.created_at < coalesce(ts.ended_at, now())
    );
$$;

revoke all on function public.orders_handled_in_window(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.orders_handled_in_window(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------
-- attendance_logs: one row per shift, shaped for reporting. Derived, never
-- written to. security_invoker keeps staff_shifts' own RLS in force, so a
-- waiter reading this sees exactly what they could already see.
-- ---------------------------------------------------------------------
create or replace view public.attendance_logs
with (security_invoker = true)
as
select
  s.id,
  s.staff_id,
  s.restaurant_id,
  (s.clock_in_time at time zone coalesce(nullif(r.timezone, ''), 'UTC'))::date as date,
  s.clock_in_time,
  s.clock_out_time,
  round((extract(epoch from (coalesce(s.clock_out_time, now()) - s.clock_in_time)) / 3600)::numeric, 2) as total_hours,
  case
    when round((extract(epoch from (coalesce(s.clock_out_time, now()) - s.clock_in_time)) / 3600)::numeric, 2)
         < r.half_day_max_hours then 'Half-day'
    when m.shift_start_time is not null
     and (s.clock_in_time at time zone coalesce(nullif(r.timezone, ''), 'UTC'))::time
         > (m.shift_start_time + make_interval(mins => r.late_grace_minutes)) then 'Late'
    else 'Present'
  end as status,
  public.orders_handled_in_window(
    s.staff_id, s.clock_in_time, coalesce(s.clock_out_time, now())
  ) as orders_handled,
  s.clock_out_time is null as is_open
from public.staff_shifts s
join public.restaurants r on r.id = s.restaurant_id
join public.restaurant_members m on m.id = s.staff_id;

grant select on public.attendance_logs to authenticated;

-- ---------------------------------------------------------------------
-- clock_in: same geofence and same server-side now(), plus the mock-location
-- refusal. p_is_mock defaults false so existing 3-argument call sites keep
-- working unchanged.
--
-- The mock test runs before the distance test on purpose: a fake GPS app
-- would otherwise sail through the geofence trivially.
-- ---------------------------------------------------------------------
create or replace function public.clock_in(
  p_restaurant_id uuid,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_is_mock boolean default false
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

  if coalesce(p_is_mock, false) then
    raise exception 'MOCK_LOCATION: turn off any fake GPS or developer mock-location app and try again'
      using errcode = 'P0058';
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
  when unique_violation then
    raise exception 'You are already clocked in' using errcode = 'P0045';
end;
$$;

revoke all on function public.clock_in(uuid, numeric, numeric, boolean) from public, anon;
grant execute on function public.clock_in(uuid, numeric, numeric, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- set_staff_payroll: shift start time and pay terms for one member.
-- ---------------------------------------------------------------------
create or replace function public.set_staff_payroll(
  p_member_id uuid,
  p_shift_start_time time default null,
  p_daily_wage numeric default null,
  p_monthly_salary numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  select restaurant_id into v_restaurant_id
  from public.restaurant_members where id = p_member_id;

  if v_restaurant_id is null then
    raise exception 'Staff member not found' using errcode = 'P0021';
  end if;

  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(v_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Nulls here mean "clear this term", not "leave alone" — the payroll form
  -- always submits all three together for one member.
  update public.restaurant_members
    set shift_start_time = p_shift_start_time,
        daily_wage = p_daily_wage,
        monthly_salary = p_monthly_salary,
        updated_at = now()
    where id = p_member_id;
end;
$$;

revoke all on function public.set_staff_payroll(uuid, time, numeric, numeric) from public, anon;
grant execute on function public.set_staff_payroll(uuid, time, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- get_restaurant_staff: carry the payroll terms so the payroll screen can
-- edit them without a second roster query. Return type changes, so the
-- function is dropped and recreated (same reason as 0012 and 0035).
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
  can_handle_billing boolean,
  shift_start_time time,
  daily_wage numeric,
  monthly_salary numeric
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
         ws.availability, m.can_take_orders, m.can_handle_billing,
         m.shift_start_time, m.daily_wage, m.monthly_salary
  from public.restaurant_members m
  join auth.users u on u.id = m.user_id
  left join public.waiter_status ws on ws.member_id = m.id
  where m.restaurant_id = p_restaurant_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.get_restaurant_staff(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- get_attendance_report: one row per staff member per worked day inside the
-- range. Split shifts collapse into a single day: hours add up, the first
-- clock-in decides lateness, the last clock-out ends the day.
--
-- Status precedence is deliberate — a day too short to count is a Half-day
-- whether or not the person also arrived late, because that is the figure
-- payroll pays on.
-- ---------------------------------------------------------------------
create or replace function public.get_attendance_report(
  p_restaurant_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  staff_id uuid,
  display_name text,
  email text,
  role member_role,
  work_date date,
  first_clock_in timestamptz,
  last_clock_out timestamptz,
  total_hours numeric,
  status text,
  orders_handled integer,
  shift_start_time time,
  is_open boolean,
  flagged_mock boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_grace integer;
  v_half numeric;
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'A start and end date are required' using errcode = 'P0059';
  end if;
  if p_end_date < p_start_date then
    raise exception 'The end date cannot be before the start date' using errcode = 'P0060';
  end if;

  select coalesce(nullif(r.timezone, ''), 'UTC'), r.late_grace_minutes, r.half_day_max_hours
    into v_tz, v_grace, v_half
  from public.restaurants r where r.id = p_restaurant_id;

  if v_tz is null then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;

  -- Half-open window in the restaurant's own timezone, so a range ending
  -- "today" includes everything up to midnight tonight local, not UTC.
  v_from := p_start_date::timestamp at time zone v_tz;
  v_to := (p_end_date + 1)::timestamp at time zone v_tz;

  return query
  with per_day as (
    select
      s.staff_id as sid,
      (s.clock_in_time at time zone v_tz)::date as d,
      min(s.clock_in_time) as first_in,
      max(s.clock_out_time) as last_out,
      bool_or(s.clock_out_time is null) as open_shift,
      round(sum(extract(epoch from (coalesce(s.clock_out_time, now()) - s.clock_in_time)) / 3600)::numeric, 2) as hours,
      sum(public.orders_handled_in_window(s.staff_id, s.clock_in_time, coalesce(s.clock_out_time, now())))::integer as orders
    from public.staff_shifts s
    where s.restaurant_id = p_restaurant_id
      and s.clock_in_time >= v_from
      and s.clock_in_time < v_to
    group by s.staff_id, (s.clock_in_time at time zone v_tz)::date
  )
  select
    pd.sid,
    m.display_name,
    u.email::text,
    m.role,
    pd.d,
    pd.first_in,
    case when pd.open_shift then null else pd.last_out end,
    pd.hours,
    case
      when pd.hours < v_half then 'Half-day'
      when m.shift_start_time is not null
       and (pd.first_in at time zone v_tz)::time > (m.shift_start_time + make_interval(mins => v_grace))
        then 'Late'
      else 'Present'
    end::text,
    coalesce(pd.orders, 0),
    m.shift_start_time,
    pd.open_shift,
    exists (
      select 1 from public.clock_in_attempts a
      where a.staff_id = pd.sid
        and a.reason = 'mock_location'
        and (a.attempted_at at time zone v_tz)::date = pd.d
    )
  from per_day pd
  join public.restaurant_members m on m.id = pd.sid
  join auth.users u on u.id = m.user_id
  order by m.display_name asc nulls last, pd.d asc;
end;
$$;

revoke all on function public.get_attendance_report(uuid, date, date) from public, anon;
grant execute on function public.get_attendance_report(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- get_payroll_summary: the same window, rolled up to one row per member,
-- with the payable amount.
--
-- Rate: daily_wage wins when set; otherwise monthly_salary is divided by 30
-- to get a day rate, which is the convention that survives a range
-- straddling two months. A Late day pays in full — it is an arrival flag,
-- not a deduction — and a Half-day pays half.
-- ---------------------------------------------------------------------
create or replace function public.get_payroll_summary(
  p_restaurant_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  staff_id uuid,
  display_name text,
  email text,
  role member_role,
  present_days integer,
  late_days integer,
  half_days integer,
  days_worked integer,
  total_hours numeric,
  orders_handled integer,
  daily_wage numeric,
  monthly_salary numeric,
  effective_daily_rate numeric,
  payable_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- get_attendance_report re-runs the same authorization and validation, so
  -- a caller cannot reach this with a range it would have rejected.
  return query
  with report as (
    select * from public.get_attendance_report(p_restaurant_id, p_start_date, p_end_date)
  ),
  rolled as (
    select
      r.staff_id as sid,
      count(*) filter (where r.status = 'Present')::integer as presents,
      count(*) filter (where r.status = 'Late')::integer as lates,
      count(*) filter (where r.status = 'Half-day')::integer as halves,
      count(*)::integer as worked,
      round(sum(r.total_hours)::numeric, 2) as hours,
      sum(r.orders_handled)::integer as orders
    from report r
    group by r.staff_id
  )
  select
    rl.sid,
    m.display_name,
    u.email::text,
    m.role,
    rl.presents,
    rl.lates,
    rl.halves,
    rl.worked,
    rl.hours,
    coalesce(rl.orders, 0),
    m.daily_wage,
    m.monthly_salary,
    rate.daily_rate,
    round(((rl.presents + rl.lates) * rate.daily_rate) + (rl.halves * rate.daily_rate * 0.5), 2)
  from rolled rl
  join public.restaurant_members m on m.id = rl.sid
  join auth.users u on u.id = m.user_id
  cross join lateral (
    select coalesce(m.daily_wage, m.monthly_salary / 30.0, 0)::numeric as daily_rate
  ) rate
  order by m.display_name asc nulls last;
end;
$$;

revoke all on function public.get_payroll_summary(uuid, date, date) from public, anon;
grant execute on function public.get_payroll_summary(uuid, date, date) to authenticated;
