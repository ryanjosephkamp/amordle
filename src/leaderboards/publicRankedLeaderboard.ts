import {
  PUBLIC_PROFILE_FLAIR_KEYS,
  normalizePublicProfileAccentColor,
  normalizePublicProfileAvatarUrl,
  normalizePublicProfileDisplayName,
  type PublicProfileFlairKey,
} from '../account/publicProfile'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'
import type { ProfileAccentColor } from '../account/profile'

export const PUBLIC_RANKED_LEADERBOARD_KEY = 'ranked-practice-v1' as const
export const PUBLIC_RANKED_DAILY_LEADERBOARD_KEY = 'ranked-daily-v1' as const
export const PUBLIC_RANKED_LEADERBOARD_BUCKETS = [
  'multiplayer:og',
  'multiplayer:go',
  'multiplayer:og:daily:v1',
  'multiplayer:go:daily:v1',
] as const
export const PUBLIC_RANKED_LEADERBOARD_DEFAULT_LIMIT = 50
export const PUBLIC_RANKED_LEADERBOARD_MAX_LIMIT = 100
export const PUBLIC_RANKED_LEADERBOARD_MAX_OFFSET = 1000

export type PublicRankedLeaderboardBucket = (typeof PUBLIC_RANKED_LEADERBOARD_BUCKETS)[number]
export type PublicRankedLeaderboardKey =
  | typeof PUBLIC_RANKED_LEADERBOARD_KEY
  | typeof PUBLIC_RANKED_DAILY_LEADERBOARD_KEY

export interface PublicRankedLeaderboardRow {
  readonly accentColor: ProfileAccentColor
  readonly avatarUrl?: string
  readonly bucket: PublicRankedLeaderboardBucket
  readonly displayName: string
  readonly draws: number
  readonly flairKey: PublicProfileFlairKey
  readonly gamesPlayed: number
  readonly latestRatingDelta: number
  readonly latestRatingMovementAt?: string
  readonly leaderboardKey: PublicRankedLeaderboardKey
  readonly leaderboardUpdatedAt: string
  readonly losses: number
  readonly peakRating: number
  readonly profileUpdatedAt: string
  readonly provisional: boolean
  readonly publicProfileId: string
  readonly rank: number
  readonly rating: number
  readonly wins: number
}

export interface PublicRankedLeaderboardQuery {
  readonly bucket?: PublicRankedLeaderboardBucket | null
  readonly limit?: number
  readonly offset?: number
}

export type NormalizedPublicRankedLeaderboardQuery =
  | {
    readonly ok: true
    readonly value: {
      readonly bucket: PublicRankedLeaderboardBucket | null
      readonly limit: number
      readonly offset: number
    }
  }
  | { readonly message: string; readonly ok: false }

