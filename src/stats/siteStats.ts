import type { BrrrdleSupabaseClient } from '../account/supabaseClient'

export const PUBLIC_SITE_STATS_KEY = 'site-stats-v1' as const

export interface PublicSiteStats {
  readonly generatedAt: string
  readonly leaderboardUpdatedAt?: string
  readonly publicProfilesActive: number
  readonly publicProfilesUpdatedAt?: string
  readonly rankedPracticePublicGoPlayers: number
  readonly rankedPracticePublicOgPlayers: number
  readonly rankedPracticePublicPlayerResults: number
  readonly rankedPracticePublicPlayers: number
  readonly statsKey: typeof PUBLIC_SITE_STATS_KEY
}

export interface PublicSiteStatsRepository {
  readonly loadPublicSiteStats: () => Promise<PublicSiteStats | undefined>
}

const PUBLIC_SITE_STATS_ALLOWED_KEYS = new Set([
  'generated_at',
  'leaderboard_updated_at',
  'public_profiles_active',
  'public_profiles_updated_at',
  'ranked_practice_public_go_players',
  'ranked_practice_public_og_players',
  'ranked_practice_public_player_results',
  'ranked_practice_public_players',
  'stats_key',
])

const FORBIDDEN_PUBLIC_SITE_STATS_KEY_TOKENS = [
  'answer',
  'authid',
  'authuserid',
  'dailyclaim',
  'email',
  'matchid',
  'metadata',
  'opponentid',
  'playersession',
  'private',
  'projection',
  'queueid',
  'raw',
  'ratingtransaction',
  'seed',
  'serializedsession',
  'session',
  'settlementid',
  'token',
  'transactionid',
  'userid',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePrivacyKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, '').toLowerCase()
}

function isAllowedPublicSiteStatsKey(key: string): boolean {
  if (!PUBLIC_SITE_STATS_ALLOWED_KEYS.has(key)) {
    return false
  }
  const normalized = normalizePrivacyKey(key)
  return !FORBIDDEN_PUBLIC_SITE_STATS_KEY_TOKENS.some((token) => normalized.includes(token))
}

function hasOnlyPublicSiteStatsKeys(record: Record<string, unknown>): boolean {
  return Object.keys(record).every(isAllowedPublicSiteStatsKey)
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function getCount(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : undefined
  }
  return undefined
}

function parseRequiredTimestamp(record: Record<string, unknown>, key: string): string | undefined {
  const value = getString(record, key)
  return value && !Number.isNaN(Date.parse(value)) ? value : undefined
}

function parseOptionalTimestamp(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === null || value === undefined) {
    return undefined
  }
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined
}

export function parsePublicSiteStatsDto(value: unknown): PublicSiteStats | undefined {
  if (!isRecord(value) || !hasOnlyPublicSiteStatsKeys(value)) {
    return undefined
  }

  const statsKey = getString(value, 'stats_key')
  const generatedAt = parseRequiredTimestamp(value, 'generated_at')
  const publicProfilesActive = getCount(value, 'public_profiles_active')
  const rankedPracticePublicPlayers = getCount(value, 'ranked_practice_public_players')
  const rankedPracticePublicPlayerResults = getCount(value, 'ranked_practice_public_player_results')
  const rankedPracticePublicOgPlayers = getCount(value, 'ranked_practice_public_og_players')
  const rankedPracticePublicGoPlayers = getCount(value, 'ranked_practice_public_go_players')
  const leaderboardUpdatedAt = parseOptionalTimestamp(value, 'leaderboard_updated_at')
  const publicProfilesUpdatedAt = parseOptionalTimestamp(value, 'public_profiles_updated_at')

  if (
    statsKey !== PUBLIC_SITE_STATS_KEY
    || !generatedAt
    || publicProfilesActive === undefined
    || rankedPracticePublicPlayers === undefined
    || rankedPracticePublicPlayerResults === undefined
    || rankedPracticePublicOgPlayers === undefined
    || rankedPracticePublicGoPlayers === undefined
    || rankedPracticePublicOgPlayers > rankedPracticePublicPlayers
    || rankedPracticePublicGoPlayers > rankedPracticePublicPlayers
  ) {
    return undefined
  }

  return {
    generatedAt,
    leaderboardUpdatedAt,
    publicProfilesActive,
    publicProfilesUpdatedAt,
    rankedPracticePublicGoPlayers,
    rankedPracticePublicOgPlayers,
    rankedPracticePublicPlayerResults,
    rankedPracticePublicPlayers,
    statsKey,
  }
}

function firstParsedRow<T>(value: unknown, parser: (row: unknown) => T | undefined): T | undefined {
  if (!Array.isArray(value)) {
    return parser(value)
  }
  for (const row of value) {
    const parsed = parser(row)
    if (parsed) {
      return parsed
    }
  }
  return undefined
}

export function createSupabasePublicSiteStatsRepository(
  client: BrrrdleSupabaseClient,
): PublicSiteStatsRepository {
  return {
    async loadPublicSiteStats() {
      const { data, error } = await client.rpc('get_public_site_stats_v1')
      if (error) {
        return undefined
      }
      return firstParsedRow(data, parsePublicSiteStatsDto)
    },
  }
}
