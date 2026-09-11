-- 0036_table_waiter_assignment.sql
--
-- A table needs an owner while it's being worked, not just a status. Without
-- this, two waiters can both act on the same table from their own phones —
-- one seats it, another clears it — with no record of who is actually
-- serving it. assigned_waiter_id makes that explicit and lets set_table_status
-- refuse a write from a waiter who isn't the one holding the table.
--
-- The new order_status value lives here too so it is committed before
-- 0037 references it — Postgres will not let a freshly added enum value be
-- used inside the same transaction that added it.

alter type order_status add value if not exists 'pending_waiter_approval';

alter table public.tables
  add column if not exists assigned_waiter_id uuid references public.restaurant_members(id) on delete set null;

alter table public.table_sessions
  add column if not exists assigned_waiter_id uuid references public.restaurant_members(id) on delete set null;

create index if not exists idx_tables_assigned_waiter on public.tables (assigned_waiter_id) where assigned_waiter_id is not null;

-- ---------------------------------------------------------------------
-- track_table_session: mirror the table's current assignment onto its open
-- session row, same denormalisation pattern already used for occupied_since.
-- ---------------------------------------------------------------------
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
    -- Cleared here (not just in set_table_status) so a table freed by any
    -- path — the EOD reset's direct status write included — always drops
    -- its assignment along with it. An empty table belongs to no one.
    new.assigned_waiter_id := null;
    return new;
  end if;

  -- Any other status means someone is seated. An already-open session is
  -- reused rather than replaced, because billed -> dining is the same party
  -- ordering again and their clock should keep running from when they sat.
  select s.started_at into v_started
  from public.table_sessions s
  where s.table_id = new.id and s.ended_at is null;

  if v_started is null then
    insert into public.table_sessions (restaurant_id, table_id, started_at, assigned_waiter_id)
    values (new.restaurant_id, new.id, now(), new.assigned_waiter_id)
    returning started_at into v_started;
  else
    update public.table_sessions
      set assigned_waiter_id = new.assigned_waiter_id
      where table_id = new.id and ended_at is null;
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

-- ---------------------------------------------------------------------
-- set_table_status: now also the ownership gate. A waiter seating a free
-- table claims it automatically; a waiter cannot free or re-seat a table
-- already claimed by someone else. Owners/managers are exempt (the live
-- map has to be able to override a forgotten or disputed table), and
-- freeing a table always drops its assignment — an empty table belongs to
-- no one.
-- ---------------------------------------------------------------------
create or replace function public.set_table_status(p_table_id uuid, p_status table_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id     uuid;
  v_current_status    table_status;
  v_current_waiter    uuid;
  v_caller_member_id  uuid;
  v_caller_is_manager boolean;
begin
  select restaurant_id, status, assigned_waiter_id
    into v_restaurant_id, v_current_status, v_current_waiter
  from public.tables
  where id = p_table_id and is_active
  for update;

  if not found then
    raise exception 'Invalid or inactive table' using errcode = 'P0002';
  end if;

  v_caller_is_manager := public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(v_restaurant_id, array['owner','manager']::member_role[]);

  if not (
    v_caller_is_manager
    or public.auth_has_role_in_restaurant(v_restaurant_id, array['waiter']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_caller_member_id := public.auth_member_id(v_restaurant_id);

  if not v_caller_is_manager and v_current_waiter is not null and v_current_waiter <> v_caller_member_id then
    raise exception 'This table is assigned to another waiter' using errcode = 'P0051';
  end if;

  update public.tables
    set status = p_status,
        assigned_waiter_id = case
          when p_status = 'empty' then null
          when v_caller_is_manager then assigned_waiter_id
          else coalesce(assigned_waiter_id, v_caller_member_id)
        end
    where id = p_table_id and status <> p_status;
end;
$$;

-- ---------------------------------------------------------------------
-- assign_table_to_self: lets a waiter claim a table that is already
-- occupied but unowned (seated by a manager, or seated before this feature
-- existed) without touching its status. Refuses if someone else already
-- holds it.
-- ---------------------------------------------------------------------
create or replace function public.assign_table_to_self(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id  uuid;
  v_current_waiter uuid;
  v_member_id      uuid;
begin
  select restaurant_id, assigned_waiter_id
    into v_restaurant_id, v_current_waiter
  from public.tables
  where id = p_table_id and is_active
  for update;

  if not found then
    raise exception 'Invalid or inactive table' using errcode = 'P0002';
  end if;

  if not public.auth_has_role_in_restaurant(v_restaurant_id, array['waiter']::member_role[]) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_member_id := public.auth_member_id(v_restaurant_id);

  if v_current_waiter is not null and v_current_waiter <> v_member_id then
    raise exception 'This table is assigned to another waiter' using errcode = 'P0051';
  end if;

  update public.tables set assigned_waiter_id = v_member_id where id = p_table_id;
end;
$$;

-- ---------------------------------------------------------------------
-- release_table_assignment: the assigned waiter hands the table back
-- (without freeing it — a manager reassigns it, or another waiter is
-- covering). Owners/managers may release any table.
-- ---------------------------------------------------------------------
create or replace function public.release_table_assignment(p_table_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id  uuid;
  v_current_waiter uuid;
  v_member_id      uuid;
  v_is_manager     boolean;
begin
  select restaurant_id, assigned_waiter_id
    into v_restaurant_id, v_current_waiter
  from public.tables
  where id = p_table_id and is_active
  for update;

  if not found then
    raise exception 'Invalid or inactive table' using errcode = 'P0002';
  end if;

  v_is_manager := public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(v_restaurant_id, array['owner','manager']::member_role[]);
  v_member_id := public.auth_member_id(v_restaurant_id);

  if not (v_is_manager or v_current_waiter = v_member_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.tables set assigned_waiter_id = null where id = p_table_id;
end;
$$;

revoke all on function public.assign_table_to_self(uuid) from public, anon;
revoke all on function public.release_table_assignment(uuid) from public, anon;

grant execute on function public.assign_table_to_self(uuid) to authenticated;
grant execute on function public.release_table_assignment(uuid) to authenticated;
