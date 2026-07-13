import type { GameHistoryEntry, GuestProgressionState } from '../account/storageSchema'
import type { MultiplayerCompetitiveState } from '../multiplayer'
import { BarChart, CalendarHeatmap, ProgressMeter, TrendSparkline } from './charts'
import { getAverageAttempts, getStatsBucket, getWinRate } from './statistics'
import {
  createPlayerStatsOverview,
  type PlayerStatsAuthStatus,
  type PlayerStatsOverviewCard,
} from './playerStatsOverview'
import {
  selectCoinTrend,
  selectStreakCalendar,
  selectWinRateByLength,
  selectWinRateByScope,
  selectWinRateByTier,
  selectXpProgress,
} from './statsSelectors'
import { PublicSiteStatsPanel } from './PublicSiteStatsPanel'
import type { PublicSiteStatsRepository } from './siteStats'
import type { StatisticsState } from './types'

interface StatsDashboardProps {
  readonly authStatus?: PlayerStatsAuthStatus
  readonly competitiveMultiplayer?: MultiplayerCompetitiveState
  readonly history?: readonly GameHistoryEntry[]
  readonly progression?: GuestProgressionState
  readonly publicSiteStatsRepository?: PublicSiteStatsRepository
  readonly stats: StatisticsState
  readonly viewerUserId?: string
}

const buckets = [
  { label: 'og daily', mode: 'og', scope: 'daily' },
  { label: 'og practice', mode: 'og', scope: 'practice' },
  { label: 'go daily', mode: 'go', scope: 'daily' },
  { label: 'go practice', mode: 'go', scope: 'practice' },
] as const

const EMPTY_HISTORY: readonly GameHistoryEntry[] = []
const EMPTY_PROGRESSION: GuestProgressionState = {
  coins: 0,
  consumables: { removeIncorrectLetters: 0, revealOneLetter: 0 },
  economyOperationIds: [],
  economyRevision: 0,
  level: 1,
  xp: 0,
}

function StatsOverviewCards({ cards }: { readonly cards: readonly PlayerStatsOverviewCard[] }) {
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-3" key={card.key}>
          <dt className="break-words text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{card.label}</dt>
          <dd className="mt-1 break-words text-2xl font-black text-white">{card.value}</dd>
          <p className="mt-2 text-xs leading-5 text-slate-400">{card.description}</p>
        </div>
      ))}
    </dl>
  )
}

export function StatsDashboard({
  authStatus = 'unconfigured',
  competitiveMultiplayer,
  history = EMPTY_HISTORY,
  progression = EMPTY_PROGRESSION,
  publicSiteStatsRepository,
  stats,
  viewerUserId,
}: StatsDashboardProps) {
  const winRateByScope = selectWinRateByScope(stats)
  const winRateByLength = selectWinRateByLength(stats)
  const winRateByTier = selectWinRateByTier(history)
  const calendar = selectStreakCalendar(history)
  const xpProgress = selectXpProgress(progression)
  const coinTrend = selectCoinTrend(history)
  const overview = createPlayerStatsOverview({
    authStatus,
    competitiveMultiplayer,
    history,
    progression,
    stats,
    viewerUserId,
  })

  return (
    <section className="space-y-6" aria-labelledby="stats-dashboard-title">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">private player stats</p>
        <h2 id="stats-dashboard-title" className="text-3xl font-bold text-white">Statistics</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
          Stats separates private Solo gameplay, progression, local multiplayer performance cache, and aggregate public site totals. Signed-in snapshots sync through account cloud progress; public profile pages only show explicitly public metadata.
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="stats-provenance-title">
        <div>
          <h3 id="stats-provenance-title" className="text-2xl font-bold text-white">Data sources</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
            These cards explain where the numbers come from before the charts below.
          </p>
        </div>
        <StatsOverviewCards cards={overview.provenanceCards} />
      </section>

      <section className="space-y-3" aria-labelledby="stats-solo-summary-title">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-100">private Solo history</p>
          <h3 id="stats-solo-summary-title" className="text-2xl font-bold text-white">Solo summary</h3>
        </div>
        <StatsOverviewCards cards={overview.soloSummaryCards} />
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {buckets.map((item) => {
          const bucket = getStatsBucket(stats, item.mode, item.scope)
          const averageAttempts = getAverageAttempts(bucket)
          return (
            <article className="rounded-3xl border border-slate-700 bg-slate-950/70 p-4 text-sm text-slate-200" key={item.label}>
              <h3 className="text-lg font-bold text-white">{item.label}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3">
                <div><dt className="text-cyan-100">Played</dt><dd>{bucket.played}</dd></div>
                <div><dt className="text-cyan-100">Win rate</dt><dd>{getWinRate(bucket)}%</dd></div>
                <div><dt className="text-cyan-100">Current streak</dt><dd>{bucket.currentStreak}</dd></div>
                <div><dt className="text-cyan-100">Max streak</dt><dd>{bucket.maxStreak}</dd></div>
                <div><dt className="text-cyan-100">Best attempts</dt><dd>{bucket.bestAttempts ?? '—'}</dd></div>
                <div><dt className="text-cyan-100">Avg attempts</dt><dd>{averageAttempts ?? '—'}</dd></div>
              </dl>
            </article>
          )
        })}
      </div>

      <section className="space-y-3" aria-labelledby="stats-progression-title">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-100">progression transparency</p>
          <h3 id="stats-progression-title" className="text-2xl font-bold text-white">Level, XP, and coins</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
            These values use the existing progression math only. Phase 53 does not change reward, XP, coin, consumable, or Pay-to-Continue formulas.
          </p>
        </div>
        <StatsOverviewCards cards={overview.progressionCards} />
      </section>

      <section className="space-y-3" aria-labelledby="stats-multiplayer-summary-title">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-100">local multiplayer cache</p>
          <h3 id="stats-multiplayer-summary-title" className="text-2xl font-bold text-white">Multiplayer performance summary</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
            Multiplayer performance stays separate from Solo stats. The Leaderboard page remains the home for detailed Elo copy and public ranked Practice tables.
          </p>
        </div>
        <StatsOverviewCards cards={overview.multiplayerSummaryCards} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-700 bg-slate-950/70 p-4">
          <BarChart caption="Win rate by mode & scope" data={winRateByScope} emptyMessage="Play a game to see win rates by mode." />
        </article>
        <article className="rounded-3xl border border-slate-700 bg-slate-950/70 p-4">
          <BarChart caption="Win rate by word length" data={winRateByLength} emptyMessage="No length data yet — finish a game to populate this chart." />
        </article>
        <article className="rounded-3xl border border-slate-700 bg-slate-950/70 p-4">
          <BarChart caption="Win rate by difficulty tier" data={winRateByTier} emptyMessage="Difficulty-tagged games appear here once you play with the new tier tracking." />
        </article>
        <article className="rounded-3xl border border-slate-700 bg-slate-950/70 p-4">
          <ProgressMeter progress={xpProgress} />
        </article>
        <article className="rounded-3xl border border-slate-700 bg-slate-950/70 p-4">
          <CalendarHeatmap caption="Recent activity" data={calendar} />
        </article>
        <article className="rounded-3xl border border-slate-700 bg-slate-950/70 p-4">
          <TrendSparkline caption="Coins earned trend" data={coinTrend} emptyMessage="Earn coins by completing games to see your trend." />
        </article>
      </div>

      <PublicSiteStatsPanel repository={publicSiteStatsRepository} />
    </section>
  )
}
