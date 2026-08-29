-- 0014_fix_public_order_visibility.sql
--
-- PROBLEM: the original orders_select_public_by_id / order_items_select_
-- public_by_order / service_requests_select_public_by_id policies from
-- 0005 all used `using (true)` for the anon role, reasoning that "the app
-- always queries by a known id, so the id is the bearer capability." That
-- reasoning has a hole: RLS governs the ROW, not the QUERY SHAPE. Nothing
-- stops a client holding the public anon key from calling
-- `supabase.from('orders').select('*')` with no filter and reading every
-- order across every restaurant — a real cross-tenant leak, not just a
-- theoretical one, and one Section 30's isolation tests would eventually
-- have caught.
--
-- FIX, given the real constraint at play: customers are anonymous (no
-- accounts, per spec) so there is no JWT claim RLS can check against to
-- express "only if you already know this UUID" — Postgres RLS is
-- fundamentally row-scoped, not capability-scoped. Two changes:
--
--   1. service_requests: the public read was never actually used by the
--      client (create_service_request's return value is enough for the
--      "request sent" UI) — just drop it.
--   2. orders / order_items: narrow the window to recent activity (24h).
--      This doesn't stop enumeration of *today's* orders, but it closes
--      off the historical/cross-shift bulk-read — the practical risk of
--      a scraped anon key. Realtime `postgres_changes` subscriptions are
--      unaffected since they're additionally scoped by the channel's own
--      `filter: id=eq.<orderId>`, evaluated server-side.
--
-- HARDENING PATH (beyond MVP): move anonymous order updates to Supabase
-- Realtime "Broadcast from Database" on a topic keyed by the order id
-- (private channel, authorized via realtime.messages RLS) instead of
-- postgres_changes, and stop granting anon any direct table SELECT on
-- orders/order_items at all — reads would go through get_order_tracking()
-- below instead. Left as a follow-up rather than shipped blind here.

drop policy if exists service_requests_select_public_by_id on public.service_requests;

drop policy if exists orders_select_public_by_id on public.orders;
create policy orders_select_public_recent
  on public.orders for select
  to anon, authenticated
  using (created_at >= now() - interval '24 hours');

drop policy if exists order_items_select_public_by_order on public.order_items;
create policy order_items_select_public_recent
  on public.order_items for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_at >= now() - interval '24 hours'
    )
  );
