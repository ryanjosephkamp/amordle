import { Button, Panel } from '../ui'
import { normalizeCompetitiveMultiplayerState, type MultiplayerCompetitiveState } from './competitiveMultiplayer'
import {
  MULTIPLAYER_PROVISIONAL_GAMES,
  getMultiplayerRankBand,
  type RatingBucketId,
  type MultiplayerRatingProfile,
} from './rating'

interface MultiplayerStatsPanelProps {
  readonly onOpenEloAbout?: () => void
  readonly state?: MultiplayerCompetitiveState
  readonly viewerUserId?: string
}

const BUCKET_LABELS: Record<RatingBucketId, string> = {
  'multiplayer:go': 'Ranked Practice GO',
  'multiplayer:go:daily:v1': 'Ranked Daily GO',
  'multiplayer:go:timed:v1': 'Timed Ranked Practice GO',
  'multiplayer:og': 'Ranked Practice OG',
  'multiplayer:og:daily:v1': 'Ranked Daily OG',
  'multiplayer:og:timed:v1': 'Timed Ranked Practice OG',
}

function bucketLabel(bucket: RatingBucketId): string {
  return BUCKET_LABELS[bucket]
}

function ratingProfileKey(profile: Pick<MultiplayerRatingProfile, 'bucket' | 'userId'>): string {
  return `${profile.bucket}:${profile.userId}`
}

function selectDisplayRatingProfiles(
  profiles: readonly MultiplayerRatingProfile[],
  viewerUserId?: string,
): readonly MultiplayerRatingProfile[] {
  const trimmedViewerUserId = typeof viewerUserId === 'string' ? viewerUserId.trim() : ''
  const eligibleProfiles = trimmedViewerUserId
    ? profiles.filter((profile) => profile.userId === trimmedViewerUserId)
    : profiles
  const profileMap = new Map<string, MultiplayerRatingProfile>()
  for (const profile of eligibleProfiles) {
    const key = ratingProfileKey(profile)
    const existing = profileMap.get(key)
    if (!existing || profile.updatedAt > existing.updatedAt) {
      profileMap.set(key, profile)
    }
  }
  return Array.from(profileMap.values())
    .sort((left, right) => left.bucket.localeCompare(right.bucket) || left.userId.localeCompare(right.userId))
}

function provisionalLabel(profile: MultiplayerRatingProfile): string {
  if (!profile.provisional) {
    return 'Established'
  }
  const remaining = Math.max(0, MULTIPLAYER_PROVISIONAL_GAMES - profile.gamesPlayed)
  return `Provisional · ${remaining} ${remaining === 1 ? 'match' : 'matches'} until established`
}

export function MultiplayerStatsPanel({ onOpenEloAbout, state, viewerUserId }: MultiplayerStatsPanelProps) {
  const competitive = normalizeCompetitiveMultiplayerState(state)
  const recentResults = competitive.results.slice(0, 6)
  const recentTransactions = competitive.rating.transactions.slice(0, 6)
  const displayRatingProfiles = selectDisplayRatingProfiles(competitive.rating.profiles, viewerUserId)

  return (
    <section className="space-y-4" aria-labelledby="multiplayer-stats-title">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">multiplayer ratings</p>
        <h3 id="multiplayer-stats-title" className="text-2xl font-bold text-white">Competitive multiplayer</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Ranked results are tracked separately from solo stats. Points decide match results; Elo changes only after confirmed ranked results are recorded.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="space-y-3 text-sm text-slate-300 lg:col-span-2" tone="muted">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-bold text-white">Ranked Elo</h4>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
                Rating buckets are separate Elo tracks for ranked Practice and ranked Daily OG/GO. The full formula and ranked boundaries live in About.
              </p>
            </div>
            {onOpenEloAbout ? (
              <Button onClick={onOpenEloAbout} size="sm" variant="secondary">How is Elo calculated?</Button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-slate-400">
            Only eligible ranked Practice and ranked Daily games affect Elo. Custom ranked and unsupported timed Practice rows stay unrated; public leaderboards are display-only.
            {' '}
            Rank bands are display labels for current Elo ranges and do not affect matchmaking or settlement.
          </p>
        </Panel>

        <Panel className="space-y-3 text-sm text-slate-300" tone="muted">
          <h4 className="text-lg font-bold text-white">Rating buckets</h4>
          {displayRatingProfiles.length > 0 ? (
            <div className="grid gap-2">
              {displayRatingProfiles.map((profile) => {
                const rankBand = getMultiplayerRankBand(profile.rating)
                return (
                  <article className="rounded-lg border border-white/10 bg-black/30 p-3" key={`${profile.bucket}-${profile.userId}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-cyan-100">{bucketLabel(profile.bucket)}</p>
                      <div className="text-right">
                        <p className="text-xl font-black text-white">{profile.rating}</p>
                        <p className="text-xs font-semibold text-cyan-100">{rankBand.label} band</p>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {provisionalLabel(profile)} · {profile.gamesPlayed} rated · {profile.wins}-{profile.losses}-{profile.draws}
                    </p>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-white/10 bg-black/30 p-3">
              No rated results yet. Ranked matches need two authenticated players, trusted queue finalization, and a confirmed ranked result before Elo changes.
            </p>
          )}
        </Panel>

        <Panel className="space-y-3 text-sm text-slate-300" tone="muted">
          <h4 className="text-lg font-bold text-white">Recent multiplayer results</h4>
          {recentResults.length > 0 ? (
            <div className="grid gap-2">
              {recentResults.map((result) => (
                <article className="rounded-lg border border-white/10 bg-black/30 p-3" key={result.sourceMatchId}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-cyan-100">{bucketLabel(result.bucket)} · {result.scope}</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{result.ranked ? 'ranked' : 'unranked'}</p>
                  </div>
                  <p className="mt-1">{result.summary}</p>
                  {!result.ranked ? (
                    <p className="mt-1 text-xs text-slate-500">Unranked, custom, Daily, unsupported timed Practice, guest, corrupt, or spectator-only outcomes do not move Elo.</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-white/10 bg-black/30 p-3">No multiplayer results recorded yet.</p>
          )}
        </Panel>
      </div>

      {recentTransactions.length > 0 ? (
        <Panel className="space-y-3 text-sm text-slate-300" tone="muted">
          <h4 className="text-lg font-bold text-white">Rating changes</h4>
          <p className="text-xs leading-5 text-slate-400">
            These rows come from confirmed ranked rating changes. Local preview state is display/cache only and is not rating authority.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {recentTransactions.map((transaction) => (
              <article className="rounded-lg border border-white/10 bg-black/30 p-3" key={transaction.id}>
                <p className="font-semibold text-cyan-100">{bucketLabel(transaction.bucket)}</p>
                <p className="mt-1">
                  {transaction.outcome} · {transaction.oldRating} → {transaction.newRating}
                  {' '}
                  ({transaction.ratingDelta >= 0 ? '+' : ''}{transaction.ratingDelta})
                </p>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}
    </section>
  )
}
