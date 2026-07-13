import { dateKeyToLocalDate } from '../../src/daily'
import { DEFAULT_GO_PUZZLE_COUNT } from '../../src/game/constants'
import { createPracticeGoSetup } from '../../src/game/go/session'
import { createPracticeOgSetup } from '../../src/game/og/session'
import { createDailyMultiplayerGoSetup, createDailyMultiplayerOgSetup } from '../../src/multiplayer/dailyMultiplayer'
import type { MultiplayerGame } from '../../src/multiplayer/multiplayer'

export function projectionFromRow(row: { readonly projection?: unknown }): MultiplayerGame {
  const projection = row.projection as MultiplayerGame | undefined
  if (!projection?.serializedSession) {
    throw new Error('Remote multiplayer row did not include a game projection.')
  }
  return projection
}

export function getCurrentAnswer(game: MultiplayerGame): string {
  if (game.serializedSession.mode === 'og') {
    return game.serializedSession.session.answer
  }
  const puzzle = game.serializedSession.session.puzzles[game.serializedSession.session.currentPuzzleIndex]
  if (!puzzle) {
    throw new Error('GO projection is missing the current puzzle.')
  }
  return puzzle.answer
}

export function getValidWrongGuess(game: MultiplayerGame, answer = getCurrentAnswer(game)): string {
  const setup = (() => {
    if (game.mode === 'og') {
      return game.scope === 'daily'
        ? createDailyMultiplayerOgSetup(dateKeyToLocalDate(game.dailyDateKey ?? ''), game.difficulty)
        : createPracticeOgSetup(game.wordLength, game.seed, game.difficulty)
    }
    return game.scope === 'daily'
      ? createDailyMultiplayerGoSetup(dateKeyToLocalDate(game.dailyDateKey ?? ''), game.difficulty, game.goPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT)
      : createPracticeGoSetup(game.wordLength, game.seed, game.difficulty, game.goPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT)
  })()
  const guess = [...setup.validGuesses].find((candidate) => candidate.length === answer.length && candidate !== answer)
  if (!guess) {
    throw new Error(`Unable to find a wrong valid guess for ${answer}.`)
  }
  return guess
}
