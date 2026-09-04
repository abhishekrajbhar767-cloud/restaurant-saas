-- 0023_operational_timers.sql
--
-- Turnaround needs history that tables.status alone cannot provide: the
-- column only ever holds the current state, so once a table is cleared the
-- fact that it was occupied for 90 minutes is gone. table_sessions records
-- one row per seating, written by a trigger so the timing is captured no
-- matter which surface flips the status.
--
-- Request timing needs no new columns. service_requests.claimed_at is the
-- "accepted" moment (set by claim_service_request) and resolved_at is the
-- "completed" moment (set by resolve_service_request). Adding accepted_at /
-- completed_at alongside them would be two names for the same instant, free
-- to drift apart the first time one write path forgets one of them.

create table if not exists public.table_sessions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id      uuid not null references public.tables(id) on delete cascade,
  started_at    timestamptz not null default now(),
  billed_at     timestamptz,
  ended_at      timestamptz,
  constraint table_sessions_time_order check (ended_at is null or ended_at >= started_at)
);

create index if not exists idx_table_sessions_restaurant_ended
  on public.table_sessions (restaurant_id, ended_at desc);

create index if not exists idx_table_sessions_table_started
  on public.table_sessions (table_id, started_at desc);

-- A table can only be occupied by one party at a time.
create unique index if not exists idx_table_sessions_one_open
  on public.table_sessions (table_id)
  where ended_at is null;

-- Denormalised onto tables so the live map gets the timer in the same
-- realtime payload it already receives for a status change, instead of
-- needing a second subscription. The trigger below writes both together.
alter table public.tables
  add column if not exists occupied_since timestamptz;

create or replace function public.track_table_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'empty' then
    update public.table_sessions
      set ended_at = now()
      where table_id = new.id and ended_at is null;
    new.occupied_since := null;
    return new;
  end if;

  -- Any other status means someone is seated. An already-open session is
  -- reused rather than replaced, because billed -> dining is the same party
  -- ordering again and their clock should keep running from when they sat.
  select s.started_at into v_started
  from public.table_sessions s
  where s.table_id = new.id and s.ended_at is null;

  if v_started is null then
    insert into public.table_sessions (restaurant_id, table_id, started_at)
    values (new.restaurant_id, new.id, now())
    returning started_at into v_started;
  end if;

  new.occupied_since := v_started;

  if new.status = 'billed' then
    update public.table_sessions
      set billed_at = coalesce(billed_at, now())
      where table_id = new.id and ended_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_track_table_session on public.tables;
create trigger trg_track_table_session
  before update of status on public.tables
  for each row execute function public.track_table_session();

-- Tables already sitting in dining/billed predate the trigger, so give them
-- an open session starting now rather than leaving the map without a timer.
insert into public.table_sessions (restaurant_id, table_id, started_at)
select t.restaurant_id, t.id, now()
from public.tables t
where t.status <> 'empty'
  and not exists (
    select 1 from public.table_sessions s where s.table_id = t.id and s.ended_at is null
  );

update public.tables set occupied_since = now()
  where status <> 'empty' and occupied_since is null;

alter table public.table_sessions enable row level security;

drop policy if exists table_sessions_select_staff on public.table_sessions;
create policy table_sessions_select_staff
  on public.table_sessions for select
  to authenticated
  using (
    restaurant_id in (select public.auth_restaurant_ids())
    or public.auth_is_super_admin()
  );

-- ---------------------------------------------------------------------
-- get_table_turnaround: average time from seating to cleared. Attributed
-- to the day the table was cleared, which is when the turnaround actually
-- completed and the cover became sellable again.
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
-- get_staff_request_timings: how long each staff member took between
-- accepting a table request and completing it.
-- ---------------------------------------------------------------------
create or replace function public.get_staff_request_timings(p_restaurant_id uuid, p_day date default null)
returns table (
  staff_id uuid,
  display_name text,
  email text,
  role member_role,
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
  group by m.id, m.display_name, u.email, m.role
  order by count(*) desc, m.display_name nulls last;
end;
$$;

revoke all on function public.get_table_turnaround(uuid, date) from public, anon;
revoke all on function public.get_staff_request_timings(uuid, date) from public, anon;

grant execute on function public.get_table_turnaround(uuid, date) to authenticated;
grant execute on function public.get_staff_request_timings(uuid, date) to authenticated;