export interface PublicRankedLeaderboardRepository {
  readonly loadRankedPracticeLeaderboard: (
    query?: PublicRankedLeaderboardQuery,
  ) => Promise<readonly PublicRankedLeaderboardRow[]>
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

const PUBLIC_RANKED_LEADERBOARD_ALLOWED_KEYS = new Set([
  'leaderboard_key',
  'rank',
  'bucket',
  'public_profile_id',
  'display_name',
  'accent_color',
  'flair_key',
  'avatar_url',
  'rating',
  'games_played',
  'wins',
  'losses',
  'draws',
  'provisional',
  'latest_rating_delta',
  'latest_rating_movement_at',
  'peak_rating',
  'profile_updated_at',
  'leaderboard_updated_at',
])

const PUBLIC_RANKED_LEADERBOARD_FORBIDDEN_KEYS = new Set([
  'answer',
  'answers',
  'app_metadata',
  'auth_id',
  'auth_user_id',
  'authid',
  'daily_claim_id',
  'email',
  'game_history',
  'match_id',
  'metadata',
  'opponent_id',
  'opponent_user_id',
  'player_sessions',
  'private_profile',
  'progress',
  'queue_id',
  'raw_app_meta_data',
  'raw_rating_transaction_id',
  'raw_user_meta_data',
  'rating_transaction_id',
  'seed',
  'seeds',
  'serialized_session',
  'service_id',
  'session',
  'sessions',
  'settlement_id',
  'settings',
  'token',
  'tokens',
  'transaction_id',
  'user_id',
  'userid',
])

const PUBLIC_RANKED_LEADERBOARD_FORBIDDEN_KEY_TOKENS = [
  'answer',
  'appmetadata',
  'authid',
  'authuserid',
  'dailyclaimid',
  'email',
  'matchid',
  'metadata',
  'opponentid',
  'opponentuserid',
  'playersession',
  'privateprofile',
  'queueid',
  'rawappmetadata',
  'rawratingtransactionid',
  'rawusermetadata',
  'ratingtransactionid',
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

function isAllowedLeaderboardKey(key: string): boolean {
  if (!PUBLIC_RANKED_LEADERBOARD_ALLOWED_KEYS.has(key)) {
    return false
  }
  const normalized = normalizePrivacyKey(key)
  return !PUBLIC_RANKED_LEADERBOARD_FORBIDDEN_KEYS.has(key)
    && !PUBLIC_RANKED_LEADERBOARD_FORBIDDEN_KEYS.has(normalized)
    && !PUBLIC_RANKED_LEADERBOARD_FORBIDDEN_KEY_TOKENS.some((token) => normalized.includes(token))
}

function hasOnlyPublicLeaderboardKeys(record: Record<string, unknown>): boolean {
  return Object.keys(record).every(isAllowedLeaderboardKey)
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function getInteger(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)
    ? value
    : undefined
}

function parseRequiredTimestamp(record: Record<string, unknown>, key: string): string | undefined {
  const value = getString(record, key)
  return value && !Number.isNaN(Date.parse(value)) ? value : undefined
}

function parseOptionalTimestamp(record: Record<string, unknown>, key: string): string | null | undefined {
  const value = record[key]
  if (value === null || value === undefined) {
    return undefined
  }
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
}

export function normalizePublicRankedLeaderboardBucket(value: unknown): PublicRankedLeaderboardBucket | undefined {
  return typeof value === 'string' && (PUBLIC_RANKED_LEADERBOARD_BUCKETS as readonly string[]).includes(value)
    ? value as PublicRankedLeaderboardBucket
    : undefined
}

function getExpectedLeaderboardKey(bucket: PublicRankedLeaderboardBucket): PublicRankedLeaderboardKey {
  return bucket.endsWith(':daily:v1') ? PUBLIC_RANKED_DAILY_LEADERBOARD_KEY : PUBLIC_RANKED_LEADERBOARD_KEY
}

export function normalizePublicRankedLeaderboardQuery(
  query: PublicRankedLeaderboardQuery = {},
): NormalizedPublicRankedLeaderboardQuery {
  let bucket: PublicRankedLeaderboardBucket | null = null
  if (query.bucket !== null && query.bucket !== undefined) {
    const normalizedBucket = normalizePublicRankedLeaderboardBucket(query.bucket)
    if (!normalizedBucket) {
      return { message: 'Unsupported public ranked leaderboard bucket.', ok: false }
    }
    bucket = normalizedBucket
  }

  const limit = query.limit === undefined ? PUBLIC_RANKED_LEADERBOARD_DEFAULT_LIMIT : query.limit
  if (
    typeof limit !== 'number'
    || !Number.isInteger(limit)
    || limit < 1
    || limit > PUBLIC_RANKED_LEADERBOARD_MAX_LIMIT
  ) {
    return { message: `Public ranked leaderboard limit must be 1-${PUBLIC_RANKED_LEADERBOARD_MAX_LIMIT}.`, ok: false }
  }

  const offset = query.offset === undefined ? 0 : query.offset
  if (
    typeof offset !== 'number'
    || !Number.isInteger(offset)
    || offset < 0
    || offset > PUBLIC_RANKED_LEADERBOARD_MAX_OFFSET
  ) {
    return { message: `Public ranked leaderboard offset must be 0-${PUBLIC_RANKED_LEADERBOARD_MAX_OFFSET}.`, ok: false }
  }

  return {
    ok: true,
    value: {
      bucket,
      limit,
      offset,
    },
  }
}

export function parsePublicRankedLeaderboardRow(value: unknown): PublicRankedLeaderboardRow | undefined {
  if (!isRecord(value) || !hasOnlyPublicLeaderboardKeys(value)) {
    return undefined
  }

  const leaderboardKey = getString(value, 'leaderboard_key')
  const rank = getInteger(value, 'rank')
  const bucket = normalizePublicRankedLeaderboardBucket(getString(value, 'bucket'))
  const publicProfileId = getString(value, 'public_profile_id')
  const displayName = normalizePublicProfileDisplayName(value.display_name)
  const accentColor = normalizePublicProfileAccentColor(getString(value, 'accent_color'))
  const flairKey = typeof value.flair_key === 'string'
    && (PUBLIC_PROFILE_FLAIR_KEYS as readonly string[]).includes(value.flair_key)
    ? value.flair_key as PublicProfileFlairKey
    : undefined
  const rating = getInteger(value, 'rating')
  const gamesPlayed = getInteger(value, 'games_played')
  const wins = getInteger(value, 'wins')
  const losses = getInteger(value, 'losses')
  const draws = getInteger(value, 'draws')
  const provisional = value.provisional
  const latestRatingDelta = getInteger(value, 'latest_rating_delta')
  const latestRatingMovementAt = parseOptionalTimestamp(value, 'latest_rating_movement_at')
  const peakRating = getInteger(value, 'peak_rating')
  const profileUpdatedAt = parseRequiredTimestamp(value, 'profile_updated_at')
  const leaderboardUpdatedAt = parseRequiredTimestamp(value, 'leaderboard_updated_at')

  if (
    rank === undefined
    || rank < 1
    || !bucket
    || !publicProfileId
    || !UUID_PATTERN.test(publicProfileId)
    || !displayName
    || !accentColor
    || !flairKey
    || rating === undefined
    || rating < 1
    || gamesPlayed === undefined
    || gamesPlayed < 1
    || wins === undefined
    || wins < 0
    || losses === undefined
    || losses < 0
    || draws === undefined
    || draws < 0
    || wins + losses + draws > gamesPlayed
    || typeof provisional !== 'boolean'
    || latestRatingDelta === undefined
    || latestRatingMovementAt === null
    || peakRating === undefined
    || peakRating < rating
    || !profileUpdatedAt
    || !leaderboardUpdatedAt
    || leaderboardKey !== getExpectedLeaderboardKey(bucket)
  ) {
    return undefined
  }

  const avatarUrl = normalizePublicProfileAvatarUrl(value.avatar_url)
  if (value.avatar_url !== null && value.avatar_url !== undefined && !avatarUrl) {
    return undefined
  }

  return {
    accentColor,
    avatarUrl,
    bucket,
    displayName,
    draws,
    flairKey,
    gamesPlayed,
    latestRatingDelta,
    latestRatingMovementAt: latestRatingMovementAt ?? undefined,
    leaderboardKey,
    leaderboardUpdatedAt,
    losses,
    peakRating,
    profileUpdatedAt,
    provisional,
    publicProfileId,
    rank,
    rating,
    wins,
  }
}

export function parsePublicRankedLeaderboardRows(value: unknown): readonly PublicRankedLeaderboardRow[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((row) => parsePublicRankedLeaderboardRow(row) ?? [])
}

export function createSupabasePublicRankedLeaderboardRepository(
  client: BrrrdleSupabaseClient,
): PublicRankedLeaderboardRepository {
  return {
    async loadRankedPracticeLeaderboard(query = {}) {
      const normalized = normalizePublicRankedLeaderboardQuery(query)
      if (!normalized.ok) {
        throw new Error(normalized.message)
      }

      const { data, error } = await client.rpc('get_public_ranked_leaderboard', {
        p_bucket: normalized.value.bucket,
        p_limit: normalized.value.limit,
        p_offset: normalized.value.offset,
      })
      if (error) {
        return []
      }
      return parsePublicRankedLeaderboardRows(data)
    },
  }
}
