import { normalizeCompetitiveMultiplayerState } from './competitiveMultiplayer'
import type { RatingBucketId, MultiplayerRatingProfile, MultiplayerRatingTransaction } from './rating'

export interface PrivateRankedLeaderboardIdentity {
  readonly kind: 'phase28-placeholder'
  readonly label: string
  readonly userKey: string
  readonly viewerOwned: boolean
}

export interface PrivateRankedLeaderboardRow {
  readonly bucket: RatingBucketId
  readonly draws: number
  readonly gamesPlayed: number
  readonly identity: PrivateRankedLeaderboardIdentity
  readonly latestRatingDelta: number
  readonly latestRatingMovementAt?: string
  readonly losses: number
  readonly peakRating: number
  readonly provisional: boolean
  readonly rank: number
  readonly rating: number
  readonly source: 'trusted-rating-cache'
  readonly updatedAt: string
  readonly wins: number
}

export interface PrivateRankedLeaderboardOptions {
  readonly maxRowsPerBucket?: number
  readonly viewerUserId?: string
}

const DEFAULT_MAX_ROWS_PER_BUCKET = 100
const MAX_ROWS_PER_BUCKET = 500

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_ROWS_PER_BUCKET
  }
  return Math.max(1, Math.min(MAX_ROWS_PER_BUCKET, Math.trunc(value)))
}

function profileKey(profile: Pick<MultiplayerRatingProfile, 'bucket' | 'userId'>): string {
  return `${profile.bucket}:${profile.userId}`
}

function stablePrivateHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

function identityForUser(userId: string, viewerUserId: string): PrivateRankedLeaderboardIdentity {
  const userKey = `ranked-private-${stablePrivateHash(userId)}`
  return {
    kind: 'phase28-placeholder',
    label: userId === viewerUserId ? 'You' : `Player ${userKey.slice(-6).toUpperCase()}`,
    userKey,
    viewerOwned: userId === viewerUserId,
  }
}

function selectLatestTransaction(
  transactions: readonly MultiplayerRatingTransaction[],
  profile: MultiplayerRatingProfile,
): MultiplayerRatingTransaction | undefined {
  return transactions
    .filter((transaction) => transaction.userId === profile.userId && transaction.bucket === profile.bucket)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
}

function selectPeakRating(
  transactions: readonly MultiplayerRatingTransaction[],
  profile: MultiplayerRatingProfile,
): number {
  return Math.max(
    profile.rating,
    ...transactions
      .filter((transaction) => transaction.userId === profile.userId && transaction.bucket === profile.bucket)
      .flatMap((transaction) => [transaction.oldRating, transaction.newRating]),
  )
}

function latestProfileByUserBucket(profiles: readonly MultiplayerRatingProfile[]): readonly MultiplayerRatingProfile[] {
  const profileMap = new Map<string, MultiplayerRatingProfile>()
  for (const profile of profiles) {
    const existing = profileMap.get(profileKey(profile))
    if (!existing || profile.updatedAt > existing.updatedAt) {
      profileMap.set(profileKey(profile), profile)
    }
  }
  return Array.from(profileMap.values())
}

export function selectPrivateRankedLeaderboardRows(
  state: unknown,
  options: PrivateRankedLeaderboardOptions = {},
): readonly PrivateRankedLeaderboardRow[] {
  const viewerUserId = typeof options.viewerUserId === 'string' ? options.viewerUserId.trim() : ''
  if (!viewerUserId) {
    return []
  }

  const maxRowsPerBucket = normalizeLimit(options.maxRowsPerBucket)
  const competitive = normalizeCompetitiveMultiplayerState(state)
  const transactions = competitive.rating.transactions
  const rowsByBucket = new Map<RatingBucketId, PrivateRankedLeaderboardRow[]>()

  for (const profile of latestProfileByUserBucket(competitive.rating.profiles)) {
    const latestTransaction = selectLatestTransaction(transactions, profile)
    const row: PrivateRankedLeaderboardRow = {
      bucket: profile.bucket,
      draws: profile.draws,
      gamesPlayed: profile.gamesPlayed,
      identity: identityForUser(profile.userId, viewerUserId),
      latestRatingDelta: latestTransaction?.ratingDelta ?? 0,
      latestRatingMovementAt: latestTransaction?.createdAt,
      losses: profile.losses,
      peakRating: selectPeakRating(transactions, profile),
      provisional: profile.provisional,
      rank: 0,
      rating: profile.rating,
      source: 'trusted-rating-cache',
      updatedAt: profile.updatedAt,
      wins: profile.wins,
    }
    const bucketRows = rowsByBucket.get(profile.bucket) ?? []
    rowsByBucket.set(profile.bucket, [...bucketRows, row])
  }

  return Array.from(rowsByBucket.values())
    .flatMap((rows) => rows
      .sort((left, right) => (
        right.rating - left.rating
        || right.gamesPlayed - left.gamesPlayed
        || right.peakRating - left.peakRating
        || right.updatedAt.localeCompare(left.updatedAt)
        || left.identity.userKey.localeCompare(right.identity.userKey)
      ))
      .slice(0, maxRowsPerBucket)
      .map((row, index) => ({ ...row, rank: index + 1 })))
    .sort((left, right) => left.bucket.localeCompare(right.bucket) || left.rank - right.rank)
}
