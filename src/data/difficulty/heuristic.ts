/**
 * Phase 18.2 (AGENT-IMPLEMENTATION-PLAN.md §23.4, user answer #1) — deterministic,
 * in-repo word-quality heuristic used to derive the Casual and Standard answer
 * subsets from the existing local word lists. No external data, no network, no
 * randomness, no clock: the same inputs always produce the same ordering.
 *
 * The heuristic mirrors the spirit of the offline `stratified_quality_score_v1`
 * curation method recorded in the per-length files' `metadata.curation`
 * (frequency 0.45, positional 0.30, vowel balance 0.15, uniqueness 0.10). It
 * reads only the words already present in the Expert `answers` pool, so it is
 * purely a re-ranking of words the build already ships.
 */

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

/** Curation weights mirroring `stratified_quality_score_v1`. */
export const QUALITY_WEIGHTS = {
  frequency: 0.45,
  positional: 0.3,
  vowelBalance: 0.15,
  uniqueness: 0.1,
} as const

/**
 * Target vowel ratio for the vowel-balance component. ~0.4 is a natural ratio
 * for common English words and keeps all-consonant / vowel-heavy oddities lower.
 */
const TARGET_VOWEL_RATIO = 0.4

export interface WordQualityScore {
  readonly word: string
  readonly score: number
}

interface FrequencyModel {
  readonly overall: ReadonlyMap<string, number>
  readonly positional: readonly ReadonlyMap<string, number>[]
}

function buildFrequencyModel(words: readonly string[], length: number): FrequencyModel {
  const overallCounts = new Map<string, number>()
  const positionalCounts: Map<string, number>[] = Array.from({ length }, () => new Map<string, number>())
  let totalLetters = 0

  for (const word of words) {
    for (let position = 0; position < word.length && position < length; position += 1) {
      const letter = word[position]!
      overallCounts.set(letter, (overallCounts.get(letter) ?? 0) + 1)
      const positionMap = positionalCounts[position]!
      positionMap.set(letter, (positionMap.get(letter) ?? 0) + 1)
      totalLetters += 1
    }
  }

  const overall = new Map<string, number>()
  if (totalLetters > 0) {
    for (const [letter, count] of overallCounts) {
      overall.set(letter, count / totalLetters)
    }
  }

  const positional = positionalCounts.map((counts) => {
    const total = words.length
    const probabilities = new Map<string, number>()
    if (total > 0) {
      for (const [letter, count] of counts) {
        probabilities.set(letter, count / total)
      }
    }
    return probabilities
  })

  return { overall, positional }
}

function rawFrequencyScore(word: string, model: FrequencyModel): number {
  if (word.length === 0) {
    return 0
  }
  let sum = 0
  for (const letter of word) {
    sum += model.overall.get(letter) ?? 0
  }
  return sum / word.length
}

function rawPositionalScore(word: string, model: FrequencyModel): number {
  if (word.length === 0) {
    return 0
  }
  let sum = 0
  for (let position = 0; position < word.length; position += 1) {
    const letter = word[position]!
    sum += model.positional[position]?.get(letter) ?? 0
  }
  return sum / word.length
}

function vowelBalanceScore(word: string): number {
  if (word.length === 0) {
    return 0
  }
  let vowelCount = 0
  for (const letter of word) {
    if (VOWELS.has(letter)) {
      vowelCount += 1
    }
  }
  const ratio = vowelCount / word.length
  // 1 when ratio matches the target exactly, decreasing linearly to 0 at the
  // furthest possible distance from the target.
  const maxDistance = Math.max(TARGET_VOWEL_RATIO, 1 - TARGET_VOWEL_RATIO)
  return 1 - Math.abs(ratio - TARGET_VOWEL_RATIO) / maxDistance
}

function uniquenessScore(word: string): number {
  if (word.length === 0) {
    return 0
  }
  return new Set(word).size / word.length
}

function minMaxNormalize(values: readonly number[]): number[] {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  const range = max - min
  if (!Number.isFinite(range) || range === 0) {
    return values.map(() => 0)
  }
  return values.map((value) => (value - min) / range)
}

/**
 * Score every word in `words` with the deterministic quality heuristic and
 * return them sorted by descending score, with ascending word as a stable
 * tie-breaker. Frequency and positional components are min-max normalised
 * across the provided set so the configured weights are comparable; vowel
 * balance and uniqueness are already in `[0, 1]`.
 */
export function scoreWordsByQuality(words: readonly string[], length: number): readonly WordQualityScore[] {
  if (words.length === 0) {
    return []
  }

  const model = buildFrequencyModel(words, length)
  const rawFrequency = words.map((word) => rawFrequencyScore(word, model))
  const rawPositional = words.map((word) => rawPositionalScore(word, model))
  const normalizedFrequency = minMaxNormalize(rawFrequency)
  const normalizedPositional = minMaxNormalize(rawPositional)

  const scored = words.map((word, index): WordQualityScore => {
    const score =
      QUALITY_WEIGHTS.frequency * normalizedFrequency[index]! +
      QUALITY_WEIGHTS.positional * normalizedPositional[index]! +
      QUALITY_WEIGHTS.vowelBalance * vowelBalanceScore(word) +
      QUALITY_WEIGHTS.uniqueness * uniquenessScore(word)
    return { word, score }
  })

  return scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0
  })
}
