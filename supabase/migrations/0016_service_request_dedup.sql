-- 0016_service_request_dedup.sql
--
-- Customers were spamming the Call Waiter / Water / Bill buttons and the
-- waiter dashboard filled up with duplicate active requests for the same
-- table. 0006's create_service_request() already checked for an existing
-- active request, but check-then-insert is not atomic: two quick taps race
-- past the check and both insert. This migration makes duplicates impossible
-- at the database level and gives the customer app a distinguishable error
-- so it can show a polite "already requested" message.

-- 1) Clean up duplicates that already exist (keep the newest active request
--    per table+type; the older spam taps are marked cancelled and vanish
--    from the waiter dashboard like any other cancelled request).
with ranked as (
  select id,
         row_number() over (partition by table_id, type order by created_at desc) as rn
  from public.service_requests
  where status in ('pending', 'claimed')
)
update public.service_requests r
set status = 'cancelled',
    resolved_at = now()
from ranked
where ranked.id = r.id
  and ranked.rn > 1;

-- 2) Hard guarantee: at most ONE active ('pending' or 'claimed') request per
--    table per type. Even concurrent racing inserts now conflict here.
create unique index if not exists service_requests_one_active_per_table_type
  on public.service_requests (table_id, type)
  where status in ('pending', 'claimed');

-- 3) Rebuilt request entry point. The old version silently returned the
--    existing request's id, which the customer app couldn't tell apart from
--    a fresh request — so it kept saying "request sent" and customers kept
--    tapping. Now duplicates raise a stable, parseable token.
create or replace function public.create_service_request(p_qr_token uuid, p_type service_request_type)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.tables%rowtype;
  v_restaurant_status restaurant_status;
  v_id uuid;
begin
  select * into v_table from public.tables where qr_token = p_qr_token and is_active;
  if not found then
    raise exception 'Invalid or inactive table' using errcode = 'P0002';
  end if;

  select status into v_restaurant_status from public.restaurants where id = v_table.restaurant_id;
  if v_restaurant_status <> 'active' then
    raise exception 'Restaurant is not currently active' using errcode = 'P0003';
  end if;

  -- No pre-check needed: attempt the insert and let the partial unique index
  -- decide. This is atomic, so nothing can race past it.
  begin
    insert into public.service_requests (restaurant_id, table_id, type, status)
    values (v_table.restaurant_id, v_table.id, p_type, 'pending')
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'ALREADY_REQUESTED' using errcode = 'P0004';
  end;

  return v_id;
end;
$$;

grant execute on function public.create_service_request(uuid, service_request_type) to anon, authenticated;
