'use client';

import { getBrowserSupabase } from '@/adapters/supabase/browser';
import {
  avatarBucket,
  avatarExtension,
  maximumAvatarBytes,
  maximumAvatarDimension,
  maximumAvatarPixels,
  ownedAvatarPathFromUrl,
  sniffAvatarMime,
} from '@/domain/profile-avatar-upload';
import type { SupportedAvatarMime } from '@/domain/profile-avatar-upload';

export interface PreparedAvatar {
  blob: Blob;
  mime: SupportedAvatarMime;
  width: number;
  height: number;
  animated: boolean;
}

async function imageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('The selected image could not be decoded.'));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function sanitizeStillImage(
  file: File,
  mime: Exclude<SupportedAvatarMime, 'image/gif'>,
  width: number,
  height: number,
): Promise<Blob> {
  const scale = Math.min(1, maximumAvatarDimension / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const objectUrl = URL.createObjectURL(file);
  let bitmap: ImageBitmap | null = null;
  let fallbackImage: HTMLImageElement | null = null;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
    } else {
      fallbackImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('The selected image could not be decoded.'));
        image.src = objectUrl;
      });
    }
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d', { alpha: mime !== 'image/jpeg' });
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.drawImage(bitmap ?? fallbackImage!, 0, 0, outputWidth, outputHeight);
    const outputType = mime === 'image/jpeg' ? 'image/jpeg' : mime;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputType, outputType === 'image/jpeg' ? 0.9 : undefined),
    );
    if (!blob) throw new Error('The selected image could not be prepared.');
    return blob;
  } finally {
    bitmap?.close();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareAvatarFile(file: File): Promise<PreparedAvatar> {
  if (file.size <= 0 || file.size > maximumAvatarBytes) {
    throw new Error('Choose an image no larger than 6 MiB.');
  }
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mime = sniffAvatarMime(bytes);
  if (!mime || (file.type !== '' && file.type !== mime)) {
    throw new Error('Choose a valid PNG, JPEG, WebP, or GIF image.');
  }
  const dimensions = await imageDimensions(file);
  if (
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > maximumAvatarDimension ||
    dimensions.height > maximumAvatarDimension ||
    dimensions.width * dimensions.height > maximumAvatarPixels
  ) {
    throw new Error('Choose an image up to 4096 × 4096 pixels and 16.8 megapixels.');
  }
  const blob =
    mime === 'image/gif'
      ? file
      : await sanitizeStillImage(file, mime, dimensions.width, dimensions.height);
  if (blob.size > maximumAvatarBytes) throw new Error('The prepared image exceeds 6 MiB.');
  return { blob, mime, ...dimensions, animated: mime === 'image/gif' };
}

export async function uploadPreparedAvatar(prepared: PreparedAvatar) {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error('Profile image storage is unavailable.');
  const path = `avatars/${crypto.randomUUID()}.${avatarExtension(prepared.mime)}`;
  const { error } = await supabase.storage.from(avatarBucket).upload(path, prepared.blob, {
    cacheControl: '31536000',
    contentType: prepared.mime,
    upsert: false,
  });
  if (error) throw new Error('The profile image could not be uploaded.');
  const { data } = supabase.storage.from(avatarBucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

export async function removeOwnedAvatar(path: string): Promise<boolean> {
  const supabase = getBrowserSupabase();
  if (!supabase) return false;
  const { error } = await supabase.storage.from(avatarBucket).remove([path]);
  return !error;
}

function cleanupStorageKey(userId: string): string {
  return `amordle:avatar-cleanup:v1:${userId}`;
}

function pendingCleanupPaths(userId: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(cleanupStorageKey(userId)) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is string => typeof value === 'string' && value.startsWith('avatars/'),
        )
      : [];
  } catch {
    return [];
  }
}

export function ownedAvatarPathFromCurrentProject(url: string): string | null {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return projectUrl ? ownedAvatarPathFromUrl(url, projectUrl) : null;
}

export function queueAvatarCleanup(userId: string, path: string) {
  const next = [...new Set([...pendingCleanupPaths(userId), path])];
  localStorage.setItem(cleanupStorageKey(userId), JSON.stringify(next));
}

export async function flushAvatarCleanup(userId: string): Promise<number> {
  const pending = pendingCleanupPaths(userId);
  const remaining: string[] = [];
  let removed = 0;
  for (const path of pending) {
    if (await removeOwnedAvatar(path)) removed += 1;
    else remaining.push(path);
  }
  localStorage.setItem(cleanupStorageKey(userId), JSON.stringify(remaining));
  return removed;
}

export function clearAvatarCleanupQueue(userId: string): void {
  localStorage.removeItem(cleanupStorageKey(userId));
}
