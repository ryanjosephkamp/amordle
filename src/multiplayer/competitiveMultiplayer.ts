import type { AuthState } from '../account/auth'
import type { MultiplayerGame, MultiplayerState } from './multiplayer'
import type { CustomGameLobby } from './customGames'
import { normalizeCustomGameLobby } from './customGames'
import {
  MULTIPLAYER_PROVISIONAL_GAMES,
  applyRatedMatch,
  createInitialRatingProfile,
  createEmptyRatingState,
  normalizeRatingState,
  parseRatingBucket,
  type MultiplayerRatingState,
  type MultiplayerRatingProfile,
  type MultiplayerRatingTransaction,
} from './rating'
import {
  createRatedEvidenceFromPerformance,
  projectMultiplayerPerformance,
  type MultiplayerMatchPerformance,
} from './scoring'

export interface MultiplayerCompetitiveState {
  readonly customGames: readonly CustomGameLobby[]
  readonly rating: MultiplayerRatingState
  readonly results: readonly MultiplayerMatchPerformance[]
}

export interface SettleMultiplayerResult {
  readonly performance?: MultiplayerMatchPerformance
  readonly state: MultiplayerCompetitiveState
  readonly transactions: readonly MultiplayerRatingTransaction[]
}

export interface SettleMultiplayerResultOptions {
  readonly applyLocalRating?: boolean
}

export function createEmptyCompetitiveMultiplayerState(): MultiplayerCompetitiveState {
  return {
    customGames: [],
    rating: createEmptyRatingState(),
    results: [],
  }
}

export function normalizeCompetitiveMultiplayerState(value: unknown): MultiplayerCompetitiveState {
  if (typeof value !== 'object' || value === null) {
    return createEmptyCompetitiveMultiplayerState()
  }
  const record = value as Record<string, unknown>
  const results = Array.isArray(record.results)
    ? record.results.flatMap((result): MultiplayerMatchPerformance[] => {
        if (typeof result !== 'object' || result === null) {
          return []
        }
        const row = result as MultiplayerMatchPerformance & { readonly transport?: unknown }
        const bucket = parseRatingBucket(row.bucket)
        return typeof row.sourceMatchId === 'string' && bucket ? [{
          bucket,
          customGameCode: row.customGameCode,
          dailyDateKey: row.dailyDateKey,
          endedAt: row.endedAt,
          mode: row.mode,
          players: row.players,
          ranked: row.ranked,
          scope: row.scope,
          sourceMatchId: row.sourceMatchId,
          status: row.status,
          summary: typeof row.summary === 'string' ? row.summary.replace(/\b(async|live)\b/gi, 'multiplayer') : row.summary,
          winnerPlayerId: row.winnerPlayerId,
        }] : []
      })
    : []
  return {
    customGames: Array.isArray(record.customGames) ? record.customGames.flatMap((game) => normalizeCustomGameLobby(game) ?? []) : [],
    rating: normalizeRatingState(record.rating),
    results,
  }
}

export function upsertCustomGameLobby(state: MultiplayerCompetitiveState, lobby: CustomGameLobby): MultiplayerCompetitiveState {
  const normalized = normalizeCompetitiveMultiplayerState(state)
  return {
    ...normalized,
    customGames: [lobby, ...normalized.customGames.filter((entry) => entry.id !== lobby.id)].slice(0, 25),
  }
}

function upsertPerformance(state: MultiplayerCompetitiveState, performance: MultiplayerMatchPerformance): MultiplayerCompetitiveState {
  return {
    ...state,
    results: [performance, ...state.results.filter((entry) => entry.sourceMatchId !== performance.sourceMatchId)].slice(0, 100),
  }
}

function ratingProfileKey(userId: string, bucket: MultiplayerRatingProfile['bucket']): string {
  return `${bucket}:${userId}`
}

function updateProfileFromTrustedTransaction(
  profile: MultiplayerRatingProfile,
  transaction: MultiplayerRatingTransaction,
): MultiplayerRatingProfile {
  const gamesPlayed = profile.gamesPlayed + 1
  return {
    ...profile,
    draws: profile.draws + (transaction.outcome === 'draw' ? 1 : 0),
    gamesPlayed,
    losses: profile.losses + (transaction.outcome === 'loss' ? 1 : 0),
    provisional: gamesPlayed < MULTIPLAYER_PROVISIONAL_GAMES,
    rating: transaction.newRating,
    updatedAt: transaction.createdAt,
    wins: profile.wins + (transaction.outcome === 'win' ? 1 : 0),
  }
}

