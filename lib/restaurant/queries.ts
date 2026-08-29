// lib/restaurant/queries.ts
//
// Scoped to a single restaurant. Used by both /super-admin/restaurants/[id]
// (as an owner/manager-equivalent read, gated by auth_is_super_admin() inside
// the RPCs) and every page under /admin, /kitchen, /waiter that needs the
// same shape of data. Keeping these in one place means the RLS/RPC contract
// only has to be modeled in TypeScript once.

import { createClient } from '@/lib/supabase/server';
import type {
  Restaurant,
  RestaurantStats,
  RestaurantStaffRow,
  RestaurantTable,
  Order,
  MenuCategory,
  MenuItem,
  OrderStatus,
} from '@/types/database';

export async function getRestaurantById(id: string): Promise<Restaurant | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from('restaurants').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('getRestaurantById failed', error);
    throw new Error('Could not load restaurant.');
  }
  return data;
}

export async function getRestaurantStats(restaurantId: string): Promise<RestaurantStats> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_restaurant_stats', { p_restaurant_id: restaurantId }).single();
  if (error || !data) {
    console.error('get_restaurant_stats failed', error);
    throw new Error('Could not load restaurant stats.');
  }
  return data;
}

export async function getRestaurantStaff(restaurantId: string): Promise<RestaurantStaffRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_restaurant_staff', { p_restaurant_id: restaurantId });
  if (error) {
    console.error('get_restaurant_staff failed', error);
    throw new Error('Could not load staff.');
  }
  return data ?? [];
}

export async function getRestaurantTables(restaurantId: string): Promise<RestaurantTable[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('table_number', { ascending: true });
  if (error) {
    console.error('getRestaurantTables failed', error);
    throw new Error('Could not load tables.');
  }
  return data ?? [];
}

export async function getRecentOrders(restaurantId: string, limit = 20): Promise<(Order & { table_number: string })[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('*, tables(table_number)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('getRecentOrders failed', error);
    throw new Error('Could not load orders.');
  }
  return (data ?? []).map((o: any) => ({ ...o, table_number: o.tables?.table_number ?? '—' }));
}

export async function getOrdersByStatus(
  restaurantId: string,
  statuses: OrderStatus[]
): Promise<(Order & { table_number: string })[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('*, tables(table_number)')
    .eq('restaurant_id', restaurantId)
    .in('status', statuses)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('getOrdersByStatus failed', error);
    throw new Error('Could not load orders.');
  }
  return (data ?? []).map((o: any) => ({ ...o, table_number: o.tables?.table_number ?? '—' }));
}

export async function getMenuCategories(restaurantId: string): Promise<MenuCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('getMenuCategories failed', error);
    throw new Error('Could not load menu categories.');
  }
  return data ?? [];
}

export async function getMenuItems(restaurantId: string): Promise<MenuItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('getMenuItems failed', error);
    throw new Error('Could not load menu items.');
  }
  return data ?? [];
}
