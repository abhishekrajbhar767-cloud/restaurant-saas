// lib/kitchen/actions.ts
//
// These call the RPCs from 0006_business_functions.sql directly from the
// browser client — kitchen staff are authenticated, so RLS
// (orders_update_kitchen_staff) plus the state-machine checks inside the
// RPCs themselves are what actually enforce "only valid transitions,
// only for your restaurant." Nothing here is trusted client-side; a
// rejected RPC call just surfaces its error to the caller.

import { createClient } from '@/lib/supabase/client';

export async function acceptOrder(orderId: string, estimatedMinutes: number): Promise<{ error: string | null }> {
  const supabase = createClient();

  const { error: acceptError } = await supabase.rpc('kitchen_accept_order', {
    p_order_id: orderId,
    p_estimated_minutes: estimatedMinutes,
  });
  if (acceptError) return { error: acceptError.message };

  // Kitchen "accepting" an order means they're starting on it now — collapse
  // the transient `accepted` status straight into `preparing` so the board
  // only ever shows the three columns the spec calls for (New/Preparing/Ready).
  const { error: prepareError } = await supabase.rpc('update_order_status', {
    p_order_id: orderId,
    p_new_status: 'preparing',
  });
  if (prepareError) return { error: prepareError.message };

  return { error: null };
}

export async function markReady(orderId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('update_order_status', { p_order_id: orderId, p_new_status: 'ready' });
  return { error: error?.message ?? null };
}

export async function markServed(orderId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('update_order_status', { p_order_id: orderId, p_new_status: 'served' });
  return { error: error?.message ?? null };
}

export async function cancelOrder(orderId: string, reason: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('update_order_status', {
    p_order_id: orderId,
    p_new_status: 'cancelled',
    p_cancellation_reason: reason || null,
  });
  return { error: error?.message ?? null };
}
