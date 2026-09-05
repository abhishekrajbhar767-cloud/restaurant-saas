-- 0029_eod_reset.sql
--
-- Nothing in the schema ever ends a service day. A table_sessions row closes
-- only when someone sets tables.status = 'empty', and an order leaves the
-- kitchen board only when someone walks it to 'served' — so a table the
-- closing shift forgot to clear is still "dining" the next morning, with a
-- turnaround timer counting into its fourteenth hour, and last night's
-- untouched ticket is still the oldest card on the KDS. Both surfaces are
-- live views with no date filter, and they should stay that way: an order
-- placed at 23:50 must still be workable at 00:10 for a restaurant that
-- closes after midnight. So the fix belongs at the day boundary, not in the
-- queries.
--
-- process_eod_reset() force-closes anything left open from a previous
-- service day. It is idempotent — a second run finds nothing older than
-- today — and it is safe to run mid-service, because "stale" is always
-- measured against the restaurant's own midnight, never against a wall clock
-- offset from it.

do $$ begin
  create type session_end_reason as enum ('service', 'eod_reset');
exception when duplicate_object then null; end $$;

-- Existing rows were all closed by the floor, which is what 'service' means,
-- so the default backfills them correctly. The value on an open session is
-- meaningless until ended_at is set.
alter table public.table_sessions
  add column if not exists end_reason session_end_reason not null default 'service';

comment on column public.table_sessions.end_reason is
  'Why the session closed: ''service'' when the floor cleared the table, ''eod_reset'' when the nightly job force-closed it. Turnaround reporting averages only ''service'' sessions.';

alter table public.orders
  add column if not exists auto_closed_at timestamptz;

comment on column public.orders.auto_closed_at is
  'Set by process_eod_reset() on a ticket that was still live when its service day ended. Separates an order the floor served from one the reset settled.';

