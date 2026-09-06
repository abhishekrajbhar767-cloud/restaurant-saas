// lib/media/restaurant-media.ts
//
// Public URLs from restaurant_media look like
//   …/storage/v1/object/public/restaurant_media/<restaurant_id>/banners/<id>.webp
// Garbage collection has to turn that back into the object path Storage
// expects. External (pasted) URLs from before this bucket existed return
// null — there is nothing in our bucket to delete.

export const RESTAURANT_MEDIA_BUCKET = 'restaurant_media';
export const MAX_PROMOTIONAL_BANNERS = 3;
export const BANNER_QUOTA_MESSAGE = 'Maximum banner limit (3) reached. Please delete an old banner first.';
export const MEDIA_MAX_WIDTH = 1200;
export const MEDIA_TARGET_BYTES = 300 * 1024;
export const MEDIA_HARD_MAX_BYTES = 300 * 1024;

export function restaurantMediaPath(restaurantId: string, folder: 'banners' | 'loyalty', ext: string): string {
  const safeExt = ext.replace(/^\./, '').toLowerCase() || 'webp';
  return `${restaurantId}/${folder}/${crypto.randomUUID()}.${safeExt}`;
}

export function storagePathFromPublicUrl(url: string, bucket = RESTAURANT_MEDIA_BUCKET): string | null {
  const trimmed = url.trim();
  if (trimmed === '') return null;

  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;

  const path = decodeURIComponent(trimmed.slice(idx + marker.length).split('?')[0] ?? '');
  return path === '' ? null : path;
}

export function extensionFromFile(file: File): string {
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName === 'jpeg') return 'jpg';
  if (fromName === 'webp' || fromName === 'jpg' || fromName === 'png') return fromName;
  return 'webp';
}
