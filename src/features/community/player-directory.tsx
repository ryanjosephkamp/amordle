'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getPublicPlayerDirectory } from '@/adapters/supabase/public';
import { PlayerIdentityLink } from '@/components/player-identity-link';
import {
  profileAccentCss,
  publicRatingBucketLabels,
  publicRatingBuckets,
  ratingBucketLabel,
} from '@/domain/profile';
import type { PublicRatingBucket } from '@/domain/profile';

interface DirectoryFilters {
  search: string;
  bucket: PublicRatingBucket;
  minRating: number | null;
  maxRating: number | null;
  sort: 'rating' | 'games' | 'name' | 'recent';
}

const pageSize = 50;
const defaults: DirectoryFilters = {
  search: '',
  bucket: 'multiplayer:og',
  minRating: null,
  maxRating: null,
  sort: 'rating',
};

export function PlayerDirectory() {
  const [draft, setDraft] = useState(defaults);
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(0);
  const directory = useQuery({
    queryKey: ['player-directory', filters, page],
    queryFn: () =>
      getPublicPlayerDirectory({ ...filters, offset: page * pageSize, limit: pageSize }),
    placeholderData: (previous) => previous,
  });
  const total = directory.data?.[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="player-directory">
      <form
        className="directory-controls"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setFilters({ ...draft, search: draft.search.trim() });
        }}
      >
        <label>
          Player name
          <input
            type="search"
            maxLength={50}
            placeholder="Starts with…"
            value={draft.search}
            onChange={(event) => setDraft({ ...draft, search: event.target.value })}
          />
        </label>
        <label>
          Rating lane
          <select
            value={draft.bucket}
            onChange={(event) =>
              setDraft({ ...draft, bucket: event.target.value as PublicRatingBucket })
            }
          >
            {publicRatingBuckets.map((bucket) => (
              <option key={bucket} value={bucket}>
                {publicRatingBucketLabels[bucket]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum rating
          <input
            type="number"
            min={0}
            max={10000}
            value={draft.minRating ?? ''}
            onChange={(event) =>
              setDraft({
                ...draft,
                minRating: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          Maximum rating
          <input
            type="number"
            min={0}
            max={10000}
            value={draft.maxRating ?? ''}
            onChange={(event) =>
              setDraft({
                ...draft,
                maxRating: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
        </label>
        <label>
          Sort
          <select
            value={draft.sort}
            onChange={(event) =>
              setDraft({ ...draft, sort: event.target.value as DirectoryFilters['sort'] })
            }
          >
            <option value="rating">Highest rating</option>
            <option value="games">Most ranked games</option>
            <option value="name">Player name</option>
            <option value="recent">Recently updated</option>
          </select>
        </label>
        <button className="primary">APPLY</button>
      </form>

      <div className="section-heading">
        <h2>Players</h2>
        <span>
          {directory.isPending ? 'loading' : `${total} result${total === 1 ? '' : 's'}`} ·{' '}
          {ratingBucketLabel(filters.bucket)}
        </span>
      </div>
      {directory.isError ? (
        <section className="status-panel">
          <h2>Player directory unavailable</h2>
          <button onClick={() => void directory.refetch()}>Try again</button>
        </section>
      ) : directory.data?.length ? (
        <div className="directory-list" aria-busy={directory.isFetching}>
          {directory.data.map((player) => (
            <article
              key={player.public_profile_id}
              style={
                {
                  '--profile-accent': profileAccentCss(player.accent_color, player.accent_hex),
                } as React.CSSProperties
              }
            >
              <div>
                <PlayerIdentityLink
                  className="directory-player-name"
                  publicProfileId={player.public_profile_id}
                  displayName={player.display_name}
                />
                <span>{player.flair_key === 'none' ? 'Player' : player.flair_key}</span>
              </div>
              <dl>
                <div>
                  <dt>rating</dt>
                  <dd>{player.rating ?? '—'}</dd>
                </div>
                <div>
                  <dt>games</dt>
                  <dd>{player.games_played ?? 0}</dd>
                </div>
                <div>
                  <dt>w–l–d</dt>
                  <dd>
                    {player.wins ?? 0}–{player.losses ?? 0}–{player.draws ?? 0}
                  </dd>
                </div>
                <div>
                  <dt>status</dt>
                  <dd>
                    {player.provisional == null
                      ? 'unrated'
                      : player.provisional
                        ? 'prov.'
                        : 'rated'}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : !directory.isPending ? (
        <p className="empty-copy">No public players match these filters.</p>
      ) : (
        <p role="status">Loading players…</p>
      )}
      <nav className="pagination" aria-label="Player directory pages">
        <button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
          Previous
        </button>
        <span>
          page {Math.min(page + 1, pages)} / {pages}
        </span>
        <button
          disabled={(page + 1) * pageSize >= total}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
