-- 0017_idempotent_order_transitions.sql
--
-- update_order_status() rejected same-status transitions ("Invalid transition
-- from ready to ready"), which surfaced as errors in the KDS whenever a chef
-- double-tapped a button or two devices raced on the same ticket. The client
-- now guards against this, but the state machine itself should treat
-- "already in that state" as success — it's the definition of idempotent.

create or replace function public.update_order_status(p_order_id uuid, p_new_status order_status, p_cancellation_reason text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status order_status;
  v_valid boolean := false;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0010';
  end if;

  -- Already in the requested state: nothing to do, succeed quietly.
  if v_status = p_new_status then
    return;
  end if;

  v_valid := (v_status, p_new_status) in (
    ('accepted', 'preparing'),
    ('preparing', 'ready'),
    ('ready', 'served'),
    ('placed', 'cancelled'),
    ('accepted', 'cancelled'),
    ('preparing', 'cancelled')
  );

  if not v_valid then
    raise exception 'Invalid transition from % to %', v_status, p_new_status using errcode = 'P0013';
  end if;

  update public.orders set
    status = p_new_status,
    preparing_at = case when p_new_status = 'preparing' then now() else preparing_at end,
    ready_at = case when p_new_status = 'ready' then now() else ready_at end,
    served_at = case when p_new_status = 'served' then now() else served_at end,
    cancelled_at = case when p_new_status = 'cancelled' then now() else cancelled_at end,
    cancellation_reason = case when p_new_status = 'cancelled' then p_cancellation_reason else cancellation_reason end
  where id = p_order_id;
end;
$$;
