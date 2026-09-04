-- 0024_customer_feedback.sql
--
-- Internal 1-5 star ratings plus the owner's public Google review link.
--
-- Customers are anonymous, so every write here goes through a SECURITY
-- DEFINER RPC granted to anon rather than an INSERT policy. customer_ratings
-- gets no anon SELECT policy at all: a table of per-waiter scores readable
-- with the public key would be a staff-performance leak, so the customer
-- reads back only their own order's rating through get_customer_rating().

create table if not exists public.customer_ratings (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- One rating per order. Re-rating updates the row instead of stacking.
  order_id      uuid not null unique references public.orders(id) on delete cascade,
  staff_id      uuid references public.restaurant_members(id) on delete set null,
  rating_value  smallint not null check (rating_value between 1 and 5),
  created_at    timestamptz not null default now()
);

create index if not exists idx_customer_ratings_restaurant_created
  on public.customer_ratings (restaurant_id, created_at desc);

create index if not exists idx_customer_ratings_staff
  on public.customer_ratings (staff_id, created_at desc);

alter table public.customer_ratings enable row level security;

drop policy if exists customer_ratings_select_staff on public.customer_ratings;
create policy customer_ratings_select_staff
  on public.customer_ratings for select
  to authenticated
  using (
    restaurant_id in (select public.auth_restaurant_ids())
    or public.auth_is_super_admin()
  );

alter table public.restaurants
  add column if not exists google_review_url text;

do $$ begin
  alter table public.restaurants
    add constraint restaurants_google_review_url_format
    check (google_review_url is null or google_review_url ~* '^https?://');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- submit_customer_rating: called by the anonymous customer from their
-- order tracking page.
-- ---------------------------------------------------------------------
create or replace function public.submit_customer_rating(p_order_id uuid, p_rating integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_window timestamptz;
  v_staff_id uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0045';
  end if;

  -- The same 24h capability window the anon SELECT policies use: once an
  -- order stops being visible to the customer it stops being ratable, so a
  -- leaked order id cannot be used to farm ratings later.
  if v_order.created_at < now() - interval '24 hours'
     or v_order.status in ('cancelled', 'voided') then
    raise exception 'This order can no longer be rated' using errcode = 'P0046';
  end if;

  -- There is no order -> waiter column anywhere in the schema, so the rating
  -- is attributed to whoever last picked up a request for this table during
  -- the current seating. No requests means no attribution, and the rating
  -- still counts toward the restaurant as a whole.
  select t.occupied_since into v_window
  from public.tables t
  where t.id = v_order.table_id;

  v_window := coalesce(v_window, v_order.created_at);

  select sr.claimed_by into v_staff_id
  from public.service_requests sr
  where sr.table_id = v_order.table_id
    and sr.claimed_by is not null
    and sr.claimed_at >= v_window
  order by sr.claimed_at desc
  limit 1;

  insert into public.customer_ratings (restaurant_id, order_id, staff_id, rating_value)
  values (v_order.restaurant_id, p_order_id, v_staff_id, p_rating)
  on conflict (order_id) do update
    set rating_value = excluded.rating_value,
        staff_id = excluded.staff_id;
end;
$$;

-- Scoped to a single order id the caller already holds, so this never
-- exposes the wider ratings table to the public key.
create or replace function public.get_customer_rating(p_order_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select r.rating_value::int
  from public.customer_ratings r
  join public.orders o on o.id = r.order_id
  where r.order_id = p_order_id
    and o.created_at >= now() - interval '24 hours';
$$;

-- ---------------------------------------------------------------------
-- set_restaurant_google_review_url: restaurants_update_owner_settings is
-- owner-only, but /admin/settings is open to managers too.
-- ---------------------------------------------------------------------
create or replace function public.set_restaurant_google_review_url(p_restaurant_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_url := nullif(btrim(coalesce(p_url, '')), '');

  if v_url is not null and v_url !~* '^https?://' then
    raise exception 'Review link must start with http:// or https://' using errcode = '22023';
  end if;

  update public.restaurants
    set google_review_url = v_url,
        updated_at = now()
    where id = p_restaurant_id;

  if not found then
    raise exception 'Restaurant not found' using errcode = 'P0044';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- get_staff_ratings: average score per waiter for the day. Ratings that
-- could not be attributed to anyone come back as a single staff_id = null
-- row rather than being dropped, so the floor-wide average stays honest.
-- ---------------------------------------------------------------------
create or replace function public.get_staff_ratings(p_restaurant_id uuid, p_day date default null)
returns table (
  staff_id uuid,
  display_name text,
  email text,
  role member_role,
  rating_count integer,
  average_rating numeric
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
    r.staff_id,
    m.display_name,
    u.email::text,
    m.role,
    count(*)::int,
    round(avg(r.rating_value)::numeric, 2)
  from public.customer_ratings r
  left join public.restaurant_members m on m.id = r.staff_id
  left join auth.users u on u.id = m.user_id
  where r.restaurant_id = p_restaurant_id
    and r.created_at >= v_start
    and r.created_at < v_end
  group by r.staff_id, m.display_name, u.email, m.role
  order by round(avg(r.rating_value)::numeric, 2) desc, count(*) desc;
end;
$$;

revoke all on function public.submit_customer_rating(uuid, integer) from public;
revoke all on function public.get_customer_rating(uuid) from public;
revoke all on function public.set_restaurant_google_review_url(uuid, text) from public, anon;
revoke all on function public.get_staff_ratings(uuid, date) from public, anon;

grant execute on function public.submit_customer_rating(uuid, integer) to anon, authenticated;
grant execute on function public.get_customer_rating(uuid) to anon, authenticated;
grant execute on function public.set_restaurant_google_review_url(uuid, text) to authenticated;
grant execute on function public.get_staff_ratings(uuid, date) to authenticated;
