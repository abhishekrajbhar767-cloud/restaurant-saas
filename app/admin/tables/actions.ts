'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

async function requireTenant() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurantId = ctx.tenantMembership?.restaurant.id;
  if (!restaurantId) throw new Error('No restaurant membership found.');
  return { ctx, restaurantId };
}

const TableNumberSchema = z.object({ tableNumber: z.string().min(1, 'Table number is required').max(10) });

export async function addTable(formData: FormData) {
  const { restaurantId } = await requireTenant();
  const parsed = TableNumberSchema.safeParse({ tableNumber: formData.get('tableNumber') });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');

  const supabase = createClient();
  const { error } = await supabase.from('tables').insert({
    restaurant_id: restaurantId,
    table_number: parsed.data.tableNumber,
  });

  if (error) {
    if (error.code === '23505') throw new Error(`Table "${parsed.data.tableNumber}" already exists.`);
    throw new Error('Could not create table.');
  }

  revalidatePath('/admin/tables');
}

export async function renameTable(tableId: string, tableNumber: string) {
  const { restaurantId } = await requireTenant();
  const parsed = TableNumberSchema.safeParse({ tableNumber });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid input');

  const supabase = createClient();
  const { error } = await supabase
    .from('tables')
    .update({ table_number: parsed.data.tableNumber })
    .eq('id', tableId)
    .eq('restaurant_id', restaurantId);

  if (error) {
    if (error.code === '23505') throw new Error(`Table "${parsed.data.tableNumber}" already exists.`);
    throw new Error('Could not rename table.');
  }

  revalidatePath('/admin/tables');
}

export async function setTableActive(tableId: string, isActive: boolean) {
  const { restaurantId } = await requireTenant();
  const supabase = createClient();
  const { error } = await supabase.from('tables').update({ is_active: isActive }).eq('id', tableId).eq('restaurant_id', restaurantId);
  if (error) throw new Error('Could not update table.');

  revalidatePath('/admin/tables');
}
