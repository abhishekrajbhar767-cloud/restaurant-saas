'use server';

import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { dispatchStaffAlert } from '@/lib/push/dispatch';

export async function registerStaffPushToken(token: string): Promise<{ error: string | null }> {
  const ctx = await requireRole(['waiter', 'manager', 'owner', 'kitchen']);
  if (!ctx.tenantMembership?.restaurant.id) {
    return { error: 'No restaurant membership found.' };
  }

  const trimmed = token.trim();
  if (!trimmed) return { error: 'Missing push token.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('register_staff_push_token', {
    p_token: trimmed,
    p_platform: 'android',
  });
  return { error: error?.message ?? null };
}

export async function dispatchKitchenReadyAlert(orderId: string): Promise<{ error: string | null }> {
  const ctx = await requireRole(['kitchen', 'manager', 'owner']);
  const restaurantId = ctx.tenantMembership?.restaurant.id;
  if (!restaurantId) return { error: 'No restaurant membership found.' };

  const supabase = createClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, restaurant_id, table_id, status')
    .eq('id', orderId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!order || order.status !== 'ready') return { error: null };

  const { data: table } = await supabase
    .from('tables')
    .select('table_number')
    .eq('id', order.table_id)
    .maybeSingle();

  await dispatchStaffAlert({
    type: 'KITCHEN_READY',
    restaurantId,
    tableNumber: table?.table_number ?? '—',
    orderId: order.id,
  });

  return { error: null };
}
