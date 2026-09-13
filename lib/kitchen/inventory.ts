import { createClient } from '@/lib/supabase/client';

const inFlight = new Set<string>();

/** Called after a committed kitchen transition. Never awaited by the board. */
export function scheduleInventoryDeduction(orderId: string, enabled: boolean): void {
  // No client creation, query, timer, or RPC when either feature toggle is off.
  if (!enabled || inFlight.has(orderId)) return;
  inFlight.add(orderId);
  void deductWithRetry(orderId)
    .catch((error: unknown) => { console.warn('Inventory deduction remains pending for order', orderId, error); })
    .finally(() => { inFlight.delete(orderId); });
}

async function deductWithRetry(orderId: string): Promise<void> {
  const supabase = createClient();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise<void>((resolve) => setTimeout(resolve, attempt * 1000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const { error } = await supabase.rpc('deduct_order_inventory', { p_order_id: orderId }).abortSignal(controller.signal);
      if (!error) return;
      lastError = error;
      // Authorization, invalid mappings, and a missing migration need attention, not rapid retries.
      if (['42501', '22023', '22003', 'P0002', 'PGRST202'].includes(error.code)) break;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  // The flag stays false after a rollback. Ready/served transitions can attempt it again.
  throw lastError;
}
