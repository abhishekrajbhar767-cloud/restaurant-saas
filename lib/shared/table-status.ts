// lib/shared/table-status.ts
//
// Both the manager's live map and the waiter's table board write table status,
// so they share one path: set_table_status() from 0028_waiter_table_status.sql.
// The RPC is what makes the waiter surface possible at all — tables_write_
// owner_manager rejects a direct update from a waiter — and routing managers
// through it too keeps a single place where the write is authorized and where
// a no-op status change is filtered out.

import { createClient } from '@/lib/supabase/client';
import type { OnDutyWaiter, TableStatus } from '@/types/database';

export async function setTableStatus(tableId: string, status: TableStatus): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('set_table_status', { p_table_id: tableId, p_status: status });
  return { error: error?.message ?? null };
}

// Claims an already-occupied-but-unassigned table (seated by a manager, or
// from before this feature existed) without touching its status.
export async function assignTableToSelf(tableId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('assign_table_to_self', { p_table_id: tableId });
  return { error: error?.message ?? null };
}

// Hands the table back without freeing it — a manager reassigns it, or
// another waiter takes over the same seating.
export async function releaseTableAssignment(tableId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('release_table_assignment', { p_table_id: tableId });
  return { error: error?.message ?? null };
}

// The handover target list for the transfer modal — on-duty waiters only.
export async function getOnDutyWaiters(restaurantId: string): Promise<{ data: OnDutyWaiter[]; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_on_duty_waiters', { p_restaurant_id: restaurantId });
  return { data: data ?? [], error: error?.message ?? null };
}

// Hands a seated table (and every order still awaiting approval on it) to
// another on-duty waiter in one step.
export async function transferTable(tableId: string, toMemberId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('transfer_table', { p_table_id: tableId, p_to_member_id: toMemberId });
  return { error: error?.message ?? null };
}
