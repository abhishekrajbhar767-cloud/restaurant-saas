-- 0033_subscription_expires_at.sql
--
-- Super Admin tracking UI needs a single expiration timestamp and plan
-- labels that match the product (free_trial / monthly / yearly).
-- subscription_expires_at is the date the dashboard sorts and highlights on.
-- trial_ends_at / expires_at stay in sync so earlier plan-extension writes
-- keep working.

alter table public.subscriptions
  add column if not exists subscription_expires_at timestamptz;

alter table public.subscriptions drop constraint if exists subscriptions_plan_type_check;

update public.subscriptions set plan_type = 'free_trial' where plan_type = 'trial';
update public.subscriptions set plan_type = 'yearly' where plan_type = 'annual';

alter table public.subscriptions
  alter column plan_type set default 'free_trial';

alter table public.subscriptions
  add constraint subscriptions_plan_type_check
  check (plan_type in ('free_trial', 'monthly', 'yearly'));

update public.subscriptions
  set subscription_expires_at = coalesce(
    case
      when plan_type in ('free_trial', 'trial') then trial_ends_at
      else expires_at
    end,
    trial_ends_at,
    expires_at
  )
  where subscription_expires_at is null;

create index if not exists idx_subscriptions_subscription_expires_at
  on public.subscriptions(subscription_expires_at);

-- ---------------------------------------------------------------------
-- derived status + keep the three date columns aligned
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
    when p_plan_type in ('free_trial', 'trial') then
      case
        when p_trial_ends_at is not null and p_trial_ends_at > now() then 'trialing'
        else 'expired'
      end
    else
      case
        when coalesce(p_expires_at, p_trial_ends_at) is not null
          and coalesce(p_expires_at, p_trial_ends_at) > now() then 'active'
        else 'expired'
      end
  end;
$$;

create or replace function public.subscriptions_set_derived_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();

  if new.subscription_expires_at is null then
    new.subscription_expires_at := coalesce(
      case
        when new.plan_type in ('free_trial', 'trial') then new.trial_ends_at
        else new.expires_at
      end,
      new.trial_ends_at,
      new.expires_at
    );
  end if;

  if new.plan_type in ('free_trial', 'trial') then
    new.trial_ends_at := coalesce(new.trial_ends_at, new.subscription_expires_at);
  else
    new.expires_at := coalesce(new.expires_at, new.subscription_expires_at);
  end if;

  new.status = public.subscription_effective_status(
    new.plan_type,
    coalesce(new.trial_ends_at, new.subscription_expires_at),
    coalesce(new.expires_at, new.subscription_expires_at)
  );
  return new;
end;
$$;

create or replace function public.create_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (
    restaurant_id,
    plan_type,
    trial_ends_at,
    subscription_expires_at
  )
  values (new.id, 'free_trial', now() + interval '14 days', now() + interval '14 days')
  on conflict (restaurant_id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- overview: expose subscription_expires_at, sort expired → soon → rest
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
  subscription_expires_at timestamptz,
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
    s.subscription_expires_at,
    public.subscription_effective_status(
      s.plan_type,
      coalesce(s.trial_ends_at, s.subscription_expires_at),
      coalesce(s.expires_at, s.subscription_expires_at)
    )
  from public.restaurants r
  left join lateral (
    select * from public.restaurant_members m2
    where m2.restaurant_id = r.id and m2.role = 'owner' and m2.is_active
    order by m2.created_at asc limit 1
  ) om on true
  left join auth.users u on u.id = om.user_id
  left join public.subscriptions s on s.restaurant_id = r.id
  order by
    case
      when s.subscription_expires_at is null then 3
      when s.subscription_expires_at <= now() then 0
      when s.subscription_expires_at <= now() + interval '7 days' then 1
      else 2
    end,
    s.subscription_expires_at asc nulls last,
    r.created_at desc;
end;
$$;

grant execute on function public.get_restaurant_overview() to authenticated;
