// lib/shared/table-status.ts
//
// Both the manager's live map and the waiter's table board write table status,
// so they share one path: set_table_status() from 0028_waiter_table_status.sql.
// The RPC is what makes the waiter surface possible at all — tables_write_
// owner_manager rejects a direct update from a waiter — and routing managers
// through it too keeps a single place where the write is authorized and where
// a no-op status change is filtered out.

import { createClient } from '@/lib/supabase/client';
import type { TableStatus } from '@/types/database';

export async function setTableStatus(tableId: string, status: TableStatus): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('set_table_status', { p_table_id: tableId, p_status: status });
  return { error: error?.message ?? null };
}
