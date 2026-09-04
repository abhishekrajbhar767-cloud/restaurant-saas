// lib/manager/actions.ts
//
// Writes from the manager dashboard go straight out of the browser client,
// the same way lib/kitchen/actions.ts does. Authorization is RLS:
// tables_write_owner_manager and items_write_owner_manager both require an
// owner/manager membership for the row's own restaurant, so a tampered id can
// only ever come back as a rejected update — never a cross-tenant write.
//
// These deliberately avoid revalidatePath(): the dashboard is a live surface
// that already reconciles itself through the realtime channel, and a full
// route refresh on every toggle would fight the optimistic UI.

import { createClient } from '@/lib/supabase/client';
import type { TableStatus } from '@/types/database';

export async function setTableStatus(tableId: string, status: TableStatus): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from('tables').update({ status }).eq('id', tableId);
  return { error: error?.message ?? null };
}

export async function setMenuItemAvailability(itemId: string, isAvailable: boolean): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from('menu_items').update({ is_available: isAvailable }).eq('id', itemId);
  return { error: error?.message ?? null };
}

// ---------------- Financials: voids and discounts ----------------
//
// These four go through SECURITY DEFINER RPCs rather than table updates, for
// two reasons. order_items has no UPDATE policy at all, and orders_update_
// kitchen_staff would otherwise let kitchen staff write void_reason and
// discount_amount. The RPCs in 0020_manager_financials.sql re-check
// owner/manager against the row's own restaurant and re-validate every amount,
// so nothing here is trusted — the checks below only buy a faster, clearer
// error message than a rejected round trip would give.

function rpcError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  // Postgres RAISE messages are already written for a human to read; the
  // generic transport failures are not, so those get the caller's fallback.
  if (/JSON object requested|Failed to fetch|NetworkError/i.test(message)) return fallback;
  return message;
}

export async function voidOrder(orderId: string, reason: string): Promise<{ error: string | null }> {
  const trimmed = reason.trim();
  if (trimmed === '') return { error: 'A void reason is required.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('void_order', { p_order_id: orderId, p_reason: trimmed });
  return { error: error ? rpcError(error.message, 'Could not void this order.') : null };
}

export async function voidOrderItem(itemId: string, reason: string): Promise<{ error: string | null }> {
  const trimmed = reason.trim();
  if (trimmed === '') return { error: 'A void reason is required.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('void_order_item', { p_item_id: itemId, p_reason: trimmed });
  return { error: error ? rpcError(error.message, 'Could not void this item.') : null };
}

export async function applyOrderDiscount(orderId: string, amount: number): Promise<{ error: string | null }> {
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Discount cannot be negative.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('apply_order_discount', { p_order_id: orderId, p_amount: amount });
  return { error: error ? rpcError(error.message, 'Could not apply that discount.') : null };
}

export async function applyOrderItemDiscount(itemId: string, amount: number): Promise<{ error: string | null }> {
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Discount cannot be negative.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('apply_order_item_discount', { p_item_id: itemId, p_amount: amount });
  return { error: error ? rpcError(error.message, 'Could not apply that discount.') : null };
}
