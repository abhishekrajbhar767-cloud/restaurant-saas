// lib/restaurant/reports.ts
//
// Server-side readers for the analytics screen. Each RPC re-checks
// owner/manager against the restaurant, so these are safe to call from a
// server component without duplicating the role logic here.

import { createClient } from '@/lib/supabase/server';
import type { EodSummary, StaffShiftHistoryRow, TopSellingItem } from '@/types/database';

const EMPTY_SUMMARY: EodSummary = {
  order_count: 0,
  items_sold: 0,
  gross_revenue: 0,
  discount_total: 0,
  net_revenue: 0,
  average_order_value: null,
  voided_order_count: 0,
  voided_item_count: 0,
  voided_value: 0,
};

export async function getEodSummary(restaurantId: string, day: string | null): Promise<EodSummary> {
  const supabase = createClient();
  const { data, error } = await supabase
    .rpc('get_eod_summary', { p_restaurant_id: restaurantId, p_day: day })
    .maybeSingle();

  if (error) {
    console.error('get_eod_summary failed', error);
    throw new Error('Could not load the end-of-day summary.');
  }
  // The RPC always returns exactly one row; EMPTY_SUMMARY only covers the
  // case where supabase-js hands back null without an error.
  return data ?? EMPTY_SUMMARY;
}

export async function getTopSellingItems(
  restaurantId: string,
  day: string | null,
  limit = 10
): Promise<TopSellingItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_top_selling_items', {
    p_restaurant_id: restaurantId,
    p_day: day,
    p_limit: limit,
  });

  if (error) {
    console.error('get_top_selling_items failed', error);
    throw new Error('Could not load top selling items.');
  }
  return data ?? [];
}

export async function getStaffShiftHistory(
  restaurantId: string,
  day: string | null
): Promise<StaffShiftHistoryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_staff_shift_history', {
    p_restaurant_id: restaurantId,
    p_day: day,
  });

  if (error) {
    console.error('get_staff_shift_history failed', error);
    throw new Error('Could not load staff shift history.');
  }
  return data ?? [];
}
