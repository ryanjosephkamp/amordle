import type { PuzzleSessionState } from '../../game'
import {
  getPracticeDraftTiles,
  type ConsumableEffects,
} from '../../progression'
import type { SoloBoardRow } from '../../ui'

export interface SoloBoardPresentation {
  readonly activeCell?: {
    readonly columnIndex: number
    readonly rowIndex: number
  }
  readonly rows: readonly SoloBoardRow[]
}

export function selectSoloBoardPresentation(
  session: PuzzleSessionState,
  effects: ConsumableEffects,
): SoloBoardPresentation {
  const rows = Array.from({ length: session.maxAttempts }, (_, rowIndex): SoloBoardRow => {
    const submittedGuess = session.guesses[rowIndex]
    if (submittedGuess) {
      return {
        id: `attempt-${rowIndex}`,
        tiles: submittedGuess.tiles.map((tile, tileIndex) => ({
          id: `attempt-${rowIndex}-tile-${tileIndex}`,
          isSubmitted: true,
          letter: tile.letter,
          state: tile.state,
        })),
      }
    }

    if (rowIndex === session.guesses.length && session.status === 'playing') {
      return {
        id: `attempt-${rowIndex}`,
        tiles: getPracticeDraftTiles(session.currentGuess, session.wordLength, effects).map((tile, tileIndex) => ({
          id: `attempt-${rowIndex}-tile-${tileIndex}`,
          isSubmitted: false,
          letter: tile.letter,
          state: tile.locked ? 'correct' : tile.letter ? 'current' : 'empty',
        })),
      }
    }

    return {
      id: `attempt-${rowIndex}`,
      tiles: Array.from({ length: session.wordLength }, (_, tileIndex) => ({
        id: `attempt-${rowIndex}-tile-${tileIndex}`,
        isSubmitted: false,
        letter: '',
        state: 'empty' as const,
      })),
    }
  })

  return {
    activeCell: session.status === 'playing'
      ? {
          columnIndex: Math.min(session.currentGuess.length, Math.max(0, session.wordLength - 1)),
          rowIndex: session.guesses.length,
        }
      : undefined,
    rows,
  }
}
