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
