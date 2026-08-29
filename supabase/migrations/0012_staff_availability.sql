-- 0012_staff_availability.sql
-- Adds availability to the staff roster RPC (section 24: "View waiter
-- availability"). Return type changes, so the function must be dropped and
-- recreated rather than CREATE OR REPLACE'd.

drop function if exists public.get_restaurant_staff(uuid);

create function public.get_restaurant_staff(p_restaurant_id uuid)
returns table (
  member_id uuid,
  role member_role,
  display_name text,
  phone text,
  is_active boolean,
  email text,
  created_at timestamptz,
  availability waiter_availability
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.auth_is_super_admin()
    or public.auth_has_role_in_restaurant(p_restaurant_id, array['owner','manager']::member_role[])
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select m.id, m.role, m.display_name, m.phone, m.is_active, u.email::text, m.created_at, ws.availability
  from public.restaurant_members m
  join auth.users u on u.id = m.user_id
  left join public.waiter_status ws on ws.member_id = m.id
  where m.restaurant_id = p_restaurant_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.get_restaurant_staff(uuid) to authenticated;
