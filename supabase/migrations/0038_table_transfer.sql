-- 0038_table_transfer.sql
--
-- A waiter going on break, clocking out, or just getting swamped needs to
-- hand a seated table to a colleague without a manager in the loop. This
-- adds that handover plus the narrow, waiter-safe roster it needs to pick a
-- target from.
--
-- Approval/management rights need no extra plumbing: approve_waiter_order
-- and reject_waiter_order (0037) always re-read tables.assigned_waiter_id
-- at call time rather than trusting a snapshot, so the instant this RPC
-- moves that column, any orders still awaiting approval on the table are
-- already the new waiter's to act on.

-- ---------------------------------------------------------------------
-- track_table_session: widen the trigger to also fire on an
-- assignment-only write (a transfer never touches status), and mirror it
-- onto the open session without disturbing the status-change branches
-- below, which are unchanged.
-- ---------------------------------------------------------------------
drop trigger if exists trg_track_table_session on public.tables;

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
    -- Status didn't change, so this fired for an assigned_waiter_id-only
    -- write (a transfer). Mirror it onto the open session if the table is
    -- currently occupied; an empty table has no open session to update.
    if new.assigned_waiter_id is distinct from old.assigned_waiter_id and new.status <> 'empty' then
      update public.table_sessions
        set assigned_waiter_id = new.assigned_waiter_id
        where table_id = new.id and ended_at is null;
    end if;
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

create trigger trg_track_table_session
  before update of status, assigned_waiter_id on public.tables
  for each row execute function public.track_table_session();

-- ---------------------------------------------------------------------
-- get_on_duty_waiters: the transfer target list. Deliberately narrow (just
-- id + name) and open to any authenticated staff member of the restaurant —
-- unlike get_restaurant_staff (owner/manager only, full roster with email),
-- a waiter picking a handover target only needs to know who is clocked in
-- right now, not their contact details.
-- ---------------------------------------------------------------------
create or replace function public.get_on_duty_waiters(p_restaurant_id uuid)
returns table (member_id uuid, display_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager','kitchen','waiter']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select m.id, m.display_name
  from public.restaurant_members m
  where m.restaurant_id = p_restaurant_id
    and m.role = 'waiter'
    and m.is_active
    and exists (
      select 1 from public.staff_shifts s
      where s.staff_id = m.id and s.clock_out_time is null
    )
  order by m.display_name asc nulls last;
end;
$$;

-- ---------------------------------------------------------------------
-- transfer_table: hand a seated table (and everything derived from its
-- assignment) to another waiter. Only the waiter currently holding it, or
-- an owner/manager, may initiate one; the target must be an active,
-- currently clocked-in waiter of the same restaurant.
-- ---------------------------------------------------------------------
create or replace function public.transfer_table(p_table_id uuid, p_to_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id     uuid;
  v_status            table_status;
  v_current_waiter    uuid;
  v_caller_member_id  uuid;
  v_caller_is_manager boolean;
  v_target            public.restaurant_members%rowtype;
  v_target_on_duty    boolean;
begin
  select restaurant_id, status, assigned_waiter_id
    into v_restaurant_id, v_status, v_current_waiter
  from public.tables
  where id = p_table_id and is_active
  for update;

  if not found then
    raise exception 'Invalid or inactive table' using errcode = 'P0002';
  end if;

  if v_status = 'empty' then
    raise exception 'Table is not currently seated' using errcode = 'P0053';
  end if;

  v_caller_is_manager := public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(v_restaurant_id, array['owner','manager']::member_role[]);
  v_caller_member_id := public.auth_member_id(v_restaurant_id);

  if not (
    v_caller_is_manager
    or (v_current_waiter is not null and v_current_waiter = v_caller_member_id)
  ) then
    raise exception 'Only the assigned waiter or a manager can transfer this table' using errcode = 'P0054';
  end if;

  select * into v_target
  from public.restaurant_members
  where id = p_to_member_id and restaurant_id = v_restaurant_id;

  if not found or v_target.role <> 'waiter' or not v_target.is_active then
    raise exception 'That colleague is not an active waiter here' using errcode = 'P0055';
  end if;

  if v_target.id = v_current_waiter then
    raise exception 'That table is already assigned to them' using errcode = 'P0056';
  end if;

  select exists (
    select 1 from public.staff_shifts s where s.staff_id = v_target.id and s.clock_out_time is null
  ) into v_target_on_duty;

  if not v_target_on_duty then
    raise exception 'That waiter is not currently clocked in' using errcode = 'P0057';
  end if;

  update public.tables set assigned_waiter_id = v_target.id where id = p_table_id;
end;
$$;

revoke all on function public.get_on_duty_waiters(uuid) from public, anon;
revoke all on function public.transfer_table(uuid, uuid) from public, anon;

grant execute on function public.get_on_duty_waiters(uuid) to authenticated;
grant execute on function public.transfer_table(uuid, uuid) to authenticated;
