import type { GameHistoryEntry, GuestProgressionState } from '../account/storageSchema'
import {
  normalizeCompetitiveMultiplayerState,
  type MultiplayerCompetitiveState,
} from '../multiplayer/competitiveMultiplayer'
import type { StatisticsState } from './types'
import { getStatsBucket } from './statistics'
import { selectXpProgress } from './statsSelectors'

export type PlayerStatsAuthStatus = 'anonymous' | 'authenticated' | 'unconfigured'

export interface PlayerStatsOverviewCard {
  readonly description: string
  readonly key: string
  readonly label: string
  readonly value: string
}

export interface PlayerStatsOverviewInput {
  readonly authStatus?: PlayerStatsAuthStatus
  readonly competitiveMultiplayer?: MultiplayerCompetitiveState
  readonly history?: readonly GameHistoryEntry[]
  readonly progression: GuestProgressionState
  readonly stats: StatisticsState
  readonly viewerUserId?: string
}

export interface PlayerStatsOverview {
  readonly multiplayerSummaryCards: readonly PlayerStatsOverviewCard[]
  readonly progressionCards: readonly PlayerStatsOverviewCard[]
  readonly provenanceCards: readonly PlayerStatsOverviewCard[]
  readonly soloSummaryCards: readonly PlayerStatsOverviewCard[]
}

const SCOPE_BUCKETS = [
  { mode: 'og', scope: 'daily' },
  { mode: 'og', scope: 'practice' },
  { mode: 'go', scope: 'daily' },
  { mode: 'go', scope: 'practice' },
] as const

const numberFormatter = new Intl.NumberFormat('en-US')

function formatNumber(value: number): string {
  return numberFormatter.format(Math.max(0, Math.floor(value)))
}

function getSyncScopeCard(authStatus: PlayerStatsAuthStatus): PlayerStatsOverviewCard {
  if (authStatus === 'authenticated') {
    return {
      description: 'Signed-in progress sync uploads and downloads this private progress snapshot through the existing account cloud-sync system.',
      key: 'sync-scope',
      label: 'Sync scope',
      value: 'Cloud-synced account snapshot',
    }
  }

  if (authStatus === 'anonymous') {
    return {
      description: 'Guest progress is stored locally on this browser until you sign in and choose to transfer it.',
      key: 'sync-scope',
      label: 'Sync scope',
      value: 'Local guest device',
    }
  }

  return {
    description: 'Supabase is not configured here, so this progress snapshot is local to the current environment.',
    key: 'sync-scope',
    label: 'Sync scope',
    value: 'Local-only environment',
  }
}

function countViewerRatingBuckets(state: MultiplayerCompetitiveState, viewerUserId?: string): number {
  const trimmedViewerUserId = typeof viewerUserId === 'string' ? viewerUserId.trim() : ''
  const buckets = new Set<string>()
  for (const profile of state.rating.profiles) {
    if (!trimmedViewerUserId || profile.userId === trimmedViewerUserId) {
      buckets.add(profile.bucket)
    }
  }
  return buckets.size
}

function countViewerRatingTransactions(state: MultiplayerCompetitiveState, viewerUserId?: string): number {
  const trimmedViewerUserId = typeof viewerUserId === 'string' ? viewerUserId.trim() : ''
  if (!trimmedViewerUserId) {
    return state.rating.transactions.length
  }
  return state.rating.transactions.filter((transaction) => transaction.userId === trimmedViewerUserId).length
}

export function createPlayerStatsOverview({
  authStatus = 'unconfigured',
  competitiveMultiplayer,
  history = [],
  progression,
  stats,
  viewerUserId,
}: PlayerStatsOverviewInput): PlayerStatsOverview {
  const soloTotals = SCOPE_BUCKETS.reduce(
    (totals, item) => {
      const bucket = getStatsBucket(stats, item.mode, item.scope)
      return {
        played: totals.played + bucket.played,
        won: totals.won + bucket.won,
      }
    },
    { played: 0, won: 0 },
  )
  const xpProgress = selectXpProgress(progression)
  const competitive = normalizeCompetitiveMultiplayerState(competitiveMultiplayer)

  return {
    multiplayerSummaryCards: [
      {
        description: 'Local cached Elo tracks shown for this signed-in player. These are separate from Solo stats and public leaderboards.',
        key: 'rating-buckets',
        label: 'Rating buckets',
        value: formatNumber(countViewerRatingBuckets(competitive, viewerUserId)),
      },
      {
        description: 'Recent local multiplayer results kept in the private progress snapshot.',
        key: 'multiplayer-results',
        label: 'Multiplayer results',
        value: formatNumber(competitive.results.length),
      },
      {
        description: 'Confirmed ranked Practice rating changes cached locally for display.',
        key: 'rating-changes',
        label: 'Rating changes',
        value: formatNumber(countViewerRatingTransactions(competitive, viewerUserId)),
      },
    ],
    progressionCards: [
      {
        description: `${formatNumber(xpProgress.xpIntoLevel)} of ${formatNumber(xpProgress.xpForLevel)} XP earned in this level.`,
        key: 'level',
        label: 'Current level',
        value: `Level ${formatNumber(xpProgress.level)}`,
      },
      {
        description: 'Derived from existing XP math; Phase 53 does not change reward formulas.',
        key: 'xp-next',
        label: 'XP to next level',
        value: `${formatNumber(xpProgress.xpToNextLevel)} XP`,
      },
      {
        description: 'Current coin balance from your private progression snapshot.',
        key: 'coins',
        label: 'Coins',
        value: formatNumber(progression.coins),
      },
    ],
    provenanceCards: [
      getSyncScopeCard(authStatus),
      {
        description: 'Stats, progression, history, and local multiplayer cache are not public profile fields.',
        key: 'public-exposure',
        label: 'Public exposure',
        value: 'Private by default',
      },
    ],
    soloSummaryCards: [
      {
        description: 'OG/GO Daily and Practice games completed in this private stats snapshot.',
        key: 'solo-games',
        label: 'Solo games recorded',
        value: formatNumber(soloTotals.played),
      },
      {
        description: 'Wins across local Solo stats buckets.',
        key: 'solo-wins',
        label: 'Solo wins',
        value: formatNumber(soloTotals.won),
      },
      {
        description: 'Newest-first private history rows available to charts and trends.',
        key: 'history-rows',
        label: 'History rows',
        value: formatNumber(history.length),
      },
    ],
  }
}
