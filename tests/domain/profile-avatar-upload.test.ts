import { describe, expect, it } from 'vitest';
import {
  avatarBucket,
  avatarExtension,
  maximumAvatarBytes,
  ownedAvatarPathFromUrl,
  sniffAvatarMime,
} from '@/domain/profile-avatar-upload';

describe('public profile avatar authority', () => {
  it('accepts only the four approved image signatures', () => {
    expect(sniffAvatarMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]))).toBe(
      'image/png',
    );
    expect(sniffAvatarMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xdb]))).toBe('image/jpeg');
    expect(sniffAvatarMime(new TextEncoder().encode('RIFF0000WEBP'))).toBe('image/webp');
    expect(sniffAvatarMime(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(sniffAvatarMime(new TextEncoder().encode('<svg onload="alert(1)">'))).toBeNull();
  });

  it('uses immutable random object paths without raw account identifiers', () => {
    const projectUrl = 'https://squqdstdvbsvhagfuzgj.supabase.co';
    const path = 'avatars/123e4567-e89b-12d3-a456-426614174000.png';
    const publicUrl = `${projectUrl}/storage/v1/object/public/${avatarBucket}/${path}`;
    expect(ownedAvatarPathFromUrl(publicUrl, projectUrl)).toBe(path);
    expect(ownedAvatarPathFromUrl(publicUrl, 'https://different-project.supabase.co')).toBeNull();
    expect(
      ownedAvatarPathFromUrl(
        `${projectUrl}/storage/v1/object/public/${avatarBucket}/avatars/user@example.com.png`,
        projectUrl,
      ),
    ).toBeNull();
  });

  it('keeps the bounded zero-cost upload contract explicit', () => {
    expect(maximumAvatarBytes).toBe(6 * 1024 * 1024);
    expect(avatarExtension('image/jpeg')).toBe('jpg');
    expect(avatarExtension('image/gif')).toBe('gif');
  });
});
