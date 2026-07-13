/**
 * Phase 18.2 (AGENT-IMPLEMENTATION-PLAN.md §23.4) — Difficulty-tier model.
 *
 * Central rule for the whole phase: **tiers subset the `answers` pool only.**
 * `validGuesses` is always the full per-length list across all three tiers.
 *
 * `expert` is the default and reproduces today's behaviour exactly (the full
 * curated `answers` array shipped per length at `src/latest/words_length_N.json`).
 */

export type DifficultyTier = 'casual' | 'standard' | 'expert'

export const DIFFICULTY_TIERS: readonly DifficultyTier[] = ['casual', 'standard', 'expert']

/**
 * Default tier. Per spec §1 the default is Expert so every existing caller and
 * test reproduces the current full-curated-list behaviour with no change.
 */
export const DEFAULT_DIFFICULTY_TIER: DifficultyTier = 'expert'

export interface DifficultyTierMeta {
  readonly tier: DifficultyTier
  readonly label: string
  readonly description: string
}

export const DIFFICULTY_TIER_META: Readonly<Record<DifficultyTier, DifficultyTierMeta>> = {
  casual: {
    tier: 'casual',
    label: 'Casual',
    description: 'Common, everyday answer words only. The friendliest pool, scaled per length.',
  },
  standard: {
    tier: 'standard',
    label: 'Standard',
    description: 'A broader pool of familiar words — everything in Casual plus more.',
  },
  expert: {
    tier: 'expert',
    label: 'Expert',
    description: 'The full curated answer list, including rarer words. This is the default.',
  },
}

export function isDifficultyTier(value: unknown): value is DifficultyTier {
  return value === 'casual' || value === 'standard' || value === 'expert'
}

/**
 * Coerce an untrusted value (e.g. persisted settings, query params) to a valid
 * tier, falling back to the Expert default so behaviour never regresses.
 */
export function normalizeDifficultyTier(value: unknown): DifficultyTier {
  return isDifficultyTier(value) ? value : DEFAULT_DIFFICULTY_TIER
}

export function getDifficultyTierMeta(tier: DifficultyTier): DifficultyTierMeta {
  return DIFFICULTY_TIER_META[tier]
}
