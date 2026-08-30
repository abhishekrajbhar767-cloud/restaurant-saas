-- seed.sql
-- Demo data for Urban Spice + Royal Biryani, plus one platform Super Admin.
-- Run this AFTER all migrations, via the Supabase SQL editor or
-- `supabase db execute -f supabase/seed/seed.sql` (needs service-role / postgres role).
--
-- All demo accounts use password: Demo1234!
-- Change these immediately in any environment beyond local/demo.

do $$
declare
  v_super_admin_id uuid;

  v_urban_id uuid;
  v_urban_owner_id uuid;
  v_urban_kitchen_id uuid;
  v_urban_waiter1_id uuid;
  v_urban_waiter2_id uuid;
  v_urban_waiter1_member uuid;
  v_urban_cat_starters uuid;
  v_urban_cat_mains uuid;
  v_urban_cat_breads uuid;
  v_urban_cat_desserts uuid;
  v_urban_cat_drinks uuid;
  v_urban_table1 uuid;
  v_urban_item_paneer uuid;
  v_urban_item_butter_chicken uuid;
  v_urban_item_naan uuid;
  v_order_id uuid;

  v_royal_id uuid;
  v_royal_owner_id uuid;
  v_royal_kitchen_id uuid;
  v_royal_waiter_id uuid;
  v_royal_cat_biryani uuid;
  v_royal_cat_starters uuid;
  v_royal_cat_desserts uuid;
  v_royal_cat_drinks uuid;

  function_password text := crypt('Demo1234!', gen_salt('bf'));
