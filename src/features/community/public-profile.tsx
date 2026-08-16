'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  getMyPublicProfile,
  getPublicPlayerStats,
  getPublicProfile,
} from '@/adapters/supabase/public';
import { myProfileQueryKey } from '@/application/query-keys';
import { CopyButton } from '@/components/copy-button';
import { useAuth } from '@/components/providers';
import { SkeletonRows } from '@/components/route-states';
import {
  flairLabels,
  flairNameSchema,
  isCreatorProfile,
  profileAccentCss,
  publicProfilePath,
  ratingBucketLabel,
} from '@/domain/profile';
import { PrivateChallengeForm } from '@/features/combat/private-challenge-form';
import { ProfileAvatar } from './profile-avatar';

export function PublicProfile({ publicProfileId }: { publicProfileId: string }) {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const profile = useQuery({
    queryKey: ['public-profile', publicProfileId],
    queryFn: () => getPublicProfile(publicProfileId),
  });
  const stats = useQuery({
    queryKey: ['public-profile-stats', publicProfileId],
    queryFn: () => getPublicPlayerStats(publicProfileId),
  });
  const mine = useQuery({
    queryKey: myProfileQueryKey(userId),
    queryFn: getMyPublicProfile,
    enabled: auth.status === 'signed-in' && Boolean(userId),
  });
  /*
   * This page used to redirect its owner to /profile, which meant nobody could
   * ever see their own public profile as a visitor sees it — and made the link
   * they are invited to copy the one address they could not open. The owner now
   * reads the same page everyone else does, with a way back to the editor.
   */
  const isMine = mine.data?.public_profile_id === publicProfileId;
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
    /*
     * Your own private profile resolves to nothing here, exactly as it does for
     * everybody else — which is the correct answer and a baffling one to read
     * about yourself. Say which it is, and offer the way to change it.
     */
    if (isMine) {
      return (
        <section className="status-panel">
          <h2>Your profile is not public</h2>
          <p>
            This is your public address, and it shows nothing to visitors while your profile is
            private. Publishing it in the editor is what makes this page appear.
          </p>
          <Link className="button primary" href="/profile">
            EDIT PROFILE
          </Link>
        </section>
      );
    }
    return (
      <section className="status-panel">
        <h2>Player not found</h2>
        <p>This profile is unavailable or no longer public.</p>
      </section>
    );
  }

  const displayName = profile.data.display_name || 'Player';
  const flair = flairNameSchema.safeParse(profile.data.flair_key);
  /*
   * The tricolour treatment is confined to this one page and this one account.
   * It is a class on the console, so every rule that draws it is scoped under
   * `.creator-console` and cannot reach the shell, the keyboard, a board, or
   * anybody else's profile.
   */
  const creator = isCreatorProfile(publicProfileId);
  return (
    <div
      className={creator ? 'public-profile-console creator-console' : 'public-profile-console'}
      style={
        {
          '--profile-accent': profileAccentCss(profile.data.accent_color, profile.data.accent_hex),
        } as React.CSSProperties
      }
    >
      <section className="public-profile" aria-labelledby="public-player-name">
        <ProfileAvatar
          avatarUrl={profile.data.avatar_url}
          displayName={displayName}
          accentColor={profile.data.accent_color}
          accentHex={profile.data.accent_hex}
        />
        <div className="public-profile-copy">
          <span className="profile-kicker">PUBLIC PLAYER</span>
          <h2 id="public-player-name" className={creator ? 'is-creator-name' : undefined}>
            {displayName}
          </h2>
          <p className="prose">{profile.data.bio || 'No public bio.'}</p>
          <div className="profile-tags">
            <span className={flair.success && flair.data === 'creator' ? 'is-creator' : undefined}>
              {flair.success ? flairLabels[flair.data] : 'No flair'}
            </span>
            <span>
              {profile.data.accent_hex
                ? `${profile.data.accent_hex} custom accent`
                : `${profile.data.accent_color ?? 'aurora'} accent`}
            </span>
          </div>
        </div>
        <div className="action-row">
          <CopyButton
            className="button"
            label="COPY LINK"
            value={() => `${window.location.origin}${publicProfilePath(publicProfileId)}`}
          />
          {/*
           * Reachable again. This link existed before the redirect made it
           * impossible to arrive here, and it is the way back out of the
           * preview — the reason it is safe to leave a player on their own
           * public page rather than bouncing them to the editor.
           */}
          {isMine && (
            <Link className="button" href="/profile">
              EDIT PROFILE
            </Link>
          )}
        </div>
      </section>

      <section className="public-stats" aria-labelledby="public-stats-heading">
        <div className="section-heading">
          <h2 id="public-stats-heading">Public COMBAT record</h2>
          <span>service-confirmed</span>
        </div>
        {stats.isPending ? (
          <SkeletonRows label="Loading public record…" rows={3} />
        ) : stats.isError ? (
          <div className="status-line status-line--warning">
            <span>Public record could not refresh.</span>
            <button className="text-action" onClick={() => void stats.refetch()}>
              Retry
            </button>
          </div>
        ) : !stats.data ? (
          <p className="empty-copy">No public COMBAT record is available.</p>
        ) : (
          <>
            <dl className="public-stat-grid">
              <PublicMetric label="completed" value={stats.data.overall.gamesCompleted} />
              <PublicMetric label="wins" value={stats.data.overall.wins} />
              <PublicMetric label="losses" value={stats.data.overall.losses} />
              <PublicMetric label="draws" value={stats.data.overall.draws} />
              <PublicMetric label="accepted guesses" value={stats.data.overall.acceptedGuesses} />
              <PublicMetric label="puzzles solved" value={stats.data.overall.puzzlesSolved} />
            </dl>
            <dl className="public-breakdown-grid">
              <PublicMetric
                label="practice / daily"
                value={`${stats.data.breakdowns.practice} / ${stats.data.breakdowns.daily}`}
              />
              <PublicMetric
                label="og / go"
                value={`${stats.data.breakdowns.og} / ${stats.data.breakdowns.go}`}
              />
              <PublicMetric
                label="ranked / unranked"
                value={`${stats.data.breakdowns.ranked} / ${stats.data.breakdowns.unranked}`}
              />
            </dl>
            {stats.data.ratings.length ? (
              <div className="public-rating-list">
                {stats.data.ratings.map((rating) => (
                  <article key={rating.bucket}>
                    <span>{ratingBucketLabel(rating.bucket)}</span>
                    <strong>{rating.rating}</strong>
                    <small>
                      peak {rating.peakRating} · {rating.wins}–{rating.losses}–{rating.draws} ·{' '}
                      {rating.provisional ? 'provisional' : 'established'}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No ranked rating has been established yet.</p>
            )}
          </>
        )}
      </section>

      {!isMine && auth.status === 'signed-in' && (
        <PrivateChallengeForm
          targetPublicProfileId={publicProfileId}
          targetDisplayName={displayName}
        />
      )}
      {!isMine && auth.status === 'signed-out' && (
        <section className="profile-challenge-gate">
          <h2>Challenge this player</h2>
          <p>Sign in to send a private Practice request.</p>
          <Link className="button primary" href="/auth">
            SIGN IN
          </Link>
        </section>
      )}
    </div>
  );
}

function PublicMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
