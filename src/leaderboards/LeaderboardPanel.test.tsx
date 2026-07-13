import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LeaderboardPanel } from './LeaderboardPanel'
import { getPublicRankedLeaderboardFreshnessKey } from './leaderboardFreshness'

describe('LeaderboardPanel', () => {
  it('renders the public ranked leaderboard and competitive multiplayer ratings outside Stats', () => {
    const html = renderToStaticMarkup(
      <LeaderboardPanel authStatus="anonymous" />,
    )

    expect(html).toContain('Leaderboard')
    expect(html).toContain('Public ranked Practice and Daily leaderboards and competitive multiplayer ratings live here')
    expect(html).toContain('Ranked multiplayer leaderboard')
    expect(html).toContain('Sign in to view public ranked multiplayer leaderboards')
    expect(html).toContain('Competitive multiplayer')
    expect(html).toContain('No rated results yet')
    expect(html).toContain('public leaderboards are display-only')
    expect(html).not.toContain('All buckets')
    expect(html).not.toContain('multiplayer:og:timed:v1')
  })

  it('passes viewer rating state through to the competitive rating panel', () => {
    const html = renderToStaticMarkup(
      <LeaderboardPanel
        authStatus="authenticated"
        competitiveMultiplayer={{
          customGames: [],
          rating: {
            profiles: [
              {
                bucket: 'multiplayer:og',
                draws: 0,
                gamesPlayed: 12,
                losses: 4,
                provisional: false,
                rating: 1340,
                updatedAt: '2026-06-28T19:00:00.000Z',
                userId: 'viewer',
                wins: 8,
              },
              {
                bucket: 'multiplayer:og',
                draws: 0,
                gamesPlayed: 12,
                losses: 2,
                provisional: false,
                rating: 1450,
                updatedAt: '2026-06-28T19:01:00.000Z',
                userId: 'rival',
                wins: 10,
              },
            ],
            transactions: [],
          },
          results: [],
        }}
        viewerUserId="viewer"
      />,
    )

    expect(html).toContain('Ranked Practice OG')
    expect(html).toContain('1340')
    expect(html).toContain('Gold band')
    expect(html).not.toContain('1450')
  })

  it('does not render stale local rating summaries for anonymous viewers', () => {
    const html = renderToStaticMarkup(
      <LeaderboardPanel
        authStatus="anonymous"
        competitiveMultiplayer={{
          customGames: [],
          rating: {
            profiles: [
              {
                bucket: 'multiplayer:og',
                draws: 0,
                gamesPlayed: 12,
                losses: 4,
                provisional: false,
                rating: 1340,
                updatedAt: '2026-06-28T19:00:00.000Z',
                userId: 'viewer',
                wins: 8,
              },
            ],
            transactions: [],
          },
          results: [],
        }}
        viewerUserId="viewer"
      />,
    )

    expect(html).toContain('No rated results yet')
    expect(html).not.toContain('1340')
    expect(html).not.toContain('Gold band')
  })

  it('derives a public leaderboard freshness key from trusted settlement timing without raw user ids', () => {
    const before = getPublicRankedLeaderboardFreshnessKey({
      customGames: [],
      rating: {
        profiles: [],
        transactions: [],
      },
      results: [],
    })
    const after = getPublicRankedLeaderboardFreshnessKey({
      customGames: [],
      rating: {
        profiles: [
          {
            bucket: 'multiplayer:og',
            draws: 0,
            gamesPlayed: 1,
            losses: 0,
            provisional: true,
            rating: 1216,
            updatedAt: '2026-07-02T12:30:00.000Z',
            userId: 'raw-viewer-user-id',
            wins: 1,
          },
        ],
        transactions: [
          {
            bucket: 'multiplayer:og',
            createdAt: '2026-07-02T12:30:00.000Z',
            expectedScore: 0.5,
            id: 'private-transaction-id',
            matchId: 'private-match-id',
            newRating: 1216,
            oldRating: 1200,
            opponentUserId: 'raw-rival-user-id',
            outcome: 'win',
            ratingDelta: 16,
            userId: 'raw-viewer-user-id',
          },
        ],
      },
      results: [],
    })

    expect(after).not.toBe(before)
    expect(after).toContain('transactions=1')
    expect(after).toContain('profiles=1')
    expect(after).toContain('1216')
    expect(after).not.toContain('raw-viewer-user-id')
    expect(after).not.toContain('raw-rival-user-id')
    expect(after).not.toContain('private-transaction-id')
    expect(after).not.toContain('private-match-id')
  })
})
