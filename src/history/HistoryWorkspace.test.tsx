import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { GameHistoryEntry } from '../account'
import type { MultiplayerCompetitiveState } from '../multiplayer'
import { HistoryWorkspace } from './HistoryWorkspace'

function noop() {}

const history: GameHistoryEntry[] = [
  {
    attemptsUsed: 4,
    coinAward: 10,
    completedAt: '2026-06-13T02:00:00.000Z',
    gameId: 'daily-og',
    mode: 'og',
    scope: 'daily',
    status: 'won',
    word: 'crane',
    wordLength: 5,
    xpAward: 50,
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
      bucket: 'multiplayer:go',
      dailyDateKey: '2026-06-13',
      endedAt: '2026-06-13T03:00:00.000Z',
      mode: 'go',
      players: [
        {
          attemptsUsed: 8,
          outcome: 'win',
          playerId: 'player-one',
          points: 250,
          puzzlesSolved: 5,
          scoreSummary: '250 pts; 5/5 puzzles solved',
          summary: 'Won with 5/5 boards solved; 250 pts; 5/5 puzzles solved',
          userId: 'viewer-user',
        },
      ],
      ranked: false,
      scope: 'daily',
      sourceMatchId: 'daily-go-match',
      status: 'completed',
      summary: 'Player won the multiplayer match',
      winnerPlayerId: 'player-one',
    },
  ],
}

describe('HistoryWorkspace', () => {
  it('renders filters and completed results from existing progress data', () => {
    const html = renderToStaticMarkup(
      <HistoryWorkspace
        competitiveState={competitiveState}
        filters={{ mode: 'all', player: 'all', scope: 'all' }}
        history={history}
        onFiltersChange={noop}
        viewerUserId="viewer-user"
      />,
    )

    expect(html).toContain('Player area')
    expect(html).toContain('Source')
    expect(html).toContain('Mode')
    expect(html).toContain('Daily Solo OG')
    expect(html).toContain('Daily Multiplayer GO')
    expect(html).toContain('Won with 5/5 boards solved')
    expect(html).toContain('CRANE - 5 letters')
  })

  it('renders a clear empty state for filters with no matches', () => {
    const html = renderToStaticMarkup(
      <HistoryWorkspace
        filters={{ mode: 'go', player: 'solo', scope: 'practice' }}
        history={history}
        onFiltersChange={noop}
      />,
    )

    expect(html).toContain('No matching results yet.')
    expect(html).toContain('Finish a Solo or Multiplayer game')
  })
})
