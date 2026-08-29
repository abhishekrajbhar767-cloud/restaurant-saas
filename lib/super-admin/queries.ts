// lib/super-admin/queries.ts
//
// Platform-wide reads live here. Restaurant-scoped reads (stats, staff,
// tables, orders) moved to lib/restaurant/queries.ts once /admin needed the
// same data -- re-exported below so existing imports keep working.

import { createClient } from '@/lib/supabase/server';
import type { PlatformStats, RestaurantOverviewRow } from '@/types/database';

export {
  getRestaurantById,
  getRestaurantStats,
  getRestaurantStaff,
  getRestaurantTables,
  getRecentOrders,
} from '@/lib/restaurant/queries';

export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_platform_stats').single();
  if (error || !data) {
    console.error('get_platform_stats failed', error);
    throw new Error('Could not load platform stats.');
  }
  return data;
}

export async function getRestaurantOverview(): Promise<RestaurantOverviewRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_restaurant_overview');
  if (error) {
    console.error('get_restaurant_overview failed', error);
    throw new Error('Could not load restaurants.');
  }
  return data ?? [];
}
