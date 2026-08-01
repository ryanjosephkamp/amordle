'use client';

import { useState } from 'react';
import { accentCssColor } from '@/domain/profile';
import type { AccentName } from '@/domain/profile';

export function ProfileAvatar({
  avatarUrl,
  displayName,
  accentColor,
  label,
}: {
  avatarUrl?: string | null;
  displayName?: string | null;
  accentColor?: AccentName | null;
  label?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const initials = (displayName || 'Player')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className="profile-avatar profile-avatar--large"
      style={{ borderColor: accentCssColor(accentColor) }}
    >
      {avatarUrl && avatarUrl !== failedUrl ? (
        // Remote profile images are intentionally loaded by the browser from owner-supplied HTTPS URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={label ?? `${displayName || 'Player'} profile image`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        <span className="mono" aria-label={label ?? `${displayName || 'Player'} image placeholder`}>
          {initials || 'P'}
        </span>
      )}
    </div>
  );
}
