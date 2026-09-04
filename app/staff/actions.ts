'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

// Coordinates arrive from the browser, so they are shaped and range-checked
// here and then re-checked against the geofence inside clock_in(). This
// action never decides whether someone is close enough — the database does.
const CoordsSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

async function requireStaffTenant() {
  const ctx = await requireRole(['owner', 'manager', 'kitchen', 'waiter']);
  const restaurantId = ctx.tenantMembership?.restaurant.id;
  if (!restaurantId) throw new Error('No restaurant membership found.');
  return restaurantId;
}

export async function clockIn(coords: { latitude: number; longitude: number } | null): Promise<{ error: string | null }> {
  const restaurantId = await requireStaffTenant();

  let parsed: { latitude: number; longitude: number } | null = null;
  if (coords) {
    const result = CoordsSchema.safeParse(coords);
    if (!result.success) return { error: 'Those coordinates are not valid.' };
    parsed = result.data;
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('clock_in', {
    p_restaurant_id: restaurantId,
    p_latitude: parsed?.latitude ?? null,
    p_longitude: parsed?.longitude ?? null,
  });

  if (error) return { error: error.message || 'Could not clock in.' };

  revalidatePath('/staff');
  return { error: null };
}

export async function clockOut(shiftId?: string): Promise<{ error: string | null }> {
  await requireStaffTenant();

  const supabase = createClient();
  const { error } = await supabase.rpc('clock_out', { p_shift_id: shiftId ?? null });

  if (error) return { error: error.message || 'Could not clock out.' };

  revalidatePath('/staff');
  revalidatePath('/admin/manager');
  return { error: null };
}