begin
  -- ---------------- Super Admin ----------------
  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'superadmin@platform.demo', function_password, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"name":"Platform Super Admin"}', now(), now())
  returning id into v_super_admin_id;

  insert into public.restaurant_members (restaurant_id, user_id, role, display_name)
  values (null, v_super_admin_id, 'super_admin', 'Platform Super Admin');

  -- ---------------- Urban Spice ----------------
  insert into public.restaurants (name, slug, currency, timezone, status)
  values ('Urban Spice', 'urban-spice', 'INR', 'Asia/Kolkata', 'active')
  returning id into v_urban_id;

  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'owner@urbanspice.demo', function_password, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"name":"Urban Spice Owner"}', now(), now())
  returning id into v_urban_owner_id;
  insert into public.restaurant_members (restaurant_id, user_id, role, display_name) values (v_urban_id, v_urban_owner_id, 'owner', 'Urban Spice Owner');

  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'kitchen@urbanspice.demo', function_password, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"name":"Urban Spice Kitchen"}', now(), now())
  returning id into v_urban_kitchen_id;
  insert into public.restaurant_members (restaurant_id, user_id, role, display_name) values (v_urban_id, v_urban_kitchen_id, 'kitchen', 'Urban Spice Kitchen');

  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'waiter1@urbanspice.demo', function_password, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"name":"Asha (Waiter)"}', now(), now())
  returning id into v_urban_waiter1_id;
  insert into public.restaurant_members (restaurant_id, user_id, role, display_name) values (v_urban_id, v_urban_waiter1_id, 'waiter', 'Asha') returning id into v_urban_waiter1_member;

  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'waiter2@urbanspice.demo', function_password, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"name":"Ravi (Waiter)"}', now(), now())
  returning id into v_urban_waiter2_id;
  insert into public.restaurant_members (restaurant_id, user_id, role, display_name) values (v_urban_id, v_urban_waiter2_id, 'waiter', 'Ravi');

  update public.waiter_status set availability = 'free' where restaurant_id = v_urban_id;

  insert into public.menu_categories (restaurant_id, name, sort_order) values (v_urban_id, 'Starters', 1) returning id into v_urban_cat_starters;
  insert into public.menu_categories (restaurant_id, name, sort_order) values (v_urban_id, 'Main Course', 2) returning id into v_urban_cat_mains;
  insert into public.menu_categories (restaurant_id, name, sort_order) values (v_urban_id, 'Breads', 3) returning id into v_urban_cat_breads;
  insert into public.menu_categories (restaurant_id, name, sort_order) values (v_urban_id, 'Desserts', 4) returning id into v_urban_cat_desserts;
  insert into public.menu_categories (restaurant_id, name, sort_order) values (v_urban_id, 'Drinks', 5) returning id into v_urban_cat_drinks;

  insert into public.menu_items (restaurant_id, category_id, name, description, price, food_type, prep_time, sort_order) values
    (v_urban_id, v_urban_cat_starters, 'Paneer Tikka', 'Char-grilled cottage cheese, smoked spices', 280, 'veg', 15, 1),
    (v_urban_id, v_urban_cat_starters, 'Chicken 65', 'Deep-fried spiced chicken, curry leaf tempering', 320, 'non_veg', 15, 2),
    (v_urban_id, v_urban_cat_starters, 'Hara Bhara Kebab', 'Spinach and pea kebab', 240, 'veg', 12, 3),
    (v_urban_id, v_urban_cat_starters, 'Fish Amritsari', 'Batter-fried fish, ajwain and gram flour', 340, 'non_veg', 18, 4),
    (v_urban_id, v_urban_cat_mains, 'Butter Chicken', 'Tomato-butter gravy, char-grilled chicken', 420, 'non_veg', 20, 1),
    (v_urban_id, v_urban_cat_mains, 'Dal Makhani', 'Slow-cooked black lentils, cream', 260, 'veg', 25, 2),
    (v_urban_id, v_urban_cat_mains, 'Paneer Lababdar', 'Cottage cheese in rich tomato gravy', 310, 'veg', 18, 3),
    (v_urban_id, v_urban_cat_mains, 'Chicken Biryani', 'Dum-cooked basmati, saffron, fried onions', 380, 'non_veg', 25, 4),
    (v_urban_id, v_urban_cat_mains, 'Veg Biryani', 'Dum-cooked basmati, seasonal vegetables', 300, 'veg', 22, 5),
    (v_urban_id, v_urban_cat_mains, 'Mutton Rogan Josh', 'Kashmiri-style slow-braised mutton', 460, 'non_veg', 30, 6),
    (v_urban_id, v_urban_cat_breads, 'Garlic Naan', 'Tandoor-baked, garlic and coriander', 70, 'veg', 8, 1),
    (v_urban_id, v_urban_cat_breads, 'Butter Roti', 'Whole wheat, tandoor-baked', 40, 'veg', 6, 2),
    (v_urban_id, v_urban_cat_breads, 'Laccha Paratha', 'Layered whole wheat bread', 60, 'veg', 8, 3),
    (v_urban_id, v_urban_cat_desserts, 'Gulab Jamun', 'Milk dumplings in saffron syrup', 120, 'veg', 5, 1),
    (v_urban_id, v_urban_cat_desserts, 'Gajar Ka Halwa', 'Slow-cooked carrot pudding', 150, 'veg', 5, 2),
    (v_urban_id, v_urban_cat_desserts, 'Rasmalai', 'Cottage cheese dumplings, saffron milk', 140, 'veg', 5, 3),
    (v_urban_id, v_urban_cat_drinks, 'Fresh Lime Soda', 'Sweet, salted, or plain', 90, 'vegan', 3, 1),
    (v_urban_id, v_urban_cat_drinks, 'Masala Chaas', 'Spiced buttermilk', 70, 'veg', 3, 2),
    (v_urban_id, v_urban_cat_drinks, 'Mango Lassi', 'Yoghurt, alphonso mango', 110, 'veg', 4, 3),
    (v_urban_id, v_urban_cat_drinks, 'Filter Coffee', 'South Indian style', 60, 'veg', 5, 4)
   ; -- captures last insert id (Paneer Tikka is first, this is fine, only used illustratively below)

  select id into v_urban_item_butter_chicken from public.menu_items where restaurant_id = v_urban_id and name = 'Butter Chicken';
  select id into v_urban_item_naan from public.menu_items where restaurant_id = v_urban_id and name = 'Garlic Naan';
  select id into v_urban_item_paneer from public.menu_items where restaurant_id = v_urban_id and name = 'Paneer Tikka';

  -- 10 demo tables for Urban Spice
  insert into public.tables (restaurant_id, table_number)
  select v_urban_id, t::text from generate_series(1, 10) t;

  select id into v_urban_table1 from public.tables where restaurant_id = v_urban_id and table_number = '1';

  -- one sample historical order so the admin dashboard/KDS aren't empty on first load
  insert into public.orders (restaurant_id, table_id, status, subtotal, estimated_minutes, accepted_at, preparing_at, ready_at, served_at)
  values (v_urban_id, v_urban_table1, 'served', 490, 20, now() - interval '50 minutes', now() - interval '48 minutes', now() - interval '30 minutes', now() - interval '25 minutes')
  returning id into v_order_id;

  insert into public.order_items (order_id, menu_item_id, item_name, unit_price, quantity) values
    (v_order_id, v_urban_item_butter_chicken, 'Butter Chicken', 420, 1),
    (v_order_id, v_urban_item_naan, 'Garlic Naan', 70, 1);

  -- ---------------- Royal Biryani ----------------
  insert into public.restaurants (name, slug, currency, timezone, status)
  values ('Royal Biryani', 'royal-biryani', 'INR', 'Asia/Kolkata', 'active')
  returning id into v_royal_id;

  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'owner@royalbiryani.demo', function_password, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"name":"Royal Biryani Owner"}', now(), now())
  returning id into v_royal_owner_id;
  insert into public.restaurant_members (restaurant_id, user_id, role, display_name) values (v_royal_id, v_royal_owner_id, 'owner', 'Royal Biryani Owner');

  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'kitchen@royalbiryani.demo', function_password, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"name":"Royal Biryani Kitchen"}', now(), now())
  returning id into v_royal_kitchen_id;
  insert into public.restaurant_members (restaurant_id, user_id, role, display_name) values (v_royal_id, v_royal_kitchen_id, 'kitchen', 'Royal Biryani Kitchen');

  insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'waiter@royalbiryani.demo', function_password, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"name":"Imran (Waiter)"}', now(), now())
  returning id into v_royal_waiter_id;
  insert into public.restaurant_members (restaurant_id, user_id, role, display_name) values (v_royal_id, v_royal_waiter_id, 'waiter', 'Imran');

  update public.waiter_status set availability = 'free' where restaurant_id = v_royal_id;

  insert into public.menu_categories (restaurant_id, name, sort_order) values (v_royal_id, 'Biryani', 1) returning id into v_royal_cat_biryani;
  insert into public.menu_categories (restaurant_id, name, sort_order) values (v_royal_id, 'Starters', 2) returning id into v_royal_cat_starters;
  insert into public.menu_categories (restaurant_id, name, sort_order) values (v_royal_id, 'Desserts', 3) returning id into v_royal_cat_desserts;
  insert into public.menu_categories (restaurant_id, name, sort_order) values (v_royal_id, 'Drinks', 4) returning id into v_royal_cat_drinks;

  insert into public.menu_items (restaurant_id, category_id, name, description, price, food_type, prep_time, sort_order) values
    (v_royal_id, v_royal_cat_biryani, 'Hyderabadi Chicken Biryani', 'Dum-style, long-grain basmati', 350, 'non_veg', 30, 1),
    (v_royal_id, v_royal_cat_biryani, 'Mutton Biryani', 'Slow dum-cooked, tender mutton', 480, 'non_veg', 35, 2),
    (v_royal_id, v_royal_cat_biryani, 'Veg Dum Biryani', 'Mixed vegetables, saffron rice', 280, 'veg', 25, 3),
    (v_royal_id, v_royal_cat_biryani, 'Egg Biryani', 'Boiled eggs, spiced rice', 260, 'egg', 20, 4),
    (v_royal_id, v_royal_cat_biryani, 'Prawns Biryani', 'Coastal-style, tiger prawns', 420, 'non_veg', 30, 5),
    (v_royal_id, v_royal_cat_starters, 'Chicken Seekh Kebab', 'Minced chicken, char-grilled', 300, 'non_veg', 15, 1),
    (v_royal_id, v_royal_cat_starters, 'Mirchi Ka Salan', 'Chilli and peanut curry', 180, 'veg', 15, 2),
    (v_royal_id, v_royal_cat_starters, 'Chicken 65', 'Deep-fried spiced chicken', 300, 'non_veg', 15, 3),
    (v_royal_id, v_royal_cat_desserts, 'Double Ka Meetha', 'Hyderabadi bread pudding', 140, 'veg', 5, 1),
    (v_royal_id, v_royal_cat_desserts, 'Qubani Ka Meetha', 'Stewed apricot dessert', 150, 'veg', 5, 2),
    (v_royal_id, v_royal_cat_drinks, 'Sulaimani Chai', 'Spiced black tea', 50, 'vegan', 4, 1),
    (v_royal_id, v_royal_cat_drinks, 'Fresh Lime Soda', 'Sweet, salted, or plain', 90, 'vegan', 3, 2);

  insert into public.tables (restaurant_id, table_number)
  select v_royal_id, t::text from generate_series(1, 10) t;

  raise notice 'Seed complete. Urban Spice = %, Royal Biryani = %', v_urban_id, v_royal_id;
end $$;
