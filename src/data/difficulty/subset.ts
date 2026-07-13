/**
 * Phase 18.2 (AGENT-IMPLEMENTATION-PLAN.md §23.4) — answer-subset derivation.
 *
 * Derives the Casual and Standard answer subsets from the Expert pool using the
 * deterministic in-repo heuristic (`./heuristic`). The subsets are **nested by
 * construction** — both are top-fractions of the same score ordering — so the
 * central invariant `Casual ⊆ Standard ⊆ Expert` holds at every length 2..35
 * and is unit-tested as a hard rule.
 *
 * Design note / documented refinement (§23.4, user answers #1 + #2): the plan
 * floated shipping a curated `standard-5` JSON built from the classic Wordle +
 * Hurdle answer sets for length 5. User answer #1 is the binding decision:
 * compute the tiers **in-repo via a deterministic heuristic with no external
 * data dependency**. To keep `Casual ⊆ Standard ⊆ Expert` provably true at every
 * length (including 5) and to avoid embedding a third-party answer list, this
 * module applies the same nested top-fraction derivation uniformly across all
 * lengths. The loader remains forward-compatible with explicit per-word tier
 * tags should a future data regeneration ship them.
 *
 * Tiers subset the `answers` pool only. `validGuesses` is never touched here.
 */

import { isLoadWordListFailure, loadBundledWordList } from '../loadWordList.js'
import type { WordEntry } from '../types.js'
import { scoreWordsByQuality } from './heuristic.js'
import { DEFAULT_DIFFICULTY_TIER, type DifficultyTier } from './tiers.js'

/**
 * Fraction of the per-length Expert pool retained by each non-Expert tier.
 * Casual is the smaller (more common-words-only) pool; Standard is broader.
 * Because both are top-fractions of the same deterministic ordering, the
 * resulting sets are strictly nested. "Dynamically scaled per length" (spec §1)
 * falls out naturally: the count is a fraction of each length's own pool size.
 */
export const CASUAL_ANSWER_FRACTION = 0.35
export const STANDARD_ANSWER_FRACTION = 0.7

interface LengthTierModel {
  /** Expert answer words in deterministic quality order (best first). */
  readonly orderedWords: readonly string[]
  readonly casual: ReadonlySet<string>
  readonly standard: ReadonlySet<string>
  readonly expert: ReadonlySet<string>
}

const modelCache = new Map<number, LengthTierModel | null>()

function topFraction(orderedWords: readonly string[], fraction: number): Set<string> {
  const count = Math.max(1, Math.min(orderedWords.length, Math.ceil(orderedWords.length * fraction)))
  return new Set(orderedWords.slice(0, count))
}

function buildLengthTierModel(length: number): LengthTierModel | null {
  const loaded = loadBundledWordList('practice', length)
  if (isLoadWordListFailure(loaded)) {
    return null
  }

  const expertWords = loaded.wordList.answers.map((entry) => entry.word)
  const orderedWords = scoreWordsByQuality(expertWords, length).map((scored) => scored.word)
  const standard = topFraction(orderedWords, STANDARD_ANSWER_FRACTION)
  // Derive Casual from the Standard ordering so Casual ⊆ Standard is guaranteed
  // even if the fractions were ever reconfigured to overlap awkwardly.
  const casualCount = Math.max(1, Math.min(standard.size, Math.ceil(orderedWords.length * CASUAL_ANSWER_FRACTION)))
  const casual = new Set(orderedWords.slice(0, casualCount))

  return {
    orderedWords,
    casual,
    standard,
    expert: new Set(expertWords),
  }
}

function getLengthTierModel(length: number): LengthTierModel | null {
  if (modelCache.has(length)) {
    return modelCache.get(length) ?? null
  }
  const model = buildLengthTierModel(length)
  modelCache.set(length, model)
  return model
}

/**
 * Returns the set of answer words that belong to `tier` at the given length.
 * Expert returns the full answer set. Memoised per length.
 */
export function getTierAnswerWords(length: number, tier: DifficultyTier): ReadonlySet<string> {
  const model = getLengthTierModel(length)
  if (!model) {
    return new Set()
  }
  if (tier === 'casual') return model.casual
  if (tier === 'standard') return model.standard
  return model.expert
}

/**
 * Filter an Expert `answers` array down to the requested tier, preserving the
 * original order and entry objects (so definitions and daily/practice seed
 * indices behave consistently). Expert returns the input array unchanged
 * (identity) so default behaviour is byte-for-byte preserved.
 */
export function getAnswerSubset(
  answers: readonly WordEntry[],
  length: number,
  tier: DifficultyTier = DEFAULT_DIFFICULTY_TIER,
): readonly WordEntry[] {
  if (tier === 'expert') {
    return answers
  }
  const allowed = getTierAnswerWords(length, tier)
  if (allowed.size === 0) {
    return answers
  }
  const subset = answers.filter((entry) => allowed.has(entry.word))
  // Defensive: never hand back an empty pool (would break selection); fall back
  // to the full Expert list if the subset somehow came back empty.
  return subset.length > 0 ? subset : answers
}

/**
 * Classify a word by the **minimal** tier it belongs to: `'casual'` if it is in
 * the Casual pool, else `'standard'`, else `'expert'` if it is any answer, else
 * `undefined` (the word is a valid-guess-only word or not present). Used by the
 * Word Explorer difficulty column.
 */
export function classifyAnswerTier(length: number, word: string): DifficultyTier | undefined {
  const model = getLengthTierModel(length)
  if (!model) {
    return undefined
  }
  const normalized = word.trim().toLocaleLowerCase('en-US')
  if (model.casual.has(normalized)) return 'casual'
  if (model.standard.has(normalized)) return 'standard'
  if (model.expert.has(normalized)) return 'expert'
  return undefined
}

/** Test/diagnostic helper: clear the per-length memo cache. */
export function clearDifficultyModelCache(): void {
  modelCache.clear()
}
