-- 0011_admin_staff_policy_refinement.sql
-- The original members_insert_owner_manager policy only actually let owners
-- insert (its name overpromised). This splits insert/update so managers can
-- run day-to-day staffing (kitchen/waiter) without being able to create or
-- edit their way into an owner/manager row — the WITH CHECK on the manager
-- policies pins both the existing and the new row to kitchen/waiter only.

drop policy if exists members_insert_owner_manager on public.restaurant_members;

create policy members_insert_owner
  on public.restaurant_members for insert
  to authenticated
  with check (
    role in ('manager', 'kitchen', 'waiter')
    and public.auth_has_role_in_restaurant(restaurant_id, array['owner']::member_role[])
  );

create policy members_insert_manager
  on public.restaurant_members for insert
  to authenticated
  with check (
    role in ('kitchen', 'waiter')
    and public.auth_has_role_in_restaurant(restaurant_id, array['manager']::member_role[])
  );

create policy members_update_manager_staff
  on public.restaurant_members for update
  to authenticated
  using (
    public.auth_has_role_in_restaurant(restaurant_id, array['manager']::member_role[])
    and role in ('kitchen', 'waiter')
  )
  with check (
    public.auth_has_role_in_restaurant(restaurant_id, array['manager']::member_role[])
    and role in ('kitchen', 'waiter')
  );
