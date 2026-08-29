-- 0003_indexes.sql

create index if not exists idx_restaurants_status on public.restaurants(status);
create index if not exists idx_restaurants_name_trgm on public.restaurants using gin (name gin_trgm_ops);

create index if not exists idx_members_restaurant_id on public.restaurant_members(restaurant_id);
create index if not exists idx_members_user_id on public.restaurant_members(user_id);
create index if not exists idx_members_restaurant_role on public.restaurant_members(restaurant_id, role) where is_active;

create index if not exists idx_tables_restaurant_id on public.tables(restaurant_id);
create index if not exists idx_tables_qr_token on public.tables(qr_token);

create index if not exists idx_menu_categories_restaurant_id on public.menu_categories(restaurant_id);
create index if not exists idx_menu_items_restaurant_id on public.menu_items(restaurant_id);
create index if not exists idx_menu_items_category_id on public.menu_items(category_id);
create index if not exists idx_menu_items_name_trgm on public.menu_items using gin (name gin_trgm_ops);

create index if not exists idx_orders_restaurant_id on public.orders(restaurant_id);
create index if not exists idx_orders_table_id on public.orders(table_id);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_restaurant_status on public.orders(restaurant_id, status);
create index if not exists idx_orders_restaurant_created on public.orders(restaurant_id, created_at desc);

create index if not exists idx_order_items_order_id on public.order_items(order_id);

create index if not exists idx_service_requests_restaurant_id on public.service_requests(restaurant_id);
create index if not exists idx_service_requests_table_id on public.service_requests(table_id);
create index if not exists idx_service_requests_status on public.service_requests(status);
create index if not exists idx_service_requests_claimed_by on public.service_requests(claimed_by);
create index if not exists idx_service_requests_restaurant_status on public.service_requests(restaurant_id, status);

create index if not exists idx_waiter_status_restaurant_id on public.waiter_status(restaurant_id);
create index if not exists idx_waiter_status_availability on public.waiter_status(restaurant_id, availability);
