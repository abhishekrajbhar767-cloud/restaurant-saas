-- 0015_customer_service_request_visibility.sql
--
-- Phase 6 originally dropped anonymous SELECT on service_requests entirely
-- (0014) because it was unused at the time — customers only needed the
-- "request sent" confirmation from create_service_request()'s return value.
-- Now that the customer app shows a live "Waiter is on the way" banner
-- (Section 17), it needs to read — and realtime-subscribe to — its own
-- table's requests. Same tradeoff as orders: RLS can't express "only if you
-- already know this row," so this is scoped by recency instead of left wide
-- open. 6 hours comfortably covers a single dining session.

create policy service_requests_select_public_recent
  on public.service_requests for select
  to anon, authenticated
  using (created_at >= now() - interval '6 hours');
