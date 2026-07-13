import { BUNDLED_WORD_LIST_LENGTHS, getDailyGoSeedIndex, getDailyDateKey, getWordRepository } from '../../data'
import { DEFAULT_DIFFICULTY_TIER, type DifficultyTier } from '../../data/difficulty'
import { DAILY_WORD_LENGTH, DEFAULT_GO_PUZZLE_COUNT, SUPPORTED_PRACTICE_WORD_LENGTHS, type GoPuzzleCount } from '../constants'
import {
  createPuzzleSession,
  continueAfterLoss,
  deleteLetter,
  enterLetter,
  submitGuess,
  type PuzzleSessionState,
} from '../session'
import { getGuessResult } from '../tileStates'
import type { GameStatus } from '../types'
import type { ConsumableEffects } from '../../progression/consumables'
import {
  getGoAnswerGenerationVersionForDateKey,
  selectDeterministicGoAnswerSequence,
  type GoAnswerGenerationVersion,
} from './chainSelector'

export type { GoAnswerGenerationVersion } from './chainSelector'

export interface GoPuzzleSetup {
  readonly answer: string
  readonly prefilledGuesses: readonly string[]
}

export interface GoSessionSetup {
  readonly answerGenerationVersion: GoAnswerGenerationVersion
  readonly dateKey?: string
  readonly puzzles: readonly GoPuzzleSetup[]
  readonly validGuesses: ReadonlySet<string>
  readonly wordLength: number
}

export interface GoSessionState {
  readonly answerGenerationVersion: GoAnswerGenerationVersion
  readonly currentPuzzleIndex: number
  readonly hardMode: boolean
  readonly priorAnswers: readonly string[]
  readonly puzzles: readonly PuzzleSessionState[]
  readonly status: GameStatus
  readonly validGuesses: ReadonlySet<string>
  readonly wordLength: number
  /**
   * Phase 18.7 — set when the player used the practice-only "Reveal Answer"
   * action to give up on the current puzzle. Treated as a loss-equivalent and
   * blocks Pay-to-Continue (continuing a revealed answer would be trivial).
   * Always `undefined` for daily go, which never offers Reveal.
   */
  readonly revealedAnswer?: boolean
}

export interface SerializedGoSession {
  readonly answerGenerationVersion?: GoAnswerGenerationVersion
  readonly currentPuzzleIndex: number
  readonly hardMode: boolean
  readonly priorAnswers: readonly string[]
  readonly revealedAnswer?: boolean
  readonly consumableEffectsByPuzzle?: Readonly<Record<string, ConsumableEffects>>
  readonly puzzles: readonly {
    readonly answer: string
    readonly continuationCount: number
    readonly currentGuess: string
    readonly guesses: readonly string[]
    readonly maxAttempts: number
    readonly prefilledGuesses: readonly string[]
  }[]
}

function selectAnswerSequence(answers: readonly { readonly word: string }[], seedIndex: number, puzzleCount: number): readonly string[] {
  if (answers.length < 1) {
    throw new Error('At least one answer candidate is required for go gameplay.')
  }

  return Array.from({ length: puzzleCount }, (_, offset) => answers[(seedIndex + offset) % answers.length].word)
}

function createPuzzle(answer: string, validGuesses: ReadonlySet<string>, hardMode: boolean, prefilledGuesses: readonly string[]): PuzzleSessionState {
  const session = createPuzzleSession({ answer, hardMode, validGuesses })
  const guesses = prefilledGuesses.map((guess) => getGuessResult(guess, answer))

  return {
    ...session,
    guesses,
  }
}

function getStatus(puzzles: readonly PuzzleSessionState[], currentPuzzleIndex: number): GameStatus {
  const currentPuzzle = puzzles[currentPuzzleIndex]
  if (currentPuzzle.status === 'lost') {
    return 'lost'
  }

  return currentPuzzleIndex === puzzles.length - 1 && currentPuzzle.status === 'won' ? 'won' : 'playing'
}

export function getAvailableGoPracticeLengths(): readonly number[] {
  return SUPPORTED_PRACTICE_WORD_LENGTHS.filter((length) => BUNDLED_WORD_LIST_LENGTHS.includes(length))
}

