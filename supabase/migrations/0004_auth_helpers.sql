-- 0004_auth_helpers.sql
-- These run as SECURITY DEFINER so RLS policies on restaurant_members can call
-- them without recursing into restaurant_members' own RLS. They only ever
-- read data derived from auth.uid() — never from client-supplied input —
-- which is what makes it safe to trust their output inside policies.

create or replace function public.auth_is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.user_id = auth.uid()
      and m.role = 'super_admin'
      and m.is_active
  );
$$;

-- restaurant ids the current user is an active member of (any tenant role)
create or replace function public.auth_restaurant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.restaurant_id from public.restaurant_members m
  where m.user_id = auth.uid()
    and m.is_active
    and m.restaurant_id is not null;
$$;

create or replace function public.auth_has_role_in_restaurant(p_restaurant_id uuid, p_roles member_role[])
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_members m
    where m.user_id = auth.uid()
      and m.restaurant_id = p_restaurant_id
      and m.is_active
      and m.role = any(p_roles)
  );
$$;

-- the current user's active restaurant_members.id row for a given restaurant
-- (used to attribute waiter claims / kitchen actions to a specific staff row)
create or replace function public.auth_member_id(p_restaurant_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.id from public.restaurant_members m
  where m.user_id = auth.uid()
    and m.restaurant_id = p_restaurant_id
    and m.is_active
  limit 1;
$$;

revoke all on function public.auth_is_super_admin() from public;
revoke all on function public.auth_restaurant_ids() from public;
revoke all on function public.auth_has_role_in_restaurant(uuid, member_role[]) from public;
revoke all on function public.auth_member_id(uuid) from public;

grant execute on function public.auth_is_super_admin() to authenticated, anon;
grant execute on function public.auth_restaurant_ids() to authenticated;
grant execute on function public.auth_has_role_in_restaurant(uuid, member_role[]) to authenticated;
grant execute on function public.auth_member_id(uuid) to authenticated;
