-- 0019_manager_dashboard_realtime.sql
-- The manager dashboard's table map and 86' toggles have to reflect changes
-- made from any other device, so both tables need to reach subscribers the
-- same way orders already do. Tenant isolation still comes from the existing
-- SELECT policies (tables_select_staff / items_select_staff), which Realtime
-- evaluates per-subscriber.

do $$ begin
  alter publication supabase_realtime add table public.tables;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.menu_items;
exception when duplicate_object then null; end $$;

-- Full row data on UPDATE so a status/availability flip carries the whole row.
alter table public.tables replica identity full;
alter table public.menu_items replica identity full;
