import { DAILY_WORD_LENGTH } from '../game/constants.js'
import { DEFAULT_DIFFICULTY_TIER, type DifficultyTier } from './difficulty/index.js'
import type { WordEntry } from './types.js'
import { getWordRepository, isWordRepositoryFailure } from './wordRepository.js'

export interface DailyPuzzle {
  readonly answer: string
  readonly dateKey: string
  readonly index: number
  readonly length: number
}

const MS_PER_DAY = 86_400_000

/**
 * The calendar day key (`YYYY-MM-DD`) that identifies the active daily puzzle.
 *
 * Phase 22 (PHASE-22-CALENDAR-MIDNIGHT-AND-BUGFIXES-SPEC-2026-06-02): the daily
 * puzzle now rolls over at **local midnight in the player's device timezone**
 * instead of UTC midnight. We therefore read the *local* calendar fields of the
 * `Date` (`getFullYear`/`getMonth`/`getDate`) rather than `toISOString()`,
 * which is fixed to UTC. The returned key is still a stable, sortable
 * `YYYY-MM-DD` string, so every downstream consumer (answer index, go seed,
 * daily storage, completion ids, sharing) keeps working unchanged.
 *
 * `getDailyAnswerIndex` / `getDailyGoSeedIndex` continue to treat the key as a
 * timezone-agnostic discriminator (they hash `${dateKey}T00:00:00.000Z`), so
 * answer selection stays fully deterministic per local calendar day.
 */
export function getDailyDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getDailyAnswerIndex(dateKey: string, answerCount: number): number {
  if (answerCount < 1) {
    throw new Error('At least one answer candidate is required for a daily puzzle.')
  }

  const day = Date.parse(`${dateKey}T00:00:00.000Z`) / MS_PER_DAY
  return Math.trunc(day) % answerCount
}

/**
 * Deterministic integer hash used to salt the daily go seed so the daily go
 * chain is decoupled from the daily og answer (fixes the Phase 18 critical
 * Og↔Go overlap). Pure function of the day number; no clock/network/randomness.
 */
function mixDailyGoSeed(day: number): number {
  let hash = (day ^ 0x9e3779b9) >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0
  return (hash ^ (hash >>> 16)) >>> 0
}

/**
 * Independent deterministic seed index for the **daily go** chain. Salted with a
 * stable `'go'` discriminator so that, for the same date and answer pool, the
 * daily go chain's first word is guaranteed to differ from the daily og answer
 * whenever there is more than one candidate (the only mathematically
 * unavoidable collision is a single-answer pool). Determinism is preserved per
 * `dateKey`, and the five-word mutual-distinctness still comes from
 * `selectAnswerSequence`.
 */
export function getDailyGoSeedIndex(dateKey: string, answerCount: number): number {
  if (answerCount < 1) {
    throw new Error('At least one answer candidate is required for a daily puzzle.')
  }

  const ogIndex = getDailyAnswerIndex(dateKey, answerCount)
  if (answerCount === 1) {
    return ogIndex
  }

  const day = Math.trunc(Date.parse(`${dateKey}T00:00:00.000Z`) / MS_PER_DAY)
  // Offset in [1, answerCount - 1] guarantees a different index than the og answer.
  const offset = 1 + (mixDailyGoSeed(day) % (answerCount - 1))
  return (ogIndex + offset) % answerCount
}

export function selectDailyAnswer(answers: readonly WordEntry[], date = new Date()): DailyPuzzle {
  const dateKey = getDailyDateKey(date)
  const index = getDailyAnswerIndex(dateKey, answers.length)
  const answer = answers[index].word

  return {
    answer,
    dateKey,
    index,
    length: answer.length,
  }
}

export function getDailyOgPuzzle(date = new Date(), difficulty: DifficultyTier = DEFAULT_DIFFICULTY_TIER): DailyPuzzle {
  const repository = getWordRepository({ mode: 'og', scope: 'daily', length: DAILY_WORD_LENGTH, difficulty })
  if (isWordRepositoryFailure(repository)) {
    throw new Error(repository.message)
  }

  return selectDailyAnswer(repository.answers, date)
}
