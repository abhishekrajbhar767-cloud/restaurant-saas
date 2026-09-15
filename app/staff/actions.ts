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
  isMock: z.boolean().optional(),
});

async function requireStaffTenant() {
  const ctx = await requireRole(['owner', 'manager', 'kitchen', 'waiter']);
  const restaurantId = ctx.tenantMembership?.restaurant.id;
  if (!restaurantId) throw new Error('No restaurant membership found.');
  return restaurantId;
}

export async function clockIn(
  coords: { latitude: number; longitude: number; isMock?: boolean } | null
): Promise<{ error: string | null }> {
  const restaurantId = await requireStaffTenant();

  let parsed: { latitude: number; longitude: number; isMock?: boolean } | null = null;
  if (coords) {
    const result = CoordsSchema.safeParse(coords);
    if (!result.success) return { error: 'Those coordinates are not valid.' };
    parsed = result.data;
  }

  const supabase = createClient();
  // clock_in() re-runs the geofence test and stamps now() itself; the mock
  // flag is the one judgement only the device can make, so it is passed
  // through and the database decides what to do about it.
  const { error } = await supabase.rpc('clock_in', {
    p_restaurant_id: restaurantId,
    p_latitude: parsed?.latitude ?? null,
    p_longitude: parsed?.longitude ?? null,
    p_is_mock: parsed?.isMock ?? false,
  });

  if (error) {
    const isMockRejection = error.message.includes('MOCK_LOCATION');
    const isGeofenceRejection = error.message.includes('clock-in is allowed within');

    // Logged in its own call: clock_in() rejects by raising, and that raise
    // rolls back anything the same call had written. Best-effort — a failed
    // audit write must not turn into a second error in the waiter's face.
    if (isMockRejection || isGeofenceRejection) {
      await supabase
        .rpc('record_clock_in_rejection', {
          p_restaurant_id: restaurantId,
          p_reason: isMockRejection ? 'mock_location' : 'outside_geofence',
          p_latitude: parsed?.latitude ?? null,
          p_longitude: parsed?.longitude ?? null,
        })
        .then(({ error: auditError }) => {
          if (auditError) console.warn('Could not record the refused clock-in', auditError.message);
        });
    }

    if (isMockRejection) {
      return { error: 'A fake GPS or mock-location app is running. Turn it off and try again.' };
    }
    return { error: error.message || 'Could not clock in.' };
  }

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
