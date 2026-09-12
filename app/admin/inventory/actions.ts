'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole, type TenantMembership } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { AddStockSchema, CreateInventoryItemSchema, type CreateInventoryItemInput, type InventoryResult } from '@/lib/inventory/validation';
import type { InventoryItem, InventoryLog } from '@/types/database';

type InventoryContext = { supabase: ReturnType<typeof createClient>; membership: TenantMembership };

async function withInventory<T>(operation: (context: InventoryContext) => Promise<InventoryResult<T>>): Promise<InventoryResult<T>> {
  // Keep redirects outside the catch so expired sessions return to login.
  const ctx = await requireRole(['owner', 'manager']);
  const membership = ctx.tenantMembership;
  if (!membership || !['owner', 'manager'].includes(membership.role)) {
    return { data: null, error: 'An owner or manager restaurant membership is required.' };
  }
  try {
    const supabase = createClient();
    const { data: restaurant, error } = await supabase.from('restaurants')
      .select('inventory_tracking_enabled').eq('id', membership.restaurant_id!).single();
    if (error || !restaurant) return { data: null, error: 'Could not verify inventory settings. Please try again.' };
    if (!restaurant.inventory_tracking_enabled) return { data: null, error: 'Enable Raw Inventory Tracking in Settings first.' };
    return await operation({ supabase, membership });
  } catch (error) {
    console.error('Inventory operation failed', error);
    return { data: null, error: 'Could not complete this inventory request. Please try again.' };
  }
}

export async function getInventoryItems(restaurantId: string): Promise<InventoryResult<InventoryItem[]>> {
  return withInventory(async ({ supabase, membership }) => {
    if (!z.string().uuid().safeParse(restaurantId).success || restaurantId !== membership.restaurant_id) {
      return { data: null, error: 'You cannot access inventory for that restaurant.' };
    }
    // Page through PostgREST's row cap so large ingredient lists are not silently truncated.
    const items: InventoryItem[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from('inventory_items').select('*')
        .eq('restaurant_id', restaurantId).order('name').order('id').range(offset, offset + pageSize - 1);
      if (error) return { data: null, error: 'Could not load inventory. Please try again.' };
      items.push(...data);
      if (data.length < pageSize) break;
    }
    return { data: items, error: null };
  });
}

export async function createInventoryItem(data: CreateInventoryItemInput): Promise<InventoryResult<InventoryItem>> {
  return withInventory(async ({ supabase, membership }) => {
    const parsed = CreateInventoryItemSchema.safeParse(data);
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? 'Check the ingredient details.' };
    const { data: item, error } = await supabase.from('inventory_items')
      .insert({ ...parsed.data, restaurant_id: membership.restaurant_id!, current_stock: 0 })
      .select('*').single();
    if (error) return { data: null, error: 'Could not create this ingredient. Please try again.' };
    revalidatePath('/admin/inventory');
    return { data: item, error: null };
  });
}

export async function addStock(inventoryItemId: string, quantity: number, notes?: string): Promise<InventoryResult<InventoryItem>> {
  return withInventory(async ({ supabase, membership }) => {
    const parsed = AddStockSchema.safeParse({ inventoryItemId, quantity, notes });
    if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? 'Check the stock details.' };
    const { data: item, error: lookupError } = await supabase.from('inventory_items').select('id')
      .eq('id', inventoryItemId).eq('restaurant_id', membership.restaurant_id!).maybeSingle();
    if (lookupError) return { data: null, error: 'Could not verify this ingredient. Please try again.' };
    if (!item) return { data: null, error: 'Ingredient not found in your restaurant.' };

    // One database transaction performs the increment and the audit insert.
    const { data: updated, error } = await supabase.rpc('add_inventory_stock', {
      p_inventory_item_id: parsed.data.inventoryItemId,
      p_quantity: parsed.data.quantity,
      p_notes: parsed.data.notes || null,
    }).single<InventoryItem>();
    if (error) {
      if (error.code === '22003') return { data: null, error: 'This addition would exceed the stock limit.' };
      if (error.code === '42501') return { data: null, error: 'Inventory is disabled or you no longer have permission to restock.' };
      console.error('Inventory restock failed', error);
      return { data: null, error: 'Could not add stock. Refresh and check the history before trying again.' };
    }
    revalidatePath('/admin/inventory');
    return { data: updated, error: null };
  });
}

export async function getInventoryLogs(inventoryItemId: string): Promise<InventoryResult<InventoryLog[]>> {
  return withInventory(async ({ supabase, membership }) => {
    if (!z.string().uuid().safeParse(inventoryItemId).success) return { data: null, error: 'Select a valid ingredient.' };
    const { data: item, error: lookupError } = await supabase.from('inventory_items').select('id')
      .eq('id', inventoryItemId).eq('restaurant_id', membership.restaurant_id!).maybeSingle();
    if (lookupError || !item) return { data: null, error: 'Could not find this ingredient in your restaurant.' };
    const { data, error } = await supabase.from('inventory_logs').select('*')
      .eq('inventory_item_id', inventoryItemId).eq('restaurant_id', membership.restaurant_id!)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50);
    if (error) return { data: null, error: 'Could not load stock history. Please try again.' };
    return { data, error: null };
  });
}
