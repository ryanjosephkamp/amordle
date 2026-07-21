import { describe, expect, it } from 'vitest'
import { createMultiplayerGame, type MultiplayerGame } from './multiplayer'
import {
  getCombatResultPresentation,
  projectCombatScorelines,
} from './combatPresentation'

function playingGame(overrides: Partial<MultiplayerGame> = {}): MultiplayerGame {
  const game = createMultiplayerGame({
    id: 'combat-presentation-1',
    mode: 'og',
    playerUserIds: {
      'player-one': 'dennis-user',
      'player-two': 'mayar-user',
    },
    scope: 'practice',
    seed: 1,
    wordLength: 5,
  })
  return {
    ...game,
    currentTurn: 'player-two',
    moves: [
      {
        createdAt: '2026-07-20T12:00:00.000Z',
        guess: 'SLATE',
        id: 'move-one',
        playerId: 'player-one',
        puzzleIndex: 0,
        tiles: 'SLATE'.split('').map((letter) => ({ letter, state: 'correct' as const })),
      },
      {
        createdAt: '2026-07-20T12:01:00.000Z',
        guess: 'CRANE',
        id: 'move-two',
        playerId: 'player-two',
        puzzleIndex: 0,
        tiles: 'CRANE'.split('').map((letter) => ({ letter, state: 'present' as const })),
      },
    ],
    playerProfiles: {
      'player-one': { label: 'Dennis Sellers' },
      'player-two': { label: 'Mayar' },
    },
    players: [
      { id: 'player-one', label: 'You' },
      { id: 'player-two', label: 'Rival' },
    ],
    status: 'playing',
    ...overrides,
  }
}

describe('COMBAT presentation projections', () => {
  it('projects source-derived live points, lead, turn, and viewer identity without parallel boards', () => {
    const scorelines = projectCombatScorelines(playingGame(), 'dennis-user')

    expect(scorelines).toEqual([
      expect.objectContaining({
        isLeading: true,
        isViewer: true,
        label: 'Dennis Sellers',
        playerId: 'player-one',
        points: 175,
        turnState: 'waiting',
      }),
      expect.objectContaining({
        isLeading: false,
        isViewer: false,
        label: 'Mayar',
        playerId: 'player-two',
        points: 10,
        turnState: 'active',
      }),
    ])
  })

  it('keeps timeout and post-start forfeit precedence explicit even when points disagree', () => {
    const game = playingGame({
      endedAt: '2026-07-20T12:02:00.000Z',
      forfeitedPlayerId: 'player-one',
      status: 'lost',
      timedOutPlayerId: undefined,
      winnerId: 'player-two',
    })

    expect(getCombatResultPresentation(game, 'dennis-user')).toMatchObject({
      headline: 'MAYAR WON BY FORFEIT',
      reason: 'forfeit',
      settlementLabel: 'Ranked settlement unavailable',
      viewerOutcome: 'loss',
    })

    expect(getCombatResultPresentation({
      ...game,
      forfeitedPlayerId: undefined,
      timedOutPlayerId: 'player-one',
    }, 'dennis-user')).toMatchObject({
      headline: 'MAYAR WON ON TIME',
      reason: 'timeout',
      viewerOutcome: 'loss',
    })
  })

  it('treats a pre-guess cancellation as a neutral non-result with no fabricated winner', () => {
    const game = playingGame({
      endedAt: '2026-07-20T12:00:00.000Z',
      moves: [],
      status: 'cancelled',
      winnerId: undefined,
    })

    expect(getCombatResultPresentation(game, 'dennis-user')).toEqual({
      detail: 'The match ended before the first shared guess. No win, loss, points result, rating result, or answer reveal was recorded.',
      headline: 'MATCH CANCELLED',
      reason: 'cancelled',
      settlementLabel: 'No settlement',
      viewerOutcome: 'neutral',
    })
  })

  it('reports an ordinary terminal winner from points when the solver still loses the match', () => {
    const lowValueMoves = Array.from({ length: 5 }, (_, index) => ({
      createdAt: `2026-07-20T12:0${index}:00.000Z`,
      guess: 'BRICK',
      id: `solver-miss-${index}`,
      playerId: 'player-one' as const,
      puzzleIndex: 0,
      tiles: 'BRICK'.split('').map((letter) => ({ letter, state: 'absent' as const })),
    }))
    const highValueMoves = Array.from({ length: 6 }, (_, index) => ({
      createdAt: `2026-07-20T12:1${index}:00.000Z`,
      guess: 'SLATE',
      id: `points-leader-${index}`,
      playerId: 'player-two' as const,
      puzzleIndex: 0,
      tiles: [
        { letter: 'S', state: 'correct' as const },
        { letter: 'L', state: 'correct' as const },
        { letter: 'A', state: 'correct' as const },
        { letter: 'T', state: 'correct' as const },
        { letter: 'E', state: 'present' as const },
      ],
    }))
    const game = playingGame({
      endedAt: '2026-07-20T12:02:00.000Z',
      moves: [
        ...lowValueMoves,
        ...highValueMoves,
        {
          createdAt: '2026-07-20T12:20:00.000Z',
          guess: 'CRANE',
          id: 'solver-final',
          playerId: 'player-one',
          puzzleIndex: 0,
          tiles: 'CRANE'.split('').map((letter) => ({ letter, state: 'correct' as const })),
        },
      ],
      status: 'won',
      winnerId: 'player-two',
    })

    const scorelines = projectCombatScorelines(game, 'dennis-user')
    expect(scorelines.find((scoreline) => scoreline.playerId === 'player-one')?.points).toBe(125)
    expect(scorelines.find((scoreline) => scoreline.playerId === 'player-two')?.points).toBe(132)
    expect(getCombatResultPresentation(game, 'dennis-user')).toMatchObject({
      headline: 'MAYAR WON ON POINTS',
      reason: 'points',
      viewerOutcome: 'loss',
    })
  })
})
