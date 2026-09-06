-- 0032_subscriptions.sql
--
-- Per-restaurant billing window for the Super Admin dashboard: plan type,
-- free-trial end, paid expiry, and a derived status (trialing / active /
-- expired). One row per restaurant. Super Admin is the only writer; owners
-- can read their own row so a later "trial ending" banner can reuse it.
--
-- New restaurants get a 14-day trial automatically. Status is recomputed
-- on every write and again in get_restaurant_overview() so the dashboard
-- stays accurate even without a cron job.

-- ---------------------------------------------------------------------
-- table
-- ---------------------------------------------------------------------

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  plan_type text not null default 'trial'
    check (plan_type in ('trial', 'monthly', 'annual')),
  trial_ends_at timestamptz,
  expires_at timestamptz,
  status text not null default 'trialing'
    check (status in ('active', 'expired', 'trialing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_trial_ends_at on public.subscriptions(trial_ends_at);
create index if not exists idx_subscriptions_expires_at on public.subscriptions(expires_at);

comment on table public.subscriptions is
  'Platform billing window for each restaurant. Written only by Super Admin.';

-- ---------------------------------------------------------------------
-- derived status (stable: reads now(); not immutable)
-- ---------------------------------------------------------------------

create or replace function public.subscription_effective_status(
  p_plan_type text,
  p_trial_ends_at timestamptz,
  p_expires_at timestamptz
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_plan_type = 'trial' then
      case
        when p_trial_ends_at is not null and p_trial_ends_at > now() then 'trialing'
        else 'expired'
      end
    else
      case
        when p_expires_at is not null and p_expires_at > now() then 'active'
        else 'expired'
      end
  end;
$$;

revoke all on function public.subscription_effective_status(text, timestamptz, timestamptz) from public;
grant execute on function public.subscription_effective_status(text, timestamptz, timestamptz) to authenticated;

create or replace function public.subscriptions_set_derived_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.status = public.subscription_effective_status(new.plan_type, new.trial_ends_at, new.expires_at);
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_derived on public.subscriptions;
create trigger trg_subscriptions_derived
  before insert or update on public.subscriptions
  for each row execute function public.subscriptions_set_derived_fields();

-- ---------------------------------------------------------------------
-- default trial on restaurant create
-- ---------------------------------------------------------------------

create or replace function public.create_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (restaurant_id, plan_type, trial_ends_at)
  values (new.id, 'trial', now() + interval '14 days')
  on conflict (restaurant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_restaurants_default_subscription on public.restaurants;
create trigger trg_restaurants_default_subscription
  after insert on public.restaurants
  for each row execute function public.create_default_subscription();

-- Existing restaurants get a fresh 14-day trial from the moment this
-- migration lands, so a production fleet is not retroactively expired.
insert into public.subscriptions (restaurant_id, plan_type, trial_ends_at)
select r.id, 'trial', now() + interval '14 days'
from public.restaurants r
on conflict (restaurant_id) do nothing;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_super_admin on public.subscriptions;
create policy subscriptions_select_super_admin
  on public.subscriptions for select
  to authenticated
  using (public.auth_is_super_admin());

drop policy if exists subscriptions_select_own_restaurant on public.subscriptions;
create policy subscriptions_select_own_restaurant
  on public.subscriptions for select
  to authenticated
  using (restaurant_id in (select public.auth_restaurant_ids()));

drop policy if exists subscriptions_write_super_admin on public.subscriptions;
create policy subscriptions_write_super_admin
  on public.subscriptions for all
  to authenticated
  using (public.auth_is_super_admin())
  with check (public.auth_is_super_admin());

-- ---------------------------------------------------------------------
-- get_restaurant_overview — add billing + owner user id
-- CREATE OR REPLACE cannot change OUT columns, so drop first.
-- ---------------------------------------------------------------------

drop function if exists public.get_restaurant_overview();

create or replace function public.get_restaurant_overview()
returns table (
  restaurant_id uuid,
  name text,
  slug text,
  status restaurant_status,
  created_at timestamptz,
  owner_name text,
  owner_email text,
  owner_user_id uuid,
  table_count bigint,
  staff_count bigint,
  today_order_count bigint,
  plan_type text,
  trial_ends_at timestamptz,
  expires_at timestamptz,
  subscription_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.auth_is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.name,
    r.slug,
    r.status,
    r.created_at,
    om.display_name,
    u.email::text,
    om.user_id,
    (select count(*) from public.tables t where t.restaurant_id = r.id and t.is_active),
    (select count(*) from public.restaurant_members m where m.restaurant_id = r.id and m.is_active),
    (select count(*) from public.orders o where o.restaurant_id = r.id and o.created_at >= date_trunc('day', now())),
    s.plan_type,
    s.trial_ends_at,
    s.expires_at,
    public.subscription_effective_status(s.plan_type, s.trial_ends_at, s.expires_at)
  from public.restaurants r
  left join lateral (
    select * from public.restaurant_members m2
    where m2.restaurant_id = r.id and m2.role = 'owner' and m2.is_active
    order by m2.created_at asc limit 1
  ) om on true
  left join auth.users u on u.id = om.user_id
  left join public.subscriptions s on s.restaurant_id = r.id
  order by r.created_at desc;
end;
$$;

grant execute on function public.get_restaurant_overview() to authenticated;
