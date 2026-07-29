'use client';

import { useQuery } from '@tanstack/react-query';
import { getPublicProfile } from '@/adapters/supabase/public';
import { SkeletonRows } from '@/components/route-states';

export function PublicProfile({ publicProfileId }: { publicProfileId: string }) {
  const profile = useQuery({
    queryKey: ['public-profile', publicProfileId],
    queryFn: () => getPublicProfile(publicProfileId),
  });
  if (profile.isPending) return <SkeletonRows label="Loading player…" />;
  if (profile.isError) {
    return (
      <section className="status-panel">
        <h2>Player unavailable</h2>
        <button onClick={() => void profile.refetch()}>Try again</button>
      </section>
    );
  }
  if (!profile.data) {
    return (
      <section className="status-panel">
        <h2>Player not found</h2>
        <p>This profile may be private, unavailable, or no longer public.</p>
      </section>
    );
  }
  return (
    <section className="public-profile">
      <div
        className="profile-avatar mono"
        style={{ borderColor: profile.data.accent_color ?? '#2996a8' }}
        aria-hidden="true"
      >
        {(profile.data.display_name || 'P').slice(0, 2).toUpperCase()}
      </div>
      <div>
        <h2>{profile.data.display_name || 'Player'}</h2>
        <p className="prose">{profile.data.bio || 'No public bio.'}</p>
        <p className="mono">Flair: {profile.data.flair_key || 'none'}</p>
      </div>
    </section>
  );
}
