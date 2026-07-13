import { describe, expect, it } from 'vitest'
import type { GameHistoryEntry, GuestProgressionState } from '../account/storageSchema'
import type { MultiplayerCompetitiveState } from '../multiplayer/competitiveMultiplayer'
import { createEmptyStatistics, updateStatistics } from './statistics'
import { createPlayerStatsOverview } from './playerStatsOverview'

function progression(overrides: Partial<GuestProgressionState> = {}): GuestProgressionState {
  return {
    coins: 125,
    consumables: { removeIncorrectLetters: 0, revealOneLetter: 0 },
    economyOperationIds: [],
    economyRevision: 0,
    level: 1,
    xp: 150,
    ...overrides,
  }
}

function historyEntry(overrides: Partial<GameHistoryEntry> = {}): GameHistoryEntry {
  return {
    attemptsUsed: 4,
    coinAward: 10,
    completedAt: '2026-07-09T12:00:00.000Z',
    gameId: 'history-row-1',
    mode: 'og',
    scope: 'daily',
    status: 'won',
    word: 'brisk',
    wordLength: 5,
    xpAward: 50,
    ...overrides,
  }
}

const COMPETITIVE: MultiplayerCompetitiveState = {
  customGames: [],
  rating: {
    profiles: [
      {
        bucket: 'multiplayer:og',
        draws: 1,
        gamesPlayed: 12,
        losses: 4,
        provisional: false,
        rating: 1324,
        updatedAt: '2026-07-09T12:00:00.000Z',
        userId: 'private-viewer-user-id',
        wins: 7,
      },
      {
        bucket: 'multiplayer:go',
        draws: 0,
        gamesPlayed: 2,
        losses: 1,
        provisional: true,
        rating: 1205,
        updatedAt: '2026-07-09T12:05:00.000Z',
        userId: 'private-rival-user-id',
        wins: 1,
      },
    ],
    transactions: [
      {
        bucket: 'multiplayer:og',
        createdAt: '2026-07-09T12:00:00.000Z',
        expectedScore: 0.5,
        id: 'private-rating-transaction-id',
        matchId: 'private-match-id',
        newRating: 1324,
        oldRating: 1300,
        opponentUserId: 'private-rival-user-id',
        outcome: 'win',
        ratingDelta: 24,
        userId: 'private-viewer-user-id',
      },
    ],
  },
  results: [
    {
      bucket: 'multiplayer:og',
      mode: 'og',
      players: [],
      ranked: true,
      scope: 'practice',
      sourceMatchId: 'private-match-id',
      status: 'completed',
      summary: 'You won the ranked Practice match',
    },
  ],
}

describe('createPlayerStatsOverview', () => {
  it('summarizes private Solo stats, progression, sync provenance, and local multiplayer cache safely', () => {
    let stats = createEmptyStatistics()
    stats = updateStatistics(stats, { attemptsUsed: 3, mode: 'og', scope: 'daily', status: 'won', wordLength: 5 })
    stats = updateStatistics(stats, { attemptsUsed: 6, mode: 'go', scope: 'practice', status: 'lost', wordLength: 6 })

    const overview = createPlayerStatsOverview({
      authStatus: 'authenticated',
      competitiveMultiplayer: COMPETITIVE,
      history: [
        historyEntry(),
        historyEntry({ gameId: 'history-row-2', mode: 'go', scope: 'practice', status: 'lost' }),
      ],
      progression: progression(),
      stats,
      viewerUserId: 'private-viewer-user-id',
    })
    const serialized = JSON.stringify(overview)

    expect(overview.soloSummaryCards).toEqual([
      expect.objectContaining({ key: 'solo-games', label: 'Solo games recorded', value: '2' }),
      expect.objectContaining({ key: 'solo-wins', label: 'Solo wins', value: '1' }),
      expect.objectContaining({ key: 'history-rows', label: 'History rows', value: '2' }),
    ])
    expect(overview.provenanceCards).toEqual([
      expect.objectContaining({ key: 'sync-scope', value: 'Cloud-synced account snapshot' }),
      expect.objectContaining({ key: 'public-exposure', value: 'Private by default' }),
    ])
    expect(overview.progressionCards).toEqual([
      expect.objectContaining({ key: 'level', value: 'Level 2' }),
      expect.objectContaining({ key: 'xp-next', value: '150 XP' }),
      expect.objectContaining({ key: 'coins', value: '125' }),
    ])
    expect(overview.multiplayerSummaryCards).toEqual([
      expect.objectContaining({ key: 'rating-buckets', value: '1' }),
      expect.objectContaining({ key: 'multiplayer-results', value: '1' }),
      expect.objectContaining({ key: 'rating-changes', value: '1' }),
    ])
    expect(serialized).not.toContain('private-viewer-user-id')
    expect(serialized).not.toContain('private-rival-user-id')
    expect(serialized).not.toContain('private-match-id')
    expect(serialized).not.toContain('private-rating-transaction-id')
    expect(serialized).not.toContain('user_id')
    expect(serialized).not.toContain('email')
    expect(serialized).not.toContain('rating_transaction_id')
  })

  it('labels guest and unconfigured progress without implying cloud sync', () => {
    const guest = createPlayerStatsOverview({
      authStatus: 'anonymous',
      history: [],
      progression: progression({ coins: 0, xp: 0 }),
      stats: createEmptyStatistics(),
    })
    const unconfigured = createPlayerStatsOverview({
      authStatus: 'unconfigured',
      history: [],
      progression: progression({ coins: 0, xp: 0 }),
      stats: createEmptyStatistics(),
    })

    expect(guest.provenanceCards.find((card) => card.key === 'sync-scope')?.value).toBe('Local guest device')
    expect(unconfigured.provenanceCards.find((card) => card.key === 'sync-scope')?.value).toBe('Local-only environment')
  })
})
