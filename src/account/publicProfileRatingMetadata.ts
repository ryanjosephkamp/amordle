import {
  createPublicRankedLeaderboardViewRows,
} from '../leaderboards/publicRankedLeaderboardViewModels'
import type { PublicRankedLeaderboardRow } from '../leaderboards/publicRankedLeaderboard'
import { normalizePublicProfileId } from './publicProfile'

export interface PublicProfileRatingMetadata {
  readonly bucketLabel: string
  readonly gamesLabel: string
  readonly latestMovementLabel: string
  readonly peakLabel: string
  readonly provisionalLabel: string
  readonly rankBandLabel: string
  readonly rankLabel: string
  readonly ratingLabel: string
  readonly recordLabel: string
  readonly updatedLabel: string
}

export function createPublicProfileRatingMetadata(
  rows: readonly PublicRankedLeaderboardRow[],
  publicProfileId: string | undefined,
): readonly PublicProfileRatingMetadata[] {
  const normalizedPublicProfileId = normalizePublicProfileId(publicProfileId)
  if (!normalizedPublicProfileId) {
    return []
  }

  return createPublicRankedLeaderboardViewRows(
    rows.filter((row) => row.publicProfileId === normalizedPublicProfileId),
  ).map((row) => ({
    bucketLabel: row.bucketLabel,
    gamesLabel: row.gamesLabel,
    latestMovementLabel: row.latestMovementLabel,
    peakLabel: row.peakLabel,
    provisionalLabel: row.provisionalLabel,
    rankBandLabel: row.rankBandLabel,
    rankLabel: row.rankLabel,
    ratingLabel: row.ratingLabel,
    recordLabel: row.recordLabel,
    updatedLabel: row.updatedLabel,
  }))
}
