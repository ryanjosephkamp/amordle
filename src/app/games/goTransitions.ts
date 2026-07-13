import type { GoSessionState } from '../../game'

export type SoloGoSolvedTransition = { readonly puzzleIndex: number }

export function getSoloGoSolvedTransition(previous: GoSessionState, next: GoSessionState): SoloGoSolvedTransition | undefined {
  if (previous.status !== 'playing') {
    return undefined
  }

  const puzzleIndex = previous.currentPuzzleIndex
  const previousPuzzle = previous.puzzles[puzzleIndex]
  const nextPuzzle = next.puzzles[puzzleIndex]
  if (!previousPuzzle || !nextPuzzle || nextPuzzle.status !== 'won') {
    return undefined
  }
  if (nextPuzzle.guesses.length <= previousPuzzle.guesses.length) {
    return undefined
  }

  const latestGuess = nextPuzzle.guesses[nextPuzzle.guesses.length - 1]
  if (!latestGuess || latestGuess.guess !== nextPuzzle.answer) {
    return undefined
  }
  return latestGuess.tiles.every((tile) => tile.state === 'correct') ? { puzzleIndex } : undefined
}
