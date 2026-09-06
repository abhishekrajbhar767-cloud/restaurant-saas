'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import {
  BANNER_QUOTA_MESSAGE,
  MAX_PROMOTIONAL_BANNERS,
  MEDIA_HARD_MAX_BYTES,
  RESTAURANT_MEDIA_BUCKET,
  extensionFromFile,
  restaurantMediaPath,
  storagePathFromPublicUrl,
} from '@/lib/media/restaurant-media';
import type { LoyaltySettings, PromotionalBanner } from '@/types/database';

const ALLOWED_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

async function requireTenant() {
  const ctx = await requireRole(['owner', 'manager']);
  const restaurant = ctx.tenantMembership?.restaurant;
  if (!restaurant) throw new Error('No restaurant membership found.');
  return { restaurantId: restaurant.id, slug: restaurant.slug };
}

function rpcError(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (message.includes('BANNER_QUOTA')) return BANNER_QUOTA_MESSAGE;
  if (/JSON object requested|Failed to fetch|NetworkError/i.test(message)) return fallback;
  return message;
}

function revalidateMenu(slug: string) {
  revalidatePath('/admin/manager');
  revalidatePath(`/menu/${slug}`);
}

// Delete the physical object first. The row is only touched after Storage
// has accepted the remove — otherwise a deleted banner would leave an orphan
// file, which is the bloat this path exists to prevent.
async function deleteStoredMedia(url: string | null | undefined): Promise<{ error: string | null }> {
  const path = url ? storagePathFromPublicUrl(url) : null;
  if (!path) return { error: null };

  const supabase = createClient();
  const { error } = await supabase.storage.from(RESTAURANT_MEDIA_BUCKET).remove([path]);
  if (error) return { error: rpcError(error.message, 'Could not delete the old image from storage.') };
  return { error: null };
}

async function uploadRestaurantMedia(
  restaurantId: string,
  folder: 'banners' | 'loyalty',
  image: File
): Promise<{ url: string | null; error: string | null }> {
  if (!image || image.size === 0) return { url: null, error: 'Please choose an image to upload.' };
  if (!ALLOWED_TYPES.has(image.type)) return { url: null, error: 'Please upload a WebP, JPG, or PNG image.' };
  if (image.size > MEDIA_HARD_MAX_BYTES) {
    return { url: null, error: 'Images must be under 300KB. Compress the photo and try again.' };
  }

  const supabase = createClient();
  const path = restaurantMediaPath(restaurantId, folder, extensionFromFile(image));
  const { error } = await supabase.storage.from(RESTAURANT_MEDIA_BUCKET).upload(path, image, {
    contentType: image.type,
    upsert: false,
  });
  if (error) return { url: null, error: rpcError(error.message, 'Could not upload that image.') };

  const { data } = supabase.storage.from(RESTAURANT_MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

const BannerTitleSchema = z.string().trim().min(1, 'Give this offer a title.').max(80);

export async function createPromotionalBanner(
  formData: FormData
): Promise<{ banner: PromotionalBanner | null; error: string | null }> {
  const { restaurantId, slug } = await requireTenant();
  const parsed = BannerTitleSchema.safeParse(formData.get('title'));
  if (!parsed.success) return { banner: null, error: parsed.error.issues[0]?.message ?? 'Give this offer a title.' };

  const image = formData.get('image');
  if (!(image instanceof File)) return { banner: null, error: 'Please choose an image to upload.' };

  const supabase = createClient();
  const { count, error: countError } = await supabase
    .from('promotional_banners')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId);
  if (countError) return { banner: null, error: rpcError(countError.message, 'Could not check your banner limit.') };
  if ((count ?? 0) >= MAX_PROMOTIONAL_BANNERS) {
    return { banner: null, error: BANNER_QUOTA_MESSAGE };
  }

  const uploaded = await uploadRestaurantMedia(restaurantId, 'banners', image);
  if (uploaded.error || !uploaded.url) return { banner: null, error: uploaded.error ?? 'Could not upload that image.' };

  const { data, error } = await supabase
    .from('promotional_banners')
    .insert({
      restaurant_id: restaurantId,
      image_url: uploaded.url,
      title: parsed.data,
      is_active: true,
    })
    .select('*')
    .single();

  if (error || !data) {
    // The row never landed — don't leave the just-uploaded file behind.
    await deleteStoredMedia(uploaded.url);
    return { banner: null, error: rpcError(error?.message, 'Could not add that banner.') };
  }

  revalidateMenu(slug);
  return { banner: data, error: null };
}

export async function setPromotionalBannerActive(
  bannerId: string,
  isActive: boolean
): Promise<{ error: string | null }> {
  const { restaurantId, slug } = await requireTenant();
  const supabase = createClient();
  const { error } = await supabase
    .from('promotional_banners')
    .update({ is_active: isActive })
    .eq('id', bannerId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: rpcError(error.message, 'Could not update that banner.') };
  revalidateMenu(slug);
  return { error: null };
}

export async function deletePromotionalBanner(bannerId: string): Promise<{ error: string | null }> {
  const { restaurantId, slug } = await requireTenant();
  const supabase = createClient();

  const { data: banner, error: loadError } = await supabase
    .from('promotional_banners')
    .select('*')
    .eq('id', bannerId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (loadError) return { error: rpcError(loadError.message, 'Could not load that banner.') };
  if (!banner) return { error: 'That banner is already gone.' };

  const removed = await deleteStoredMedia(banner.image_url);
  if (removed.error) return removed;

  const { error } = await supabase
    .from('promotional_banners')
    .delete()
    .eq('id', bannerId)
    .eq('restaurant_id', restaurantId);
  if (error) return { error: rpcError(error.message, 'Could not delete that banner.') };

  revalidateMenu(slug);
  return { error: null };
}

const LoyaltySettingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  visitThreshold: z.coerce.number().int().min(1).max(50).optional(),
  discountPercentage: z.coerce.number().int().min(1).max(100).optional(),
  customText: z.string().trim().min(1, 'Write a short promotional line.').max(160).optional(),
});

