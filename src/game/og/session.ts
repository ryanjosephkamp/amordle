import { BUNDLED_WORD_LIST_LENGTHS, getWordRepository } from '../../data'
import type { WordEntry } from '../../data'
import { DEFAULT_DIFFICULTY_TIER, type DifficultyTier } from '../../data/difficulty'
import { getDailyOgPuzzle } from '../../data/daily'
import { DAILY_WORD_LENGTH, SUPPORTED_PRACTICE_WORD_LENGTHS } from '../constants'
import { createPuzzleSession, type PuzzleSessionState } from '../session'
import { getGuessResult } from '../tileStates'
import type { ConsumableEffects } from '../../progression/consumables'

export interface OgPuzzleSetup {
  readonly answer: string
  readonly dateKey?: string
  readonly validGuesses: ReadonlySet<string>
  readonly wordLength: number
}

export interface SerializedOgSession {
  readonly answer: string
  readonly continuationCount: number
  readonly currentGuess: string
  readonly guesses: readonly string[]
  readonly hardMode: boolean
  readonly maxAttempts: number
  readonly revealedAnswer?: boolean
  readonly consumableEffects?: ConsumableEffects
}

function selectPracticeAnswer(answers: readonly WordEntry[], seed: number): string {
  if (answers.length < 1) {
    throw new Error('At least one answer candidate is required for practice.')
  }

  return answers[Math.abs(Math.trunc(seed)) % answers.length].word
}

export function getAvailableOgPracticeLengths(): readonly number[] {
  return SUPPORTED_PRACTICE_WORD_LENGTHS.filter((length) => BUNDLED_WORD_LIST_LENGTHS.includes(length))
}

export function createDailyOgSetup(date = new Date(), difficulty: DifficultyTier = DEFAULT_DIFFICULTY_TIER): OgPuzzleSetup {
  const puzzle = getDailyOgPuzzle(date, difficulty)
  const repository = getWordRepository({ mode: 'og', scope: 'daily', length: DAILY_WORD_LENGTH, difficulty })
  if (!repository.ok) {
    throw new Error(repository.message)
  }

  return {
    answer: puzzle.answer,
    dateKey: puzzle.dateKey,
    validGuesses: repository.validGuesses,
    wordLength: DAILY_WORD_LENGTH,
  }
}

export function createPracticeOgSetup(length: number, seed = Date.now(), difficulty: DifficultyTier = DEFAULT_DIFFICULTY_TIER): OgPuzzleSetup {
  const repository = getWordRepository({ mode: 'og', scope: 'practice', length, difficulty })
  if (!repository.ok) {
    throw new Error(repository.message)
  }

  return {
    answer: selectPracticeAnswer(repository.answers, seed),
    validGuesses: repository.validGuesses,
    wordLength: repository.wordList.metadata.length,
  }
}

export function createOgSession(setup: OgPuzzleSetup, hardMode = false): PuzzleSessionState {
  return createPuzzleSession({
    answer: setup.answer,
    hardMode,
    validGuesses: setup.validGuesses,
  })
}

export function serializeOgSession(state: PuzzleSessionState): SerializedOgSession {
  return {
    answer: state.answer,
    continuationCount: state.continuationCount,
    currentGuess: state.currentGuess,
    guesses: state.guesses.map((guess) => guess.guess),
    hardMode: state.hardMode,
    maxAttempts: state.maxAttempts,
    revealedAnswer: state.revealedAnswer,
  }
}

export function restoreOgSession(serialized: SerializedOgSession, validGuesses: ReadonlySet<string>): PuzzleSessionState {
  const guesses = serialized.guesses.map((guess) => getGuessResult(guess, serialized.answer))
  const solved = guesses.some((guess) => guess.tiles.every((tile) => tile.state === 'correct'))
  const status = serialized.revealedAnswer ? 'lost' : solved ? 'won' : guesses.length >= serialized.maxAttempts ? 'lost' : 'playing'

  return {
    answer: serialized.answer,
    continuationCount: serialized.continuationCount,
    currentGuess: serialized.currentGuess,
    guesses,
    hardMode: serialized.hardMode,
    lastValidation: undefined,
    maxAttempts: serialized.maxAttempts,
    revealedAnswer: serialized.revealedAnswer,
    status,
    validGuesses,
    wordLength: serialized.answer.length,
  }
}
