import { describe, expect, it } from 'vitest'
import { selectPrivateRankedLeaderboardRows } from './rankedLeaderboardProjections'

describe('private ranked leaderboard projections', () => {
  const trustedState = {
    customGames: [],
    rating: {
      profiles: [
        {
          bucket: 'multiplayer:og',
          draws: 1,
          gamesPlayed: 12,
          losses: 3,
          provisional: false,
          rating: 1240,
          updatedAt: '2026-06-16T10:00:00.000Z',
          userId: 'player-one-auth-id',
          wins: 8,
        },
        {
          bucket: 'async:og',
          draws: 0,
          gamesPlayed: 8,
          losses: 1,
          provisional: true,
          rating: 1295,
          updatedAt: '2026-06-16T10:05:00.000Z',
          userId: 'player-two-auth-id',
          wins: 7,
        },
        {
          bucket: 'live:go',
          draws: 0,
          gamesPlayed: 4,
          losses: 2,
          provisional: true,
          rating: 1188,
          updatedAt: '2026-06-16T10:06:00.000Z',
          userId: 'go-player-auth-id',
          wins: 2,
        },
      ],
      transactions: [
        {
          bucket: 'multiplayer:og',
          createdAt: '2026-06-16T10:10:00.000Z',
          expectedScore: 0.5,
          id: 'transaction-latest-player-one',
          matchId: 'ranked-match-2',
          newRating: 1240,
          oldRating: 1220,
          opponentUserId: 'player-two-auth-id',
          outcome: 'win',
          ratingDelta: 20,
          userId: 'player-one-auth-id',
        },
        {
          bucket: 'multiplayer:og',
          createdAt: '2026-06-16T09:10:00.000Z',
          expectedScore: 0.5,
          id: 'transaction-peak-player-one',
          matchId: 'ranked-match-1',
          newRating: 1265,
          oldRating: 1245,
          opponentUserId: 'player-two-auth-id',
          outcome: 'win',
          ratingDelta: 20,
          userId: 'player-one-auth-id',
        },
        {
          bucket: 'multiplayer:og',
          createdAt: '2026-06-16T10:10:00.000Z',
          expectedScore: 0.5,
          id: 'transaction-latest-player-two',
          matchId: 'ranked-match-2',
          newRating: 1295,
          oldRating: 1281,
          opponentUserId: 'player-one-auth-id',
          outcome: 'loss',
          ratingDelta: -14,
          userId: 'player-two-auth-id',
        },
      ],
    },
    results: [],
  }

  it('requires an authenticated private viewer context', () => {
    expect(selectPrivateRankedLeaderboardRows(trustedState)).toEqual([])
    expect(selectPrivateRankedLeaderboardRows(trustedState, { viewerUserId: '   ' })).toEqual([])
  })

  it('projects private rating rows by bucket without mixing match points into Elo', () => {
    const rows = selectPrivateRankedLeaderboardRows(trustedState, { viewerUserId: 'player-one-auth-id' })

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => [row.bucket, row.rank, row.rating, row.gamesPlayed])).toEqual([
      ['multiplayer:go', 1, 1188, 4],
      ['multiplayer:og', 1, 1295, 8],
      ['multiplayer:og', 2, 1240, 12],
    ])
    expect(rows.find((row) => row.identity.viewerOwned)).toMatchObject({
      draws: 1,
      latestRatingDelta: 20,
      latestRatingMovementAt: '2026-06-16T10:10:00.000Z',
      losses: 3,
      peakRating: 1265,
      provisional: false,
      rating: 1240,
      source: 'trusted-rating-cache',
      wins: 8,
    })
  })

  it('uses safe Phase 28 placeholders instead of raw auth identities', () => {
    const rows = selectPrivateRankedLeaderboardRows(trustedState, { viewerUserId: 'player-one-auth-id' })
    const json = JSON.stringify(rows)

    expect(rows.every((row) => row.identity.kind === 'phase28-placeholder')).toBe(true)
    expect(rows.find((row) => row.identity.viewerOwned)?.identity.label).toBe('You')
    expect(json).not.toContain('player-one-auth-id')
    expect(json).not.toContain('player-two-auth-id')
    expect(json).not.toContain('go-player-auth-id')
    expect(json).not.toContain('transaction-latest')
    expect(json).not.toContain('ranked-match')
  })

  it('drops corrupt private payload fields through trusted state normalization', () => {
    const rows = selectPrivateRankedLeaderboardRows({
      rating: {
        profiles: [{
          answer: 'crane',
          bucket: 'multiplayer:og',
          draws: 0,
          email: 'player@example.com',
          gamesPlayed: 1,
          losses: 0,
          playerSessions: { secret: true },
          privateProfile: { bio: 'not yet public' },
          projection: { serializedSession: 'raw-session' },
          provisional: true,
          rating: 1210,
          seed: 12345,
          token: 'private-token',
          updatedAt: '2026-06-16T12:00:00.000Z',
          userId: 'player@example.com',
          wins: 1,
        }],
        transactions: [{
          bucket: 'multiplayer:og',
          createdAt: '2026-06-16T12:02:00.000Z',
          expectedScore: 0.5,
          id: 'private-transaction-id',
          matchId: 'private-match-id',
          newRating: 1210,
          oldRating: 1200,
          opponentUserId: 'rival@example.com',
          outcome: 'win',
          ratingDelta: 10,
          serializedSession: 'raw-session',
          userId: 'player@example.com',
        }],
      },
    }, { viewerUserId: 'viewer-auth-id' })
    const json = JSON.stringify(rows)

    expect(rows).toHaveLength(1)
    expect(json).not.toContain('player@example.com')
    expect(json).not.toContain('rival@example.com')
    expect(json).not.toContain('crane')
    expect(json).not.toContain('raw-session')
    expect(json).not.toContain('private-token')
    expect(json).not.toContain('not yet public')
    expect(json).not.toContain('private-transaction-id')
    expect(json).not.toContain('private-match-id')
  })

  it('keeps projection row counts bounded per bucket', () => {
    const rows = selectPrivateRankedLeaderboardRows(trustedState, {
      maxRowsPerBucket: 1,
      viewerUserId: 'player-one-auth-id',
    })

    expect(rows.map((row) => [row.bucket, row.rank, row.rating])).toEqual([
      ['multiplayer:go', 1, 1188],
      ['multiplayer:og', 1, 1295],
    ])
  })
})
