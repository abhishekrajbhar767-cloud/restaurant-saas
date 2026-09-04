'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

const GeofenceSchema = z.object({
  latitude: z.coerce.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  longitude: z.coerce
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  radiusMeters: z.coerce.number().int('Radius must be a whole number').positive('Radius must be greater than zero'),
});

async function requireTenant() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurantId = ctx.tenantMembership?.restaurant.id;
  if (!restaurantId) throw new Error('No restaurant membership found.');
  return restaurantId;
}

export async function saveGeofence(formData: FormData): Promise<{ error: string | null }> {
  const restaurantId = await requireTenant();

  const parsed = GeofenceSchema.safeParse({
    latitude: formData.get('latitude'),
    longitude: formData.get('longitude'),
    radiusMeters: formData.get('radiusMeters'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Those settings are not valid.' };
  }

  // set_restaurant_geofence rather than a table update: the RLS policy on
  // restaurants is owner-only, and this screen is open to managers too.
  const supabase = createClient();
  const { error } = await supabase.rpc('set_restaurant_geofence', {
    p_restaurant_id: restaurantId,
    p_latitude: parsed.data.latitude,
    p_longitude: parsed.data.longitude,
    p_radius_meters: parsed.data.radiusMeters,
  });

  if (error) return { error: error.message || 'Could not save these settings.' };

  revalidatePath('/admin/settings');
  return { error: null };
}

export async function clearGeofence(): Promise<{ error: string | null }> {
  const restaurantId = await requireTenant();

  const supabase = createClient();
  const { error } = await supabase.rpc('set_restaurant_geofence', {
    p_restaurant_id: restaurantId,
    p_latitude: null,
    p_longitude: null,
    p_radius_meters: null,
  });

  if (error) return { error: error.message || 'Could not clear the geofence.' };

  revalidatePath('/admin/settings');
  return { error: null };
}

const ReviewUrlSchema = z
  .string()
  .trim()
  .url('Enter a full link, for example https://g.page/r/…')
  .startsWith('http', 'The link must start with http:// or https://');

export async function saveGoogleReviewUrl(formData: FormData): Promise<{ error: string | null }> {
  const restaurantId = await requireTenant();

  // An empty field is how the owner removes the link, so it skips validation.
  const raw = String(formData.get('googleReviewUrl') ?? '').trim();
  if (raw !== '') {
    const parsed = ReviewUrlSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'That link is not valid.' };
    }
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('set_restaurant_google_review_url', {
    p_restaurant_id: restaurantId,
    p_url: raw === '' ? null : raw,
  });

  if (error) return { error: error.message || 'Could not save the review link.' };

  revalidatePath('/admin/settings');
  return { error: null };
}
