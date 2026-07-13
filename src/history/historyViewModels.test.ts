import { describe, expect, it } from 'vitest'
import type { GameHistoryEntry } from '../account'
import type { MultiplayerCompetitiveState } from '../multiplayer'
import {
  selectHistoryRows,
  selectHistorySummary,
} from './historyViewModels'

const soloHistory: GameHistoryEntry[] = [
  {
    attemptsUsed: 3,
    coinAward: 10,
    completedAt: '2026-06-13T02:00:00.000Z',
    gameId: 'solo-daily-og',
    mode: 'og',
    scope: 'daily',
    status: 'won',
    word: 'crane',
    wordLength: 5,
    xpAward: 50,
  },
  {
    attemptsUsed: 12,
    coinAward: 6,
    completedAt: '2026-06-13T01:00:00.000Z',
    gameId: 'solo-practice-go',
    mode: 'go',
    scope: 'practice',
    status: 'lost',
    word: 'crane,plumb,sleet',
    wordLength: 5,
    xpAward: 30,
  },
]

const competitiveState: MultiplayerCompetitiveState = {
  customGames: [],
  rating: {
    profiles: [],
    transactions: [],
  },
  results: [
    {
      bucket: 'multiplayer:og',
      endedAt: '2026-06-13T03:00:00.000Z',
      mode: 'og',
      players: [
        {
          attemptsUsed: 1,
          outcome: 'loss',
          playerId: 'player-one',
          points: 42,
          puzzlesSolved: 0,
          scoreSummary: '42 pts; not solved',
          summary: 'Lost in 1 guess; 42 pts; not solved',
          userId: 'viewer-user',
        },
        {
          attemptsUsed: 1,
          outcome: 'win',
          playerId: 'player-two',
          points: 160,
          puzzlesSolved: 1,
          scoreSummary: '160 pts; solved',
          summary: 'Won in 1 guess; 160 pts; solved',
          userId: 'rival-user',
        },
      ],
      ranked: true,
      scope: 'practice',
      sourceMatchId: 'practice-og-loss',
      status: 'completed',
      summary: 'Rival won the multiplayer match by solving',
      winnerPlayerId: 'player-two',
    },
    {
      bucket: 'multiplayer:go',
      dailyDateKey: '2026-06-13',
      endedAt: '2026-06-13T00:30:00.000Z',
      mode: 'go',
      players: [
        {
          attemptsUsed: 9,
          outcome: 'draw',
          playerId: 'player-one',
          points: 220,
          puzzlesSolved: 4,
          scoreSummary: '220 pts; 4/5 puzzles solved',
          summary: 'Drew with 4/5 boards solved; 220 pts; 4/5 puzzles solved',
          userId: 'viewer-user',
        },
        {
          attemptsUsed: 9,
          outcome: 'draw',
          playerId: 'player-two',
          points: 220,
          puzzlesSolved: 4,
          scoreSummary: '220 pts; 4/5 puzzles solved',
          summary: 'Drew with 4/5 boards solved; 220 pts; 4/5 puzzles solved',
          userId: 'rival-user',
        },
      ],
      ranked: false,
      scope: 'daily',
      sourceMatchId: 'daily-go-draw',
      status: 'completed',
      summary: 'Multiplayer match ended in a draw',
    },
  ],
}

describe('history view models', () => {
  it('merges solo and multiplayer results newest first', () => {
    const rows = selectHistoryRows({
      competitiveState,
      history: soloHistory,
      viewerUserId: 'viewer-user',
    })

    expect(rows.map((row) => row.id)).toEqual([
      'multiplayer:practice-og-loss',
      'solo:solo-daily-og',
      'solo:solo-practice-go',
      'multiplayer:daily-go-draw',
    ])
    expect(rows[0]).toMatchObject({
      detailLabel: 'Lost in 1 guess; 42 pts; not solved',
      kindLabel: 'Multiplayer',
      statusLabel: 'Lost',
      title: 'Practice Multiplayer OG',
    })
    expect(rows[1]).toMatchObject({
      contextLabel: 'CRANE - 5 letters',
      rewardLabel: '+50 XP / +10 coins',
      statusLabel: 'Won',
      title: 'Daily Solo OG',
    })
  })

  it('filters by player area, source, and mode', () => {
    const soloPracticeGo = selectHistoryRows({
      competitiveState,
      filters: {
        mode: 'go',
        player: 'solo',
        scope: 'practice',
      },
      history: soloHistory,
      viewerUserId: 'viewer-user',
    })
    const multiplayerDaily = selectHistoryRows({
      competitiveState,
      filters: {
        mode: 'all',
        player: 'multiplayer',
        scope: 'daily',
      },
      history: soloHistory,
      viewerUserId: 'viewer-user',
    })

    expect(soloPracticeGo.map((row) => row.id)).toEqual(['solo:solo-practice-go'])
    expect(soloPracticeGo[0].contextLabel).toBe('CRANE / PLUMB / SLEET - 5 letters')
    expect(multiplayerDaily.map((row) => row.id)).toEqual(['multiplayer:daily-go-draw'])
    expect(multiplayerDaily[0]).toMatchObject({
      contextLabel: 'UTC 2026-06-13 - Unranked - 2 players',
      statusLabel: 'Draw',
    })
  })

  it('summarizes the filtered result set without counting hidden rows', () => {
    const rows = selectHistoryRows({
      competitiveState,
      filters: {
        mode: 'all',
        player: 'multiplayer',
        scope: 'all',
      },
      history: soloHistory,
      viewerUserId: 'viewer-user',
    })

    expect(selectHistorySummary(rows)).toEqual({
      draws: 1,
      lost: 1,
      multiplayer: 2,
      solo: 0,
      total: 2,
      won: 0,
    })
  })

  it('keeps account-owned multiplayer results hidden from signed-out history rows', () => {
    const rows = selectHistoryRows({
      competitiveState,
      history: soloHistory,
    })

    expect(rows.map((row) => row.id)).toEqual([
      'solo:solo-daily-og',
      'solo:solo-practice-go',
    ])
    expect(rows.every((row) => row.kindLabel === 'Solo')).toBe(true)
    expect(selectHistoryRows({
      competitiveState,
      filters: {
        mode: 'all',
        player: 'multiplayer',
        scope: 'all',
      },
      history: soloHistory,
    })).toEqual([])
  })

  it('handles missing result collections without surfacing phantom rows', () => {
    expect(selectHistoryRows({})).toEqual([])
    expect(selectHistorySummary([])).toEqual({
      draws: 0,
      lost: 0,
      multiplayer: 0,
      solo: 0,
      total: 0,
      won: 0,
    })
  })
})
