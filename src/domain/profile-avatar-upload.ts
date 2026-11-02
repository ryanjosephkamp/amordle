export const avatarBucket = 'amordle-public-avatars-v1';
export const maximumAvatarBytes = 6 * 1024 * 1024;
export const maximumAvatarDimension = 4096;
export const maximumAvatarPixels = 16_800_000;

export type SupportedAvatarMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

const extensions: Record<SupportedAvatarMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function avatarExtension(mime: SupportedAvatarMime): string {
  return extensions[mime];
}

export function sniffAvatarMime(bytes: Uint8Array): SupportedAvatarMime | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    bytes.length >= 6 &&
    ['GIF87a', 'GIF89a'].includes(new TextDecoder().decode(bytes.slice(0, 6)))
  ) {
    return 'image/gif';
  }
  return null;
}

export function ownedAvatarPathFromUrl(url: string, projectUrl: string): string | null {
  try {
    const parsed = new URL(url);
    const project = new URL(projectUrl);
    if (parsed.origin !== project.origin) return null;
    const prefix = `/storage/v1/object/public/${avatarBucket}/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return /^avatars\/[0-9a-f-]{36}\.(?:png|jpg|webp|gif)$/i.test(path) ? path : null;
  } catch {
    return null;
  }
}
