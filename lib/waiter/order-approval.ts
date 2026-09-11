// lib/waiter/order-approval.ts
//
// approve_waiter_order / reject_waiter_order (0037_waiter_order_approval.sql)
// are SECURITY DEFINER RPCs — orders_update_kitchen_staff RLS does not cover
// waiters, so these run the authorization check inside the function itself,
// same reasoning as set_table_status. Called straight from the browser
// client, same pattern as lib/kitchen/actions.ts and lib/shared/table-status.ts.

import { createClient } from '@/lib/supabase/client';

export async function approveOrder(orderId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('approve_waiter_order', { p_order_id: orderId });
  return { error: error?.message ?? null };
}

export async function rejectOrder(orderId: string, reason: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('reject_waiter_order', { p_order_id: orderId, p_reason: reason || null });
  return { error: error?.message ?? null };
}