export async function saveLoyaltySettings(
  input: z.input<typeof LoyaltySettingsSchema>
): Promise<{ settings: LoyaltySettings | null; error: string | null }> {
  const { restaurantId, slug } = await requireTenant();
  const parsed = LoyaltySettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { settings: null, error: parsed.error.issues[0]?.message ?? 'Those loyalty settings are not valid.' };
  }

  const patch: Partial<LoyaltySettings> = { restaurant_id: restaurantId };
  if (parsed.data.isEnabled !== undefined) patch.is_enabled = parsed.data.isEnabled;
  if (parsed.data.visitThreshold !== undefined) patch.visit_threshold = parsed.data.visitThreshold;
  if (parsed.data.discountPercentage !== undefined) patch.discount_percentage = parsed.data.discountPercentage;
  if (parsed.data.customText !== undefined) patch.custom_text = parsed.data.customText;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('loyalty_settings')
    .upsert(patch, { onConflict: 'restaurant_id' })
    .select('*')
    .single();

  if (error || !data) {
    return { settings: null, error: rpcError(error?.message, 'Could not save Loyalty Pass settings.') };
  }

  revalidateMenu(slug);
  return { settings: data, error: null };
}

export async function uploadLoyaltyBannerImage(
  formData: FormData
): Promise<{ settings: LoyaltySettings | null; error: string | null }> {
  const { restaurantId, slug } = await requireTenant();
  const image = formData.get('image');
  if (!(image instanceof File)) return { settings: null, error: 'Please choose an image to upload.' };

  const supabase = createClient();
  const { data: current, error: loadError } = await supabase
    .from('loyalty_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (loadError) return { settings: null, error: rpcError(loadError.message, 'Could not load Loyalty Pass settings.') };

  // Physical file first, then the row — same contract as banner delete.
  const removed = await deleteStoredMedia(current?.banner_image_url);
  if (removed.error) return { settings: null, error: removed.error };

  const uploaded = await uploadRestaurantMedia(restaurantId, 'loyalty', image);
  if (uploaded.error || !uploaded.url) return { settings: null, error: uploaded.error ?? 'Could not upload that image.' };

  const { data, error } = await supabase
    .from('loyalty_settings')
    .upsert(
      {
        restaurant_id: restaurantId,
        banner_image_url: uploaded.url,
        is_enabled: current?.is_enabled ?? false,
        visit_threshold: current?.visit_threshold ?? 5,
        discount_percentage: current?.discount_percentage ?? 10,
        custom_text: current?.custom_text ?? defaultLoyaltyText(current?.visit_threshold ?? 5, current?.discount_percentage ?? 10),
      },
      { onConflict: 'restaurant_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    await deleteStoredMedia(uploaded.url);
    return { settings: null, error: rpcError(error?.message, 'Could not save the Loyalty banner.') };
  }

  revalidateMenu(slug);
  return { settings: data, error: null };
}

export async function deleteLoyaltyBannerImage(): Promise<{ settings: LoyaltySettings | null; error: string | null }> {
  const { restaurantId, slug } = await requireTenant();
  const supabase = createClient();

  const { data: current, error: loadError } = await supabase
    .from('loyalty_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (loadError) return { settings: null, error: rpcError(loadError.message, 'Could not load Loyalty Pass settings.') };
  if (!current?.banner_image_url) return { settings: current, error: null };

  const removed = await deleteStoredMedia(current.banner_image_url);
  if (removed.error) return { settings: null, error: removed.error };

  const { data, error } = await supabase
    .from('loyalty_settings')
    .update({ banner_image_url: null })
    .eq('restaurant_id', restaurantId)
    .select('*')
    .single();
  if (error || !data) {
    return { settings: null, error: rpcError(error?.message, 'Could not remove the Loyalty banner.') };
  }

  revalidateMenu(slug);
  return { settings: data, error: null };
}

function defaultLoyaltyText(threshold: number, percent: number): string {
  return `Get ${percent}% OFF on your ${threshold}th visit!`;
}
