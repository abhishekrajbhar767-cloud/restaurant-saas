// lib/media/compress-image.ts
//
// Managers upload phone photos that routinely land at 3–8MB. Sending those
// straight to Storage would bloat the restaurant_media bucket and stall the
// customer carousel on a 4G table. We shrink on the client with Canvas
// before the server action ever sees the bytes: max 1200px on the long edge,
// WebP (JPEG fallback), walking quality and then scale until we are under
// 300KB. The bucket itself also rejects anything larger.

import { MEDIA_HARD_MAX_BYTES, MEDIA_MAX_WIDTH, MEDIA_TARGET_BYTES } from '@/lib/media/restaurant-media';

export { MEDIA_HARD_MAX_BYTES, MEDIA_MAX_WIDTH, MEDIA_TARGET_BYTES };

const MIN_QUALITY = 0.42;
const MIN_WIDTH = 480;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, or WebP).');
  }

  const source = await decodeImage(file);
  try {
    const startWidth = Math.min(source.width, MEDIA_MAX_WIDTH);
    const startHeight = Math.max(1, Math.round(source.height * (startWidth / source.width)));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not compress this image on this device.');

    const mime = await pickMime(canvas);
    let width = startWidth;
    let height = startHeight;
    let quality = 0.82;
    let blob = await drawAndEncode(ctx, canvas, source, width, height, mime, quality);

    while (blob.size > MEDIA_TARGET_BYTES && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.08);
      blob = await drawAndEncode(ctx, canvas, source, width, height, mime, quality);
    }

    while (blob.size > MEDIA_TARGET_BYTES && width > MIN_WIDTH) {
      width = Math.max(MIN_WIDTH, Math.round(width * 0.85));
      height = Math.max(1, Math.round(source.height * (width / source.width)));
      blob = await drawAndEncode(ctx, canvas, source, width, height, mime, quality);
    }

    if (blob.size > MEDIA_HARD_MAX_BYTES) {
      throw new Error('That photo is still too large after compression. Please pick a simpler image.');
    }

    const ext = mime === 'image/webp' ? 'webp' : 'jpg';
    const name = file.name.replace(/\.[^.]+$/, '') || 'upload';
    return new File([blob], `${name}.${ext}`, { type: mime, lastModified: Date.now() });
  } finally {
    source.close();
  }
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error('Could not read that image. Try a JPG or PNG instead.');
  }
}

async function pickMime(canvas: HTMLCanvasElement): Promise<'image/webp' | 'image/jpeg'> {
  const webp = await blobFromCanvas(canvas, 'image/webp', 0.8);
  if (webp && webp.size > 0 && webp.type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

async function drawAndEncode(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  width: number,
  height: number,
  mime: 'image/webp' | 'image/jpeg',
  quality: number
): Promise<Blob> {
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await blobFromCanvas(canvas, mime, quality);
  if (!blob || blob.size === 0) {
    throw new Error('Could not compress this image.');
  }
  return blob;
}

function blobFromCanvas(
  canvas: HTMLCanvasElement,
  mime: 'image/webp' | 'image/jpeg',
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}