export function applyTrustedSettlementResult(
  state: unknown,
  game: MultiplayerGame,
  transactions: readonly MultiplayerRatingTransaction[],
): MultiplayerCompetitiveState {
  const normalized = normalizeCompetitiveMultiplayerState(state)
  const performance = projectMultiplayerPerformance(game)
  const withResult = performance ? upsertPerformance(normalized, performance) : normalized
  const rating = normalizeRatingState(withResult.rating)
  const existingTransactionIds = new Set(rating.transactions.map((transaction) => transaction.id))
  const existingMatchKeys = new Set(rating.transactions.map((transaction) => `${transaction.matchId}:${transaction.bucket}:${transaction.userId}`))
  const acceptedTransactions = transactions.filter((transaction) => (
    !existingTransactionIds.has(transaction.id)
    && !existingMatchKeys.has(`${transaction.matchId}:${transaction.bucket}:${transaction.userId}`)
    && !existingMatchKeys.has(`${game.id}:${transaction.bucket}:${transaction.userId}`)
  ))
  if (acceptedTransactions.length === 0) {
    return withResult
  }

  const profiles = new Map(rating.profiles.map((profile) => [ratingProfileKey(profile.userId, profile.bucket), profile]))
  for (const transaction of acceptedTransactions) {
    const key = ratingProfileKey(transaction.userId, transaction.bucket)
    const current = profiles.get(key) ?? {
      ...createInitialRatingProfile(transaction.userId, transaction.bucket, transaction.createdAt),
      rating: transaction.oldRating,
    }
    profiles.set(key, updateProfileFromTrustedTransaction(current, transaction))
  }

  return {
    ...withResult,
    rating: {
      profiles: Array.from(profiles.values()).sort((left, right) => left.bucket.localeCompare(right.bucket) || left.userId.localeCompare(right.userId)),
      transactions: [...acceptedTransactions, ...rating.transactions]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 200),
    },
  }
}

export function getLocalRatingUserIds(authState: AuthState): Partial<Record<'player-one' | 'player-two', string>> {
  if (authState.status !== 'authenticated' || !authState.user) {
    return {}
  }
  return {
    'player-one': authState.user.id,
    'player-two': 'matched-rival',
  }
}

function durableResultForPerformance(authState: AuthState, performance: MultiplayerMatchPerformance): boolean {
  return authState.status === 'authenticated'
    && performance.players.length === 2
    && performance.players.every((player) => player.userId && !player.userId.startsWith('preview-rival-'))
}

export function settleMultiplayerResult(
  state: MultiplayerCompetitiveState,
  game: MultiplayerGame,
  authState: AuthState,
  options: SettleMultiplayerResultOptions = {},
): SettleMultiplayerResult {
  const normalized = normalizeCompetitiveMultiplayerState(state)
  const performance = projectMultiplayerPerformance(game)
  if (!performance) {
    return { state: normalized, transactions: [] }
  }
  const nextWithResult = upsertPerformance(normalized, performance)
  if (options.applyLocalRating === false) {
    return {
      performance,
      state: nextWithResult,
      transactions: [],
    }
  }
  const applied = applyRatedMatch(
    nextWithResult.rating,
    createRatedEvidenceFromPerformance(performance, {
      authenticated: authState.status === 'authenticated',
      durableResult: durableResultForPerformance(authState, performance),
    }),
  )
  return {
    performance,
    state: { ...nextWithResult, rating: applied.state },
    transactions: applied.transactions,
  }
}

export function settleMultiplayerStateResults(
  state: unknown,
  multiplayer: MultiplayerState,
  authState: AuthState,
  options: SettleMultiplayerResultOptions = {},
): MultiplayerCompetitiveState {
  return multiplayer.games.reduce(
    (nextState, game) => settleMultiplayerResult(nextState, game, authState, options).state,
    normalizeCompetitiveMultiplayerState(state),
  )
}

export function mergeCompetitiveMultiplayerStates(left: unknown, right: unknown): MultiplayerCompetitiveState {
  const local = normalizeCompetitiveMultiplayerState(left)
  const cloud = normalizeCompetitiveMultiplayerState(right)
  const profileMap = new Map(cloud.rating.profiles.map((profile) => [`${profile.bucket}:${profile.userId}`, profile]))
  for (const profile of local.rating.profiles) {
    const existing = profileMap.get(`${profile.bucket}:${profile.userId}`)
    if (!existing || profile.updatedAt >= existing.updatedAt) {
      profileMap.set(`${profile.bucket}:${profile.userId}`, profile)
    }
  }
  const transactionMap = new Map(cloud.rating.transactions.map((transaction) => [transaction.id, transaction]))
  for (const transaction of local.rating.transactions) {
    transactionMap.set(transaction.id, transaction)
  }
  const resultMap = new Map(cloud.results.map((result) => [result.sourceMatchId, result]))
  for (const result of local.results) {
    resultMap.set(result.sourceMatchId, result)
  }
  const customGameMap = new Map(cloud.customGames.map((game) => [game.id, game]))
  for (const game of local.customGames) {
    customGameMap.set(game.id, game)
  }
  return {
    customGames: Array.from(customGameMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 25),
    rating: {
      profiles: Array.from(profileMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket) || a.userId.localeCompare(b.userId)),
      transactions: Array.from(transactionMap.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200),
    },
    results: Array.from(resultMap.values()).sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '')).slice(0, 100),
  }
}
