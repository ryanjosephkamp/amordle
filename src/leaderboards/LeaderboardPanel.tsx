import { MultiplayerStatsPanel } from '../multiplayer/MultiplayerStatsPanel'
import type { MultiplayerCompetitiveState } from '../multiplayer/competitiveMultiplayer'
import { PublicRankedLeaderboardPanel, type PublicRankedLeaderboardAuthStatus } from './PublicRankedLeaderboardPanel'
import { getPublicRankedLeaderboardFreshnessKey } from './leaderboardFreshness'
import type { PublicRankedLeaderboardRepository } from './publicRankedLeaderboard'

interface LeaderboardPanelProps {
  readonly authStatus?: PublicRankedLeaderboardAuthStatus
  readonly competitiveMultiplayer?: MultiplayerCompetitiveState
  readonly onOpenEloAbout?: () => void
  readonly onOpenPublicProfile?: (publicProfileId: string) => void
  readonly publicRankedLeaderboardRepository?: PublicRankedLeaderboardRepository
  readonly viewerUserId?: string
}

export function LeaderboardPanel({
  authStatus = 'unconfigured',
  competitiveMultiplayer,
  onOpenEloAbout,
  onOpenPublicProfile,
  publicRankedLeaderboardRepository,
  viewerUserId,
}: LeaderboardPanelProps) {
  const localCompetitiveMultiplayer = authStatus === 'authenticated' ? competitiveMultiplayer : undefined
  const localViewerUserId = authStatus === 'authenticated' ? viewerUserId : undefined

  return (
    <section className="space-y-6" aria-labelledby="leaderboard-title">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">competitive hub</p>
        <h2 id="leaderboard-title" className="text-3xl font-bold text-white">Leaderboard</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Public ranked Practice and Daily leaderboards and competitive multiplayer ratings live here. Local gameplay history stays in Stats.
        </p>
      </div>

      <PublicRankedLeaderboardPanel
        authStatus={authStatus}
        freshnessKey={getPublicRankedLeaderboardFreshnessKey(localCompetitiveMultiplayer)}
        onOpenPublicProfile={onOpenPublicProfile}
        repository={publicRankedLeaderboardRepository}
      />

      <MultiplayerStatsPanel
        onOpenEloAbout={onOpenEloAbout}
        state={localCompetitiveMultiplayer}
        viewerUserId={localViewerUserId}
      />
    </section>
  )
}
