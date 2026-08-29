-- 0008_realtime.sql
-- Realtime isolation is enforced by the SAME RLS policies as regular reads
-- (Supabase Realtime evaluates SELECT RLS per-subscriber), so a Restaurant A
-- client subscribed with filter restaurant_id=eq.<A> can never receive
-- Restaurant B rows even if it tried to change the filter client-side.

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.service_requests;
alter publication supabase_realtime add table public.waiter_status;

-- full row data on UPDATE (not just changed cols) so clients get complete state
alter table public.orders replica identity full;
alter table public.service_requests replica identity full;
alter table public.waiter_status replica identity full;
