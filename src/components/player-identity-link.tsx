'use client';

import { isCreatorProfile, publicProfilePath } from '@/domain/profile';

export function PlayerIdentityLink({
  publicProfileId,
  displayName,
  className,
}: {
  publicProfileId?: string | null | undefined;
  displayName: string;
  className?: string;
}) {
  /*
   * The creator mark rides on this component because it is the one place every
   * player name in the app is rendered — a leaderboard row, the directory, a
   * COMBAT transcript. Marking it here means the name is recognisable wherever
   * it turns up, to every viewer, without a single caller knowing about it.
   */
  const creator = isCreatorProfile(publicProfileId);
  if (!publicProfileId) return <span className={className}>{displayName}</span>;
  return (
    <a
      className={['player-identity-link', creator && 'is-creator-name', className]
        .filter(Boolean)
        .join(' ')}
      href={publicProfilePath(publicProfileId)}
      aria-label={`Open ${displayName}'s profile`}
    >
      {displayName}
    </a>
  );
}
