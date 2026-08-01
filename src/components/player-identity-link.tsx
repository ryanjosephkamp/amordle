'use client';

export function PlayerIdentityLink({
  publicProfileId,
  displayName,
  className,
}: {
  publicProfileId?: string | null | undefined;
  displayName: string;
  className?: string;
}) {
  if (!publicProfileId) return <span className={className}>{displayName}</span>;
  return (
    <a
      className={['player-identity-link', className].filter(Boolean).join(' ')}
      href={`/players/${encodeURIComponent(publicProfileId)}`}
      aria-label={`Open ${displayName}'s profile`}
    >
      {displayName}
    </a>
  );
}