-- ---------------------------------------------------------------------
-- process_eod_reset: close out every session, table, ticket and request
-- left open from a service day that has already ended.
--
-- p_restaurant_id null means the whole fleet (the scheduler's call).
-- p_local_hour, when given, restricts the run to restaurants whose own
-- clock currently reads that hour — see the comment in the loop.
-- ---------------------------------------------------------------------
create or replace function public.process_eod_reset(
  p_restaurant_id uuid default null,
  p_local_hour integer default null
)
returns table (
  restaurant_id      uuid,
  restaurant_name    text,
  day_start          timestamptz,
  sessions_closed    integer,
  tables_cleared     integer,
  orders_closed      integer,
  requests_cancelled integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now        timestamptz := now();
  v_claims     jsonb;
  v_internal   boolean;
  v_restaurant record;
  v_day_start  timestamptz;
  v_stale      uuid[];
begin
  -- pg_cron and psql reach the database directly, with no PostgREST claims
  -- to read, and an Edge Function scheduling this presents the service role
  -- key. Either one *is* the job, so there is no membership to check. Every
  -- other caller arrives with a user JWT and has to earn the call.
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_internal := v_claims is null or coalesce(v_claims ->> 'role', '') = 'service_role';

  if not v_internal then
    if p_restaurant_id is null then
      -- A fleet-wide reset is a platform action, never a tenant one.
      if not public.auth_is_super_admin() then
        raise exception 'Not authorized' using errcode = '42501';
      end if;
    elsif not (
      public.auth_is_super_admin()
      or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
    ) then
      raise exception 'Not authorized' using errcode = '42501';
    end if;
  end if;

  if p_local_hour is not null and (p_local_hour < 0 or p_local_hour > 23) then
    raise exception 'p_local_hour must be between 0 and 23' using errcode = 'P0051';
  end if;

  for v_restaurant in
    select r.id, r.name, coalesce(nullif(r.timezone, ''), 'UTC') as tz
    from public.restaurants r
    where p_restaurant_id is null or r.id = p_restaurant_id
    order by r.name
  loop
    -- Each tenant gets its own subtransaction. restaurants.timezone is free
    -- text and `at time zone` throws on a value Postgres does not recognise,
    -- so without this one typo would abort the reset for the entire fleet
    -- and go unnoticed until morning.
    begin
      -- One nightly run cannot be nightly for a fleet spanning timezones:
      -- 03:00 UTC is 08:30 in Kolkata, mid-breakfast. So the scheduler ticks
      -- hourly and names the local hour it wants, and each restaurant is
      -- only reset on the tick that lands inside 03:00 on its own clock.
      -- Offsets of 30 or 45 minutes still land in exactly one hourly tick,
      -- so no restaurant is reset twice or skipped. Manual runs pass null.
      continue when p_local_hour is not null
        and extract(hour from (v_now at time zone v_restaurant.tz))::int <> p_local_hour;

      -- The restaurant's own midnight. Everything below is stale relative to
      -- this and nothing from the current service day is ever touched.
      v_day_start := public.restaurant_day_start(v_restaurant.id, null);
      continue when v_day_start is null;

      -- Sessions opened before today have no one sitting at them — unless
      -- the party carried over past midnight and ordered again, which the
      -- live ticket proves. Those are left open so the table, its timer and
      -- its order stay consistent with each other; tomorrow's run collects
      -- them once that ticket is stale too.
      --
      -- ended_at is now() rather than midnight because that is when the row
      -- was actually settled; end_reason is what keeps the inflated duration
      -- out of the turnaround averages.
      with closed_sessions as (
        update public.table_sessions s
           set ended_at = v_now,
               end_reason = 'eod_reset'
         where s.restaurant_id = v_restaurant.id
           and s.ended_at is null
           and s.started_at < v_day_start
           and not exists (
             select 1
             from public.orders o
             where o.table_id = s.table_id
               and o.status in ('placed', 'accepted', 'preparing', 'ready')
               and o.created_at >= v_day_start
           )
        returning s.table_id
      )
      select coalesce(array_agg(cs.table_id), '{}'::uuid[])
        into v_stale
        from closed_sessions cs;

      sessions_closed := coalesce(array_length(v_stale, 1), 0);

      -- Clearing the floor is a plain status write so trg_track_table_session
      -- still runs and drops occupied_since with it. The second branch
      -- catches a table left non-empty with no open session at all — drift
      -- from a hand-edited row — but only if it was not seated today, so a
      -- manual mid-service run can never clear a table with guests at it.
      with cleared as (
        update public.tables t
           set status = 'empty'
         where t.restaurant_id = v_restaurant.id
           and t.status <> 'empty'
           and (
             t.id = any(v_stale)
             or (
               not exists (
                 select 1
                 from public.table_sessions s
                 where s.table_id = t.id
                   and s.ended_at is null
               )
               and (t.occupied_since is null or t.occupied_since < v_day_start)
             )
           )
        returning t.id
      )
      select count(*)::int into tables_cleared from cleared;

      -- Yesterday's live tickets are settled, not cancelled. The food went
      -- out even if nobody tapped the last button, and get_eod_summary counts
      -- every order that is not cancelled or voided — cancelling here would
      -- quietly erase takings that were already banked. The intermediate
      -- timestamps stay null because those steps genuinely never happened,
      -- and auto_closed_at records that the reset closed the ticket rather
      -- than a waiter.
      with closed_orders as (
        update public.orders o
           set status = 'served',
               served_at = coalesce(o.served_at, v_now),
               auto_closed_at = v_now
         where o.restaurant_id = v_restaurant.id
           and o.status in ('placed', 'accepted', 'preparing', 'ready')
           and o.created_at < v_day_start
        returning o.id
      )
      select count(*)::int into orders_closed from closed_orders;

      -- Open requests are the same stale-dashboard problem: the manager's
      -- queue filters on status, not on date. 'cancelled' rather than
      -- 'resolved' because nobody attended these, and
      -- get_staff_request_timings only credits resolved ones — so this
      -- cannot inflate anyone's numbers.
      with closed_requests as (
        update public.service_requests sr
           set status = 'cancelled',
               resolved_at = coalesce(sr.resolved_at, v_now)
         where sr.restaurant_id = v_restaurant.id
           and sr.status in ('pending', 'claimed')
           and sr.created_at < v_day_start
        returning sr.id
      )
      select count(*)::int into requests_cancelled from closed_requests;

      restaurant_id := v_restaurant.id;
      restaurant_name := v_restaurant.name;
      day_start := v_day_start;
      return next;
    exception when others then
      -- A run aimed at one restaurant is somebody waiting for an answer, so
      -- it fails loudly. A fleet run is the scheduler, and it is worth more
      -- to reset the other tenants than to abort on one: this restaurant is
      -- rolled back to where it started, warned about in the Postgres log
      -- and cron.job_run_details, and left out of the returned rows.
      if p_restaurant_id is not null then
        raise;
      end if;
      raise warning 'process_eod_reset skipped restaurant % (%): %',
        v_restaurant.id, v_restaurant.name, sqlerrm;
    end;
  end loop;
end;
$$;

comment on function public.process_eod_reset(uuid, integer) is
  'Force-closes table sessions, tables, orders and service requests left open from a previous service day, per restaurant timezone. Idempotent. Called hourly by the eod_reset_hourly cron job with p_local_hour = 3.';

revoke all on function public.process_eod_reset(uuid, integer) from public, anon;
grant execute on function public.process_eod_reset(uuid, integer) to authenticated;

-- service_role exists on Supabase but not in a bare Postgres, and this
-- migration has to apply to both.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.process_eod_reset(uuid, integer) to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- get_table_turnaround: unchanged except that force-closed sessions are
-- excluded. A session the reset settled ran for however long the table sat
-- dirty overnight, which is not a turnaround; leaving it in would drag an
-- otherwise honest 45-minute average into the hundreds of minutes and make
-- the number the report exists for useless. open_sessions still counts
-- everything currently open, reset or not.
-- ---------------------------------------------------------------------
create or replace function public.get_table_turnaround(p_restaurant_id uuid, p_day date default null)
returns table (
  completed_sessions integer,
  average_minutes numeric,
  longest_minutes integer,
  open_sessions integer
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
  with done as (
    select (extract(epoch from (s.ended_at - s.started_at)) / 60)::numeric as minutes
    from public.table_sessions s
    where s.restaurant_id = p_restaurant_id
      and s.ended_at >= v_start
      and s.ended_at < v_end
      and s.end_reason = 'service'
  )
  select
    (select count(*)::int from done),
    (select round(avg(minutes), 1) from done),
    (select coalesce(max(minutes), 0)::int from done),
    (
      select count(*)::int
      from public.table_sessions s
      where s.restaurant_id = p_restaurant_id and s.ended_at is null
    );
end;
$$;

-- ---------------------------------------------------------------------
-- Scheduling. pg_cron is an opt-in extension (Database -> Extensions in the
-- dashboard) and enabling it needs privileges a migration cannot assume, so
-- this registers the job when the extension is already there and otherwise
-- tells the operator what is missing rather than failing the migration.
-- The equivalent by hand, or from an Edge Function, is in the README.
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not enabled: public.process_eod_reset() will not run on a schedule. Enable the extension and see the "Nightly end-of-day reset" section of the README.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'eod_reset_hourly') then
    perform cron.unschedule('eod_reset_hourly');
  end if;

  -- Hourly, not nightly: the function itself decides which restaurants are
  -- at 03:00 on their own clock, which is the only way one schedule can
  -- serve tenants in different timezones.
  perform cron.schedule(
    'eod_reset_hourly',
    '0 * * * *',
    'select public.process_eod_reset(null, 3);'
  );
end $$;
