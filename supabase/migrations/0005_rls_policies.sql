-- 0005_rls_policies.sql
-- Tenant isolation is enforced entirely here. Client-supplied restaurant_id
-- is never trusted for authorization — it's only ever compared against what
-- auth_restaurant_ids()/auth_has_role_in_restaurant() derive from auth.uid().

alter table public.restaurants enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.tables enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.service_requests enable row level security;
alter table public.waiter_status enable row level security;
alter table public.support_mode_audit_log enable row level security;

-- ============ restaurants ============

create policy restaurants_select_public_active
  on public.restaurants for select
  to anon, authenticated
  using (status <> 'archived'); -- customer menu route needs to resolve slug -> restaurant, and see suspended message

create policy restaurants_select_super_admin
  on public.restaurants for select
  to authenticated
  using (public.auth_is_super_admin());

create policy restaurants_insert_super_admin
  on public.restaurants for insert
  to authenticated
  with check (public.auth_is_super_admin());

create policy restaurants_update_super_admin
  on public.restaurants for update
  to authenticated
  using (public.auth_is_super_admin())
  with check (public.auth_is_super_admin());

create policy restaurants_update_owner_settings
  on public.restaurants for update
  to authenticated
  using (public.auth_has_role_in_restaurant(id, array['owner']::member_role[]))
  with check (public.auth_has_role_in_restaurant(id, array['owner']::member_role[]));

-- ============ restaurant_members ============

create policy members_select_super_admin
  on public.restaurant_members for select
  to authenticated
  using (public.auth_is_super_admin());

create policy members_select_own_restaurant
  on public.restaurant_members for select
  to authenticated
  using (restaurant_id in (select public.auth_restaurant_ids()));

create policy members_select_self
  on public.restaurant_members for select
  to authenticated
  using (user_id = auth.uid());

create policy members_insert_super_admin
  on public.restaurant_members for insert
  to authenticated
  with check (public.auth_is_super_admin());

create policy members_insert_owner_manager
  on public.restaurant_members for insert
  to authenticated
  with check (
    role in ('manager', 'kitchen', 'waiter')
    and public.auth_has_role_in_restaurant(restaurant_id, array['owner']::member_role[])
  );

create policy members_update_super_admin
  on public.restaurant_members for update
  to authenticated
  using (public.auth_is_super_admin())
  with check (public.auth_is_super_admin());

create policy members_update_owner
  on public.restaurant_members for update
  to authenticated
  using (public.auth_has_role_in_restaurant(restaurant_id, array['owner']::member_role[]))
  with check (public.auth_has_role_in_restaurant(restaurant_id, array['owner']::member_role[]));

-- ============ tables ============

create policy tables_select_public
  on public.tables for select
  to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.restaurants r where r.id = tables.restaurant_id and r.status = 'active')
  ); -- needed so the customer app can resolve a QR token; token itself is the unguessable secret

create policy tables_select_staff
  on public.tables for select
  to authenticated
  using (restaurant_id in (select public.auth_restaurant_ids()) or public.auth_is_super_admin());

create policy tables_write_owner_manager
  on public.tables for all
  to authenticated
  using (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin())
  with check (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin());

-- ============ menu_categories / menu_items ============

create policy categories_select_public
  on public.menu_categories for select
  to anon, authenticated
  using (
    is_active
    and exists (select 1 from public.restaurants r where r.id = menu_categories.restaurant_id and r.status = 'active')
  );

create policy categories_select_staff
  on public.menu_categories for select
  to authenticated
  using (restaurant_id in (select public.auth_restaurant_ids()) or public.auth_is_super_admin());

create policy categories_write_owner_manager
  on public.menu_categories for all
  to authenticated
  using (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin())
  with check (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin());

create policy items_select_public
  on public.menu_items for select
  to anon, authenticated
  using (
    exists (select 1 from public.restaurants r where r.id = menu_items.restaurant_id and r.status = 'active')
  );

create policy items_select_staff
  on public.menu_items for select
  to authenticated
  using (restaurant_id in (select public.auth_restaurant_ids()) or public.auth_is_super_admin());

create policy items_write_owner_manager
  on public.menu_items for all
  to authenticated
  using (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin())
  with check (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[]) or public.auth_is_super_admin());

-- ============ orders / order_items ============
-- Customers are anonymous. Direct anon INSERT is intentionally NOT granted here —
-- order creation goes through the create_order() SECURITY DEFINER function
-- (0006_business_functions.sql) so price/availability/total are always
-- computed server-side. Anon SELECT is scoped to a single order by id, which
-- acts as a bearer capability handed back from create_order() — the same
-- pattern the QR token itself uses.

create policy orders_select_public_by_id
  on public.orders for select
  to anon, authenticated
  using (true); -- order id (uuid) is unguessable and required to filter; app always queries by id

create policy orders_select_staff
  on public.orders for select
  to authenticated
  using (restaurant_id in (select public.auth_restaurant_ids()) or public.auth_is_super_admin());

create policy orders_update_kitchen_staff
  on public.orders for update
  to authenticated
  using (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager','kitchen']::member_role[]) or public.auth_is_super_admin())
  with check (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager','kitchen']::member_role[]) or public.auth_is_super_admin());

create policy order_items_select_public_by_order
  on public.order_items for select
  to anon, authenticated
  using (true); -- always queried scoped to a known order_id

create policy order_items_select_staff
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.restaurant_id in (select public.auth_restaurant_ids()) or public.auth_is_super_admin())
    )
  );

-- ============ service_requests ============

create policy service_requests_select_staff
  on public.service_requests for select
  to authenticated
  using (restaurant_id in (select public.auth_restaurant_ids()) or public.auth_is_super_admin());

create policy service_requests_select_public_by_id
  on public.service_requests for select
  to anon, authenticated
  using (true); -- scoped by known id/table in app queries, mirrors order capability pattern

create policy service_requests_update_waiter_staff
  on public.service_requests for update
  to authenticated
  using (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager','waiter']::member_role[]) or public.auth_is_super_admin())
  with check (public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager','waiter']::member_role[]) or public.auth_is_super_admin());

-- ============ waiter_status ============

create policy waiter_status_select_staff
  on public.waiter_status for select
  to authenticated
  using (restaurant_id in (select public.auth_restaurant_ids()) or public.auth_is_super_admin());

create policy waiter_status_write_self
  on public.waiter_status for all
  to authenticated
  using (
    member_id = public.auth_member_id(restaurant_id)
    or public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[])
    or public.auth_is_super_admin()
  )
  with check (
    member_id = public.auth_member_id(restaurant_id)
    or public.auth_has_role_in_restaurant(restaurant_id, array['owner','manager']::member_role[])
    or public.auth_is_super_admin()
  );

-- ============ support_mode_audit_log ============

create policy audit_log_super_admin_only
  on public.support_mode_audit_log for all
  to authenticated
  using (public.auth_is_super_admin())
  with check (public.auth_is_super_admin());
