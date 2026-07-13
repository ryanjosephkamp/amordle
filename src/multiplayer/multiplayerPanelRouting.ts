import type { MultiplayerProfileSummary } from './dailyMultiplayer'
import {
  getViewerMultiplayerPlayerId,
  type MultiplayerGame,
  type MultiplayerPlayerId,
} from './multiplayer'
import type { PrivateMatchRequestResult } from './multiplayerRepository'

export type RankedQueueAutoRefreshStatus = 'cancelled' | 'error' | 'idle' | 'matched' | 'queued'
export type RankedQueueRefreshTrigger = 'auto' | 'manual'

export function getRankedQueueActiveRequestId({
  requestId,
  status,
}: {
  readonly requestId?: string
  readonly status: RankedQueueAutoRefreshStatus
}): string | undefined {
  return status === 'queued' ? requestId : undefined
}

export function shouldAutoRefreshRankedQueue({
  hasRankedQueueActions,
  readOnly,
  requestId,
  status,
}: {
  readonly hasRankedQueueActions: boolean
  readonly readOnly: boolean
  readonly requestId?: string
  readonly status: RankedQueueAutoRefreshStatus
}): boolean {
  return status === 'queued' && Boolean(requestId) && hasRankedQueueActions && !readOnly
}

export function shouldShowRankedQueueBusyForRefresh(trigger: RankedQueueRefreshTrigger): boolean {
  return trigger === 'manual'
}

export function getActivePrivateMatchRequests(
  requests: readonly PrivateMatchRequestResult[],
): readonly PrivateMatchRequestResult[] {
  return requests.filter((request) => request.requestStatus === 'requested' && !request.expired)
}

export function getPrivateMatchCreatedGameAutoRouteId({
  requests,
  selectedGameId,
  viewerUserId,
  visibleGames,
}: {
  readonly requests: readonly PrivateMatchRequestResult[]
  readonly selectedGameId: string | undefined
  readonly viewerUserId: string | undefined
  readonly visibleGames: readonly MultiplayerGame[]
}): string | undefined {
  if (!viewerUserId) {
    return undefined
  }
  const createdGameIds = requests
    .filter((request) => (
      request.requestStatus === 'created'
      && Boolean(request.createdGameId)
      && !request.expired
    ))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .map((request) => request.createdGameId)
    .filter((gameId): gameId is string => Boolean(gameId))

  for (const gameId of createdGameIds) {
    if (gameId === selectedGameId) {
      continue
    }
    const game = visibleGames.find((entry) => entry.id === gameId)
    if (game && getViewerMultiplayerPlayerId(game, viewerUserId)) {
      return game.id
    }
  }
  return undefined
}

export function getCreatorJoinedGameAutoRouteId({
  currentGames,
  previousGames,
  selectedGame,
  viewerUserId,
}: {
  readonly currentGames: readonly MultiplayerGame[]
  readonly previousGames: readonly MultiplayerGame[]
  readonly selectedGame: MultiplayerGame | undefined
  readonly viewerUserId: string | undefined
}): string | undefined {
  if (!viewerUserId) {
    return undefined
  }
  const previousById = new Map(previousGames.map((game) => [game.id, game]))
  const newlyJoinedCreatorGames = currentGames
    .filter((game) => {
      if (
        game.status !== 'playing'
        || game.playerUserIds?.['player-one'] !== viewerUserId
        || !game.playerUserIds?.['player-two']
      ) {
        return false
      }
      const previous = previousById.get(game.id)
      return Boolean(
        previous
          && previous.status === 'waiting'
          && !previous.playerUserIds?.['player-two'],
      )
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))

  const candidate = newlyJoinedCreatorGames[0]
  if (!candidate) {
    return undefined
  }
  const selectedIsDifferentActiveGame = Boolean(
    selectedGame
      && selectedGame.id !== candidate.id
      && selectedGame.status === 'playing'
      && getViewerMultiplayerPlayerId(selectedGame, viewerUserId),
  )
  return selectedIsDifferentActiveGame ? undefined : candidate.id
}

export function mergeFinalizedRankedGameIntoLocalState(
  currentGames: readonly MultiplayerGame[],
  finalizedGame: MultiplayerGame,
): readonly MultiplayerGame[] {
  const existing = currentGames.find((game) => game.id === finalizedGame.id)
  const nextGame = existing ?? finalizedGame
  return [
    nextGame,
    ...currentGames.filter((game) => game.id !== finalizedGame.id),
  ]
}

export function resolveFinalizedRankedQueueGame({
  built,
  durable,
  idempotent,
}: {
  readonly built: MultiplayerGame
  readonly durable: MultiplayerGame | undefined
  readonly idempotent: boolean
}): MultiplayerGame | undefined {
  return idempotent ? durable : built
}

export function getRecoverableRankedQueueGame({
  currentGames,
  matchedGameId,
  viewerUserId,
}: {
  readonly currentGames: readonly MultiplayerGame[]
  readonly matchedGameId: string | undefined
  readonly viewerUserId: string | undefined
}): MultiplayerGame | undefined {
  if (!matchedGameId || !viewerUserId) {
    return undefined
  }
  const game = currentGames.find((entry) => entry.id === matchedGameId)
  if (!game || !game.ranked || (game.scope !== 'practice' && game.scope !== 'daily') || game.status === 'cancelled') {
    return undefined
  }
  return getViewerMultiplayerPlayerId(game, viewerUserId) ? game : undefined
}

export function getMultiplayerPlayerDisplayLabel(
  game: MultiplayerGame,
  playerId: MultiplayerPlayerId,
  viewerPlayerId: MultiplayerPlayerId | undefined,
  profiles: Partial<Record<MultiplayerPlayerId, MultiplayerProfileSummary>> | undefined = game.playerProfiles,
  fallback = 'Rival',
): string {
  if (playerId === viewerPlayerId) {
    return 'You'
  }
  const profileLabel = profiles?.[playerId]?.label ?? profiles?.[playerId]?.displayName
  if (profileLabel?.trim()) {
    return profileLabel
  }
  const storedLabel = game.players.find((player) => player.id === playerId)?.label
  const normalizedStoredLabel = storedLabel?.trim()
  if (normalizedStoredLabel && !['you', 'rival'].includes(normalizedStoredLabel.toLocaleLowerCase('en-US'))) {
    return normalizedStoredLabel
  }
  return fallback
}
