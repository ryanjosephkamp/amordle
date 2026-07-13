import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MultiplayerStatsPanel } from './MultiplayerStatsPanel'

describe('MultiplayerStatsPanel', () => {
  it('renders empty competitive multiplayer state without touching solo stats', () => {
    const html = renderToStaticMarkup(<MultiplayerStatsPanel />)

    expect(html).toContain('Competitive multiplayer')
    expect(html).toContain('No rated results yet')
    expect(html).toContain('No multiplayer results recorded yet')
    expect(html).toContain('Ranked Elo')
    expect(html).toContain('The full formula and ranked boundaries live in About.')
    expect(html).toContain('Only eligible ranked Practice and ranked Daily games affect Elo')
    expect(html).toContain('Rank bands are display labels for current Elo ranges')
    expect(html).not.toContain('Ranked Practice starts each rating bucket at 1200')
    expect(html).not.toContain('standard 400-point expected-score curve')
    expect(html).not.toContain('public leaderboards remain deferred')
  })

  it('can render a compact About link for Elo details', () => {
    const html = renderToStaticMarkup(<MultiplayerStatsPanel onOpenEloAbout={() => {}} />)

    expect(html).toContain('How is Elo calculated?')
  })

  it('renders rating profiles and recent result summaries', () => {
    const html = renderToStaticMarkup(
      <MultiplayerStatsPanel
        state={{
          customGames: [],
          rating: {
            profiles: [{
              bucket: 'multiplayer:og',
              draws: 0,
              gamesPlayed: 1,
              losses: 0,
              provisional: true,
              rating: 1220,
              updatedAt: '2026-06-04T12:00:00.000Z',
              userId: 'user-a',
              wins: 1,
            }],
            transactions: [{
              bucket: 'multiplayer:og',
              createdAt: '2026-06-04T12:05:00.000Z',
              expectedScore: 0.5,
              id: 'transaction-1',
              matchId: 'match-1',
              newRating: 1220,
              oldRating: 1200,
              opponentUserId: 'user-b',
              outcome: 'win',
              ratingDelta: 20,
              userId: 'user-a',
            }],
          },
          results: [
            {
              bucket: 'multiplayer:og',
              mode: 'og',
              players: [],
              ranked: true,
              scope: 'practice',
              sourceMatchId: 'match-1',
              status: 'completed',
              summary: 'You won the multiplayer match',
            },
            {
              bucket: 'multiplayer:og',
              mode: 'og',
              players: [],
              ranked: false,
              scope: 'practice',
              sourceMatchId: 'match-2',
              status: 'completed',
              summary: 'You won an unranked multiplayer match',
            },
          ],
        }}
      />,
    )

    expect(html).toContain('1220')
    expect(html).toContain('Silver band')
    expect(html).toContain('Ranked Practice OG')
    expect(html).not.toContain('MULTIPLAYER OG')
    expect(html).toContain('Provisional · 9 matches until established')
    expect(html).toContain('You won the multiplayer match')
    expect(html).toContain('Points decide match results; Elo changes only after confirmed ranked results')
    expect(html).toContain('Unranked, custom, Daily, unsupported timed Practice, guest, corrupt, or spectator-only outcomes do not move Elo.')
    expect(html).toContain('These rows come from confirmed ranked rating changes.')
  })

  it('renders display-only rank bands for rating bucket thresholds', () => {
    const html = renderToStaticMarkup(
      <MultiplayerStatsPanel
        state={{
          customGames: [],
          rating: {
            profiles: [
              {
                bucket: 'multiplayer:og',
                draws: 0,
                gamesPlayed: 11,
                losses: 6,
                provisional: false,
                rating: 899,
                updatedAt: '2026-06-04T12:00:00.000Z',
                userId: 'learner',
                wins: 5,
              },
              {
                bucket: 'multiplayer:go',
                draws: 0,
                gamesPlayed: 11,
                losses: 0,
                provisional: false,
                rating: 1900,
                updatedAt: '2026-06-04T12:05:00.000Z',
                userId: 'master',
                wins: 11,
              },
            ],
            transactions: [],
          },
          results: [],
        }}
      />,
    )

    expect(html).toContain('Learner band')
    expect(html).toContain('Master band')
    expect(html).toContain('do not affect matchmaking or settlement')
  })

  it('renders timed ranked bucket labels from trusted cached results without changing Elo copy authority', () => {
    const html = renderToStaticMarkup(
      <MultiplayerStatsPanel
        state={{
          customGames: [],
          rating: {
            profiles: [{
              bucket: 'multiplayer:go:timed:v1',
              draws: 0,
              gamesPlayed: 12,
              losses: 4,
              provisional: false,
              rating: 1350,
              updatedAt: '2026-06-26T00:00:00.000Z',
              userId: 'viewer',
              wins: 8,
            }],
            transactions: [{
              bucket: 'multiplayer:go:timed:v1',
              createdAt: '2026-06-26T00:05:00.000Z',
              expectedScore: 0.5,
              id: 'timed-transaction-1',
              matchId: 'timed-match-1',
              newRating: 1350,
              oldRating: 1330,
              opponentUserId: 'rival',
              outcome: 'win',
              ratingDelta: 20,
              userId: 'viewer',
            }],
          },
          results: [{
            bucket: 'multiplayer:go:timed:v1',
            mode: 'go',
            players: [],
            ranked: true,
            scope: 'practice',
            sourceMatchId: 'timed-match-1',
            status: 'completed',
            summary: 'You won the timed ranked match',
          }],
        }}
      />,
    )

    expect(html).toContain('Timed Ranked Practice GO')
    expect(html).toContain('1350')
    expect(html).toContain('Gold band')
    expect(html).toContain('public leaderboards are display-only')
    expect(html).not.toContain('timed Practice ranked remain deferred')
  })

  it('dedupes rating buckets to the latest valid player-facing row', () => {
    const html = renderToStaticMarkup(
      <MultiplayerStatsPanel
        state={{
          customGames: [],
          rating: {
            profiles: [
              {
                bucket: 'multiplayer:og',
                draws: 0,
                gamesPlayed: 6,
                losses: 3,
                provisional: true,
                rating: 1205,
                updatedAt: '2026-06-04T12:00:00.000Z',
                userId: 'viewer',
                wins: 3,
              },
              {
                bucket: 'async:og' as 'multiplayer:og',
                draws: 0,
                gamesPlayed: 1,
                losses: 0,
                provisional: true,
                rating: 1219,
                updatedAt: '2026-06-04T12:05:00.000Z',
                userId: 'viewer',
                wins: 1,
              },
              {
                bucket: 'multiplayer:go',
                draws: 0,
                gamesPlayed: 7,
                losses: 4,
                provisional: true,
                rating: 1196,
                updatedAt: '2026-06-04T12:06:00.000Z',
                userId: 'viewer',
                wins: 3,
              },
              {
                bucket: 'broken:og' as 'multiplayer:og',
                draws: 0,
                gamesPlayed: 99,
                losses: 0,
                provisional: false,
                rating: 1999,
                updatedAt: '2026-06-04T12:07:00.000Z',
                userId: 'viewer',
                wins: 99,
              },
            ],
            transactions: [],
          },
          results: [],
        }}
      />,
    )

    expect(html.match(/Ranked Practice OG/g)).toHaveLength(1)
    expect(html.match(/Ranked Practice GO/g)).toHaveLength(1)
    expect(html).toContain('1219')
    expect(html).toContain('Silver band')
    expect(html).toContain('1196')
    expect(html).not.toContain('1205')
    expect(html).not.toContain('1999')
    expect(html).not.toContain('broken')
  })

  it('shows the signed-in viewer bucket rows instead of cached rival profiles', () => {
    const html = renderToStaticMarkup(
      <MultiplayerStatsPanel
        state={{
          customGames: [],
          rating: {
            profiles: [
              {
                bucket: 'multiplayer:og',
                draws: 0,
                gamesPlayed: 6,
                losses: 3,
                provisional: true,
                rating: 1205,
                updatedAt: '2026-06-04T12:00:00.000Z',
                userId: 'viewer',
                wins: 3,
              },
              {
                bucket: 'multiplayer:og',
                draws: 0,
                gamesPlayed: 9,
                losses: 0,
                provisional: true,
                rating: 1400,
                updatedAt: '2026-06-04T12:05:00.000Z',
                userId: 'rival',
                wins: 9,
              },
            ],
            transactions: [],
          },
          results: [],
        }}
        viewerUserId="viewer"
      />,
    )

    expect(html).toContain('1205')
    expect(html).not.toContain('1400')
  })
})