export function createDailyGoSetup(date = new Date(), difficulty: DifficultyTier = DEFAULT_DIFFICULTY_TIER, puzzleCount: GoPuzzleCount = DEFAULT_GO_PUZZLE_COUNT): GoSessionSetup {
  const repository = getWordRepository({ mode: 'go', scope: 'daily', length: DAILY_WORD_LENGTH, difficulty })
  if (!repository.ok) {
    throw new Error(repository.message)
  }

  const dateKey = getDailyDateKey(date)
  const answerGenerationVersion = getGoAnswerGenerationVersionForDateKey(dateKey)
  const answers = answerGenerationVersion === 'v1'
    ? selectAnswerSequence(repository.answers, getDailyGoSeedIndex(dateKey, repository.answers.length), puzzleCount)
    : selectDeterministicGoAnswerSequence(repository.answers, {
        puzzleCount,
        streamKey: `go-chain-v2:solo:daily:${dateKey}:${DAILY_WORD_LENGTH}:${difficulty}:${puzzleCount}`,
      })
  const priorAnswers: string[] = []
  const puzzles = answers.map((answer) => {
    const prefilledGuesses = [...priorAnswers]
    priorAnswers.push(answer)
    return { answer, prefilledGuesses }
  })

  return {
    answerGenerationVersion,
    dateKey,
    puzzles,
    validGuesses: repository.validGuesses,
    wordLength: DAILY_WORD_LENGTH,
  }
}

export function createPracticeGoSetup(length: number, seed = Date.now(), difficulty: DifficultyTier = DEFAULT_DIFFICULTY_TIER, puzzleCount: GoPuzzleCount = DEFAULT_GO_PUZZLE_COUNT): GoSessionSetup {
  const repository = getWordRepository({ mode: 'go', scope: 'practice', length, difficulty })
  if (!repository.ok) {
    throw new Error(repository.message)
  }

  const normalizedSeed = Math.abs(Math.trunc(seed))
  const answers = selectDeterministicGoAnswerSequence(repository.answers, {
    puzzleCount,
    streamKey: `go-chain-v2:solo:practice:${normalizedSeed}:${length}:${difficulty}:${puzzleCount}`,
  })
  const priorAnswers: string[] = []
  const puzzles = answers.map((answer) => {
    const prefilledGuesses = [...priorAnswers]
    priorAnswers.push(answer)
    return { answer, prefilledGuesses }
  })

  return {
    answerGenerationVersion: 'v2',
    puzzles,
    validGuesses: repository.validGuesses,
    wordLength: repository.wordList.metadata.length,
  }
}

export function createGoSession(setup: GoSessionSetup, hardMode = false): GoSessionState {
  return {
    answerGenerationVersion: setup.answerGenerationVersion,
    currentPuzzleIndex: 0,
    hardMode,
    priorAnswers: [],
    puzzles: setup.puzzles.map((puzzle) => createPuzzle(puzzle.answer, setup.validGuesses, hardMode, puzzle.prefilledGuesses)),
    status: 'playing',
    validGuesses: setup.validGuesses,
    wordLength: setup.wordLength,
  }
}

export function enterGoLetter(state: GoSessionState, letter: string): GoSessionState {
  if (state.status !== 'playing') {
    return state
  }

  const puzzles = [...state.puzzles]
  puzzles[state.currentPuzzleIndex] = enterLetter(puzzles[state.currentPuzzleIndex], letter)
  return { ...state, puzzles }
}

export function deleteGoLetter(state: GoSessionState): GoSessionState {
  if (state.status !== 'playing') {
    return state
  }

  const puzzles = [...state.puzzles]
  puzzles[state.currentPuzzleIndex] = deleteLetter(puzzles[state.currentPuzzleIndex])
  return { ...state, puzzles }
}

export function submitGoGuess(state: GoSessionState): GoSessionState {
  if (state.status !== 'playing') {
    return state
  }

  const puzzles = [...state.puzzles]
  const submittedPuzzle = submitGuess(puzzles[state.currentPuzzleIndex])
  puzzles[state.currentPuzzleIndex] = submittedPuzzle

  if (submittedPuzzle.status === 'lost') {
    return { ...state, puzzles, status: 'lost' }
  }

  if (submittedPuzzle.status !== 'won') {
    return { ...state, puzzles }
  }

  const priorAnswers = [...state.priorAnswers, submittedPuzzle.answer]
  if (state.currentPuzzleIndex === state.puzzles.length - 1) {
    return { ...state, priorAnswers, puzzles, status: 'won' }
  }

  const currentPuzzleIndex = state.currentPuzzleIndex + 1
  const nextPuzzle = puzzles[currentPuzzleIndex]
  puzzles[currentPuzzleIndex] = {
    ...nextPuzzle,
    hardMode: state.hardMode,
    lastValidation: undefined,
  }

  return {
    ...state,
    currentPuzzleIndex,
    priorAnswers,
    puzzles,
    status: getStatus(puzzles, currentPuzzleIndex),
  }
}

