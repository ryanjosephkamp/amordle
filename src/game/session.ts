import { DEFAULT_MAX_ATTEMPTS } from './constants'
import { getGuessResult } from './tileStates'
import type { GameStatus, GuessResult, ValidationFailure, ValidationResult } from './types'
import { validateHardModeGuess } from './hardMode'
import { normalizeGuess, validateGuess } from './validation'

export interface PuzzleSessionOptions {
  readonly answer: string
  readonly validGuesses?: ReadonlySet<string> | readonly string[]
  readonly maxAttempts?: number
  readonly hardMode?: boolean
  readonly prefilledGuess?: string
}

export interface PuzzleSessionState {
  readonly answer: string
  readonly wordLength: number
  readonly maxAttempts: number
  readonly hardMode: boolean
  readonly validGuesses?: ReadonlySet<string> | readonly string[]
  readonly currentGuess: string
  readonly guesses: readonly GuessResult[]
  readonly status: GameStatus
  readonly lastValidation?: ValidationFailure
  readonly continuationCount: number
  readonly revealedAnswer?: boolean
}

function gameOverFailure(status: GameStatus): ValidationFailure {
  return {
    ok: false,
    reason: 'game-over',
    message: status === 'won' ? 'Puzzle is already solved.' : 'Puzzle is already over.',
  }
}

export function createPuzzleSession(options: PuzzleSessionOptions): PuzzleSessionState {
  const answer = normalizeGuess(options.answer)

  return {
    answer,
    wordLength: answer.length,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    hardMode: options.hardMode ?? false,
    validGuesses: options.validGuesses,
    currentGuess: options.prefilledGuess ? normalizeGuess(options.prefilledGuess).slice(0, answer.length) : '',
    guesses: [],
    status: 'playing',
    continuationCount: 0,
  }
}

export function enterLetter(state: PuzzleSessionState, letter: string): PuzzleSessionState {
  if (state.status !== 'playing') {
    return state
  }

  const normalizedLetter = normalizeGuess(letter)
  if (!/^[a-z]$/.test(normalizedLetter) || state.currentGuess.length >= state.wordLength) {
    return state
  }

  return {
    ...state,
    currentGuess: `${state.currentGuess}${normalizedLetter}`,
    lastValidation: undefined,
  }
}

export function deleteLetter(state: PuzzleSessionState): PuzzleSessionState {
  if (state.status !== 'playing' || state.currentGuess.length === 0) {
    return state
  }

  return {
    ...state,
    currentGuess: state.currentGuess.slice(0, -1),
    lastValidation: undefined,
  }
}

function firstFailure(...results: readonly ValidationResult[]): ValidationFailure | undefined {
  for (const result of results) {
    if (!result.ok) {
      return result
    }
  }

  return undefined
}

export function submitGuess(state: PuzzleSessionState): PuzzleSessionState {
  if (state.status !== 'playing') {
    return {
      ...state,
      lastValidation: gameOverFailure(state.status),
    }
  }

  const basicValidation = validateGuess({
    guess: state.currentGuess,
    wordLength: state.wordLength,
    validGuesses: state.validGuesses,
  })
  const hardModeValidation = state.hardMode
    ? validateHardModeGuess(state.currentGuess, state.guesses)
    : ({ ok: true } as const)
  const validationFailure = firstFailure(basicValidation, hardModeValidation)

  if (validationFailure) {
    return {
      ...state,
      lastValidation: validationFailure,
    }
  }

  const result = getGuessResult(state.currentGuess, state.answer)
  const guesses = [...state.guesses, result]
  const solved = result.tiles.every((tile) => tile.state === 'correct')
  const status: GameStatus = solved ? 'won' : guesses.length >= state.maxAttempts ? 'lost' : 'playing'

  return {
    ...state,
    currentGuess: '',
    guesses,
    status,
    lastValidation: undefined,
  }
}

export function continueAfterLoss(
  state: PuzzleSessionState,
  extraAttempts = 1,
): PuzzleSessionState {
  if (state.status !== 'lost' || extraAttempts < 1) {
    return state
  }

  return {
    ...state,
    status: 'playing',
    maxAttempts: state.maxAttempts + extraAttempts,
    lastValidation: undefined,
    continuationCount: state.continuationCount + 1,
    revealedAnswer: undefined,
  }
}

export function resetPuzzleSession(
  state: PuzzleSessionState,
  options: Partial<PuzzleSessionOptions> = {},
): PuzzleSessionState {
  return createPuzzleSession({
    answer: options.answer ?? state.answer,
    validGuesses: options.validGuesses ?? state.validGuesses,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    hardMode: options.hardMode ?? state.hardMode,
    prefilledGuess: options.prefilledGuess,
  })
}
