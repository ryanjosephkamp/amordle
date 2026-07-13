export const DAILY_WORD_LENGTH = 5
export const MIN_PRACTICE_WORD_LENGTH = 2
export const MAX_PRACTICE_WORD_LENGTH = 35
export const DEFAULT_MAX_ATTEMPTS = 6

/**
 * Phase 19.2 — configurable go chain length. `GO_PUZZLE_COUNT` remains the
 * default (5) so every existing import/test stays valid; `GO_PUZZLE_COUNTS`
 * enumerates the selectable options and `DEFAULT_GO_PUZZLE_COUNT` is the
 * additive default that reproduces today's behaviour. The per-puzzle word
 * length is independent of the count (daily stays 5; practice 2–35).
 */
export type GoPuzzleCount = 5 | 7 | 10
export const GO_PUZZLE_COUNTS: readonly GoPuzzleCount[] = [5, 7, 10]
export const DEFAULT_GO_PUZZLE_COUNT: GoPuzzleCount = 5
export const GO_PUZZLE_COUNT = DEFAULT_GO_PUZZLE_COUNT

export function isGoPuzzleCount(value: unknown): value is GoPuzzleCount {
  return value === 5 || value === 7 || value === 10
}

export function normalizeGoPuzzleCount(value: unknown): GoPuzzleCount {
  return isGoPuzzleCount(value) ? value : DEFAULT_GO_PUZZLE_COUNT
}

export const SUPPORTED_PRACTICE_WORD_LENGTHS = Array.from(
  { length: MAX_PRACTICE_WORD_LENGTH - MIN_PRACTICE_WORD_LENGTH + 1 },
  (_, index) => index + MIN_PRACTICE_WORD_LENGTH,
) as readonly number[]

export function isSupportedPracticeWordLength(length: number): boolean {
  return Number.isInteger(length) &&
    length >= MIN_PRACTICE_WORD_LENGTH &&
    length <= MAX_PRACTICE_WORD_LENGTH
}

export function isSupportedDailyWordLength(length: number): boolean {
  return length === DAILY_WORD_LENGTH
}
