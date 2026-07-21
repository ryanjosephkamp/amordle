import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createMultiplayerGame, type MultiplayerGame } from './multiplayer'
import { CombatResultPanel } from './CombatScoreboard'

describe('CombatResultPanel', () => {
  it('labels the terminal tile-points leader without contradicting a forfeit winner', () => {
    const game = createMultiplayerGame({
      mode: 'og',
      playerProfiles: {
        'player-one': { label: 'Dennis' },
        'player-two': { label: 'Mayar' },
      },
      playerUserIds: {
        'player-one': 'dennis-user',
        'player-two': 'mayar-user',
      },
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const forfeited = {
      ...game,
      forfeitedPlayerId: 'player-one',
      moves: [
        {
          createdAt: '2026-07-20T12:00:00.000Z',
          guess: 'SLATE',
          id: 'move-one',
          playerId: 'player-one',
          puzzleIndex: 0,
          tiles: 'SLATE'.split('').map((letter) => ({ letter, state: 'correct' as const })),
        },
      ],
      status: 'lost',
      winnerId: 'player-two',
    } satisfies MultiplayerGame

    const html = renderToStaticMarkup(
      <CombatResultPanel game={forfeited} viewerUserId="dennis-user" />,
    )

    expect(html).toContain('MAYAR WON BY FORFEIT')
    expect(html).toContain('POINTS LEADER')
    expect(html).not.toContain('FINAL LEADER')
  })
})