export function setGoHardMode(state: GoSessionState, hardMode: boolean): GoSessionState {
  if (state.status !== 'playing') {
    return state
  }

  return {
    ...state,
    hardMode,
    puzzles: state.puzzles.map((puzzle) => ({ ...puzzle, hardMode, lastValidation: undefined })),
  }
}

export function continueGoAfterLoss(state: GoSessionState, extraAttempts = 1): GoSessionState {
  if (state.status !== 'lost') {
    return state
  }

  const puzzles = [...state.puzzles]
  puzzles[state.currentPuzzleIndex] = continueAfterLoss(puzzles[state.currentPuzzleIndex], extraAttempts)

  return {
    ...state,
    puzzles,
    revealedAnswer: undefined,
    status: 'playing',
  }
}

/**
 * Phase 18.7 — practice-only "Give Up / Reveal Answer". Marks the current
 * puzzle as lost (loss-equivalent for stats) and flags the session as revealed
 * so Pay-to-Continue is not offered. No-op when the chain is already over.
 */
export function revealGoPuzzle(state: GoSessionState): GoSessionState {
  if (state.status !== 'playing' && state.status !== 'lost') {
    return state
  }

  const puzzles = [...state.puzzles]
  const current = puzzles[state.currentPuzzleIndex]
  puzzles[state.currentPuzzleIndex] = {
    ...current,
    lastValidation: undefined,
    status: 'lost',
  }

  return {
    ...state,
    puzzles,
    revealedAnswer: true,
    status: 'lost',
  }
}

export function serializeGoSession(state: GoSessionState): SerializedGoSession {
  return {
    answerGenerationVersion: state.answerGenerationVersion,
    currentPuzzleIndex: state.currentPuzzleIndex,
    hardMode: state.hardMode,
    priorAnswers: state.priorAnswers,
    revealedAnswer: state.revealedAnswer,
    puzzles: state.puzzles.map((puzzle, index) => ({
      answer: puzzle.answer,
      continuationCount: puzzle.continuationCount,
      currentGuess: puzzle.currentGuess,
      guesses: puzzle.guesses.map((guess) => guess.guess),
      maxAttempts: puzzle.maxAttempts,
      prefilledGuesses: state.priorAnswers.slice(0, index),
    })),
  }
}

export function restoreGoSession(serialized: SerializedGoSession, validGuesses: ReadonlySet<string>): GoSessionState {
  const activePuzzleIndex = Math.min(serialized.currentPuzzleIndex, serialized.puzzles.length - 1)
  const puzzles = serialized.puzzles.map((puzzle, index) => {
    const guesses = puzzle.guesses.map((guess) => getGuessResult(guess, puzzle.answer))
    const solved = guesses.some((guess) => guess.tiles.every((tile) => tile.state === 'correct'))
    const status = serialized.revealedAnswer && index === activePuzzleIndex
      ? 'lost'
      : solved ? 'won' : guesses.length >= puzzle.maxAttempts ? 'lost' : 'playing'

    return {
      answer: puzzle.answer,
      continuationCount: puzzle.continuationCount,
      currentGuess: puzzle.currentGuess,
      guesses,
      hardMode: serialized.hardMode,
      lastValidation: undefined,
      maxAttempts: puzzle.maxAttempts,
      status,
      validGuesses,
      wordLength: puzzle.answer.length,
    } satisfies PuzzleSessionState
  })
  const currentPuzzleIndex = activePuzzleIndex

  return {
    answerGenerationVersion: serialized.answerGenerationVersion ?? 'v1',
    currentPuzzleIndex,
    hardMode: serialized.hardMode,
    priorAnswers: serialized.priorAnswers,
    puzzles,
    revealedAnswer: serialized.revealedAnswer,
    status: getStatus(puzzles, currentPuzzleIndex),
    validGuesses,
    wordLength: puzzles[currentPuzzleIndex].wordLength,
  }
}
