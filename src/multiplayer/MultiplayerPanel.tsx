import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prepareBundledWordList, useWordListPreparation, useWordListSetPreparation, type DifficultyTier } from '../data'
import type { GoPuzzleCount } from '../game/constants'
import type { GameMode, PlayScope } from '../game/types'
import { DefinitionPanel } from '../definitions'
import { Button, Panel } from '../ui'
import { classNames } from '../ui/classNames'
import {
  MAX_MULTIPLAYER_GAMES,
  PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS,
  addMultiplayerGame,
  canCreateMultiplayerGame,
  canViewerCancelMultiplayerGame,
  canViewerJoinMultiplayerGame,
  cancelMultiplayerGame,
  createMultiplayerGame,
  forfeitMultiplayerGame,
  getActiveMultiplayerGames,
  getMultiplayerClockState,
  getMultiplayerAnswerWords,
  getViewerMultiplayerPlayerId,
  hasDailyMultiplayerParticipation,
  joinMultiplayerGame,
  normalizeMultiplayerState,
  submitMultiplayerGuess,
  type MultiplayerGame,
  type MultiplayerPlayerId,
  type MultiplayerState,
  type PracticeMultiplayerTimeLimitMs,
} from './multiplayer'
import { createCustomGameLobby } from './customGames'
import { createMultiplayerProfileSummary, type MultiplayerProfileSummary } from './dailyMultiplayer'
import { normalizeCompetitiveMultiplayerState, upsertCustomGameLobby, type MultiplayerCompetitiveState } from './competitiveMultiplayer'
import { MultiplayerGameSurface } from './MultiplayerGameSurface'
import {
  getRankedDailyRatingBucket,
  getRatingBucket,
  normalizeRankedPracticeTimeLimitMs,
  TIMED_RANKED_PRACTICE_TIME_LIMIT_MS,
} from './rating'
import type {
  MultiplayerRepository,
  ParticipantIdentitySummaryResult,
  PrivateMatchRequestResult,
  RankedQueueFinalizationResult,
  RankedQueueStatusResult,
} from './multiplayerRepository'
import type { PracticeRematchRequestResult } from './multiplayerRepository'
import { RivalIdentityCard } from './RivalIdentityCard'
import { projectMultiplayerPerformance } from './scoring'
import {
  createPracticeRematchGameProjection,
  getPracticePostgameActions,
  type PracticePostgameActions,
  type PracticePostgameSettings,
} from './postgameActions'
import {
  createPrivateMatchGameProjection,
  getPrivateMatchAcceptIdempotencyKey,
} from './privateMatchmaking'
import {
  getPrivateRequestCounterpart,
  getPrivateRequestDirectionAfterAsyncLoad,
  selectPrivateRequestCenterRows,
  type PrivateRequestCenterDirection,
  type PrivateRequestCenterStatusFilter,
} from './privateRequestCenter'
import {
  getActivePrivateMatchRequests,
  getCreatorJoinedGameAutoRouteId,
  getPrivateMatchCreatedGameAutoRouteId,
  getMultiplayerPlayerDisplayLabel,
  getRankedQueueActiveRequestId,
  getRecoverableRankedQueueGame,
  mergeFinalizedRankedGameIntoLocalState,
  resolveFinalizedRankedQueueGame,
  type RankedQueueRefreshTrigger,
  shouldAutoRefreshRankedQueue,
  shouldShowRankedQueueBusyForRefresh,
} from './multiplayerPanelRouting'
import {
  buildFinalizedRankedGameFromStatus,
  buildRankedQueueRequestInput,
  getRankedQueueCreationIdempotencyKey,
  getRankedQueueFinalizationIdempotencyKey,
  withRankedQueueExpiry,
} from './multiplayerPanelRankedQueue'

type MultiplayerMatchKind = 'unranked' | 'ranked' | 'custom'
type RankedQueueActions = Pick<
  MultiplayerRepository,
  'cancelRankedQueueRequest'
  | 'claimRankedQueuePair'
  | 'createRankedQueueRequest'
  | 'finalizeRankedQueueGame'
  | 'getRankedQueueStatus'
  | 'load'
>
type PracticeRematchActions = Pick<
  MultiplayerRepository,
  'acceptPracticeRematch'
  | 'cancelPracticeRematch'
  | 'declinePracticeRematch'
  | 'listPracticeRematchRequests'
  | 'requestPracticeRematch'
>
type PrivateMatchActions = Pick<
  MultiplayerRepository,
  'acceptPrivateMatchRequest'
  | 'cancelPrivateMatchRequest'
  | 'declinePrivateMatchRequest'
  | 'listPrivateMatchRequests'
  | 'load'
>
type ParticipantIdentityActions = Pick<
  MultiplayerRepository,
  'getParticipantIdentitySummaries'
>

async function loadPracticeRematchRequestsForGame(
  actions: PracticeRematchActions | undefined,
  sourceGameId: string | undefined,
  canLoad: boolean,
  readOnly: boolean,
): Promise<readonly PracticeRematchRequestResult[]> {
  if (!sourceGameId || !canLoad || !actions || readOnly) {
    return []
  }
  return actions.listPracticeRematchRequests({
    limit: PRACTICE_REMATCH_REQUEST_LIMIT,
    sourceGameId,
  })
}

async function loadPrivateMatchRequests(
  actions: PrivateMatchActions | undefined,
  canLoad: boolean,
  readOnly: boolean,
): Promise<readonly PrivateMatchRequestResult[]> {
  if (!canLoad || !actions || readOnly) {
    return []
  }
  return actions.listPrivateMatchRequests({
    limit: PRIVATE_MATCH_REQUEST_LIMIT,
  })
}

interface LocalStatusMessage {
  readonly gameId: string | undefined
  readonly text: string
  readonly updatedAt: string | undefined
}

interface PostgameStatusMessage {
  readonly gameId: string
  readonly text: string
}

interface RankedQueueUiState {
  readonly matchedGameId?: string
  readonly message: string
  readonly requestId?: string
  readonly status: 'idle' | 'queued' | 'matched' | 'cancelled' | 'error'
}

interface MultiplayerPanelProps {
  readonly authStatus?: 'anonymous' | 'authenticated' | 'unconfigured'
  readonly competitiveState?: MultiplayerCompetitiveState
  readonly dailyDateKey?: string
  readonly defaultDifficulty: DifficultyTier
  readonly defaultGoPuzzleCount: GoPuzzleCount
  readonly onChange: (state: MultiplayerState) => void | Promise<{ readonly error?: string }>
  readonly onCompetitiveChange?: (state: MultiplayerCompetitiveState) => void
  readonly onGameplayAutoCenterRequest?: () => void
  readonly onOpenEloAbout?: () => void
  readonly onSelectedGameChange?: (gameId: string) => void
  readonly postgameActions?: PracticeRematchActions
  readonly privateMatchActions?: PrivateMatchActions
  readonly participantIdentityActions?: ParticipantIdentityActions
  readonly rankedQueueActions?: RankedQueueActions
  readonly readOnly?: boolean
  readonly selectedGameId?: string
  readonly scope: PlayScope
  readonly state: MultiplayerState | undefined
  readonly viewerProfile?: MultiplayerProfileSummary
  readonly viewerUserId?: string
}

function getGameTitle(game: MultiplayerGame): string {
  const scope = game.scope === 'daily' ? `Daily ${game.dailyDateKey}` : `${game.wordLength} letters`
  const mode = game.mode.toUpperCase()
  return `${mode} multiplayer · ${scope}`
}

function getGameMatchLabel(game: MultiplayerGame): string {
  if (game.ranked) {
    return game.status === 'won' || game.status === 'lost' || game.status === 'expired'
      ? 'Ranked · trusted settlement eligible'
      : 'Ranked · trusted settlement after terminal result'
  }
  if (game.customGameCode) {
    return `Custom ${game.customGameCode} · unrated`
  }
  return 'Unranked'
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatUtcDateTime(value: string | undefined): string {
  if (!value) {
    return 'No time limit'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
    year: 'numeric',
  }).format(date)
}

function ClockSummary({
  game,
  getPlayerLabel,
  now,
}: {
  readonly game: MultiplayerGame
  readonly getPlayerLabel?: (playerId: MultiplayerPlayerId) => string
  readonly now: Date
}) {
  const clock = getMultiplayerClockState(game, now)
  if (!clock) {
    return null
  }
  return (
    <div className="grid gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 sm:grid-cols-2">
      {game.players.map((player) => {
        const remaining = clock.remainingByPlayer[player.id]
        const isActive = clock.activePlayerId === player.id
        const timedOut = clock.timedOutPlayerId === player.id
        return (
          <div
            className={classNames(
              'rounded-md border bg-black/30 p-2',
              timedOut ? 'border-rose-300/70 text-rose-100' : isActive ? 'border-cyan-200/70 text-cyan-50' : 'border-white/10 text-slate-300',
            )}
            key={player.id}
          >
            <p className="text-xs font-bold uppercase tracking-wide">{getPlayerLabel?.(player.id) ?? player.label}</p>
            <p className="text-2xl font-black tabular-nums">{formatClock(remaining)}</p>
            <p className="text-xs">{timedOut ? 'Out of time' : isActive ? 'Clock running' : 'Clock paused'}</p>
          </div>
        )
      })}
    </div>
  )
}

function moveStateClass(state: string): string {
  if (state === 'correct') {
    return 'border-emerald-300/70 bg-emerald-300/25 text-emerald-50'
  }
  if (state === 'present') {
    return 'border-amber-300/70 bg-amber-300/20 text-amber-50'
  }
  return 'border-slate-700 bg-slate-950 text-slate-400'
}

const TERMINAL_SOLVED_SURFACE_HOLD_MS = 2000
const PRACTICE_REMATCH_REQUEST_LIMIT = 10
const PRACTICE_REMATCH_REFRESH_INTERVAL_MS = 5000
const PRIVATE_MATCH_REQUEST_LIMIT = 20
const PRIVATE_MATCH_REFRESH_INTERVAL_MS = 5000
const PARTICIPANT_IDENTITY_FETCH_DELAY_MS = 750
const RANKED_QUEUE_REFRESH_INTERVAL_MS = 5000
const CUSTOM_CODE_CREATION_ENABLED: boolean = false
const CUSTOM_CODE_HIDDEN_MESSAGE = 'Custom-code lobbies are hidden while private Practice requests remain the supported private-match path.'
const LEGACY_CUSTOM_CODE_SETUP_MESSAGE = 'Custom-code lobbies are hidden for now. Same settings loaded as an unranked Practice setup.'
const RANKED_PRACTICE_TIME_LIMIT_OPTIONS = [
  { label: 'No clock', value: null },
  { label: '5 minutes', value: TIMED_RANKED_PRACTICE_TIME_LIMIT_MS },
] as const

function participantIdentityProfilesToMap(
  summaries: readonly ParticipantIdentitySummaryResult[],
): Partial<Record<MultiplayerPlayerId, MultiplayerProfileSummary>> {
  const entries = summaries.flatMap((summary) => {
    if (!summary.identityAvailable || !summary.displayName) {
      return []
    }
    return [[summary.seat, createMultiplayerProfileSummary({
      accentColor: summary.accentColor,
      avatarUrl: summary.avatarUrl,
      displayName: summary.displayName,
      label: summary.displayName,
    }, summary.displayName)] as const]
  })
  return Object.fromEntries(entries) as Partial<Record<MultiplayerPlayerId, MultiplayerProfileSummary>>
}

function getRankedQueueErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'Unable to update ranked queue.'
}

function getRankedQueueUiStatus(status: RankedQueueStatusResult['requestStatus']): RankedQueueUiState['status'] {
  if (status === 'queued' || status === 'matched' || status === 'cancelled') {
    return status
  }
  return 'idle'
}

function getRankedQueueStatusMessage(status: RankedQueueStatusResult['requestStatus']): string {
  if (status === 'queued') {
    return 'Ranked queue request is waiting for a compatible signed-in rival.'
  }
  if (status === 'cancelled') {
    return 'Ranked queue request cancelled.'
  }
  if (status === 'expired') {
    return 'Ranked queue request expired.'
  }
  return `Ranked queue request is ${status}.`
}

function getLatestSolvedMoveId(game: MultiplayerGame | undefined): string | undefined {
  if (!game) {
    return undefined
  }
  return [...game.moves].reverse().find((move) => (
    move.tiles.length > 0 && move.tiles.every((tile) => tile.state === 'correct')
  ))?.id
}

function getMultiplayerStatusMessage(game: MultiplayerGame, viewerPlayerId: 'player-one' | 'player-two' | undefined): string {
  if (game.status === 'waiting') {
    if (viewerPlayerId === 'player-one') {
      if (game.ranked) {
        return 'Ranked multiplayer match opened. Waiting for another signed-in player to join.'
      }
      if (game.customGameCode) {
        return `Custom multiplayer lobby ${game.customGameCode} opened. Waiting for another signed-in player to join.`
      }
      return 'Multiplayer match opened. Waiting for another signed-in player to join.'
    }
    return 'Waiting multiplayer match available. Join this match to claim the rival seat.'
  }
  if (game.status === 'cancelled') {
    return 'Multiplayer lobby cancelled before a result was recorded.'
  }
  if (game.status === 'expired') {
    return 'Multiplayer match expired before completion.'
  }
  if (game.status === 'playing') {
    if (!viewerPlayerId) {
      return 'Multiplayer match in progress.'
    }
    if (game.moves.length === 0) {
      return game.currentTurn === viewerPlayerId
        ? 'Rival joined. Your turn.'
        : 'Joined multiplayer match. Waiting for the next player.'
    }
    const latestMove = game.moves[game.moves.length - 1]
    if (latestMove?.playerId === viewerPlayerId) {
      return 'Turn submitted. Waiting for the next player.'
    }
    return game.currentTurn === viewerPlayerId
      ? 'Rival submitted a turn. Your turn.'
      : 'Turn submitted. Waiting for the next player.'
  }
  if (game.forfeitedPlayerId) {
    if (viewerPlayerId === game.forfeitedPlayerId) {
      return 'You forfeited this multiplayer match.'
    }
    return viewerPlayerId === game.winnerId
      ? 'Rival forfeited. You won this multiplayer match.'
      : 'Multiplayer match ended by forfeit.'
  }
  if (game.timedOutPlayerId) {
    if (viewerPlayerId === game.timedOutPlayerId) {
      return 'You ran out of time and lost this multiplayer match.'
    }
    return viewerPlayerId === game.winnerId
      ? 'Rival ran out of time. You won this multiplayer match.'
      : 'Multiplayer match ended on time.'
  }
  if (game.winnerId) {
    return viewerPlayerId === game.winnerId
      ? 'Match finished. You won this multiplayer match.'
      : 'Match finished. You lost this multiplayer match.'
  }
  return 'Match finished.'
}

function formatPostgameSettings(settings: PracticePostgameSettings): string {
  const mode = settings.mode.toUpperCase()
  const length = `${settings.wordLength} ${settings.wordLength === 1 ? 'letter' : 'letters'}`
  const hardMode = settings.hardMode ? 'Hard Mode on' : 'Hard Mode off'
  const clock = settings.timeLimitMs ? `${formatClock(settings.timeLimitMs)} per side` : 'no clock'
  return `${mode}, ${length}, ${hardMode}, ${clock}`
}

function getActivePracticeRematchRequest(
  gameId: string,
  requests: readonly PracticeRematchRequestResult[],
): PracticeRematchRequestResult | undefined {
  return requests.find((request) => (
    request.sourceGameId === gameId
    && !request.expired
    && (request.requestStatus === 'requested' || request.requestStatus === 'created')
  ))
}

function getLatestPracticeRematchRequest(
  gameId: string,
  requests: readonly PracticeRematchRequestResult[],
): PracticeRematchRequestResult | undefined {
  const matchingRequests = requests
    .filter((request) => request.sourceGameId === gameId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  return matchingRequests[0]
}

function getPracticeRematchLifecycleMessage(request: PracticeRematchRequestResult | undefined): string | undefined {
  if (!request) {
    return undefined
  }
  if (request.expired || request.requestStatus === 'expired') {
    return 'Rematch request expired.'
  }
  if (request.requestStatus === 'declined') {
    return 'Rematch request declined.'
  }
  if (request.requestStatus === 'cancelled') {
    return 'Rematch request cancelled.'
  }
  if (request.requestStatus === 'created') {
    return request.idempotent ? 'Rematch game already created.' : 'Rematch game created.'
  }
  return undefined
}

function getPostgameErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

interface PracticePostgameActionsPanelProps {
  readonly actions: PracticePostgameActions
  readonly busy: boolean
  readonly gameId: string
  readonly isOnlineReady: boolean
  readonly message?: string
  readonly onAcceptRematch: (request: PracticeRematchRequestResult) => void
  readonly onCancelRematch: (request: PracticeRematchRequestResult) => void
  readonly onDeclineRematch: (request: PracticeRematchRequestResult) => void
  readonly onPlayAgain: () => void
  readonly onRequestRematch: () => void
  readonly onSearchAgain: () => void
  readonly rematchActionsAvailable: boolean
  readonly rematchRequests: readonly PracticeRematchRequestResult[]
}

export function PracticePostgameActionsPanel({
  actions,
  busy,
  gameId,
  isOnlineReady,
  message,
  onAcceptRematch,
  onCancelRematch,
  onDeclineRematch,
  onPlayAgain,
  onRequestRematch,
  onSearchAgain,
  rematchActionsAvailable,
  rematchRequests,
}: PracticePostgameActionsPanelProps) {
  const activeRematchRequest = getActivePracticeRematchRequest(gameId, rematchRequests)
  const latestRematchRequest = getLatestPracticeRematchRequest(gameId, rematchRequests)
  const rematchLifecycleMessage = getPracticeRematchLifecycleMessage(latestRematchRequest)
  const hasCreatedRematch = latestRematchRequest?.requestStatus === 'created'
  const hasVisibleAction = actions.canPlayAgain || actions.canRequestRematch || actions.canSearchAgain || Boolean(activeRematchRequest)
  if (!actions.settings || (!hasVisibleAction && !actions.unavailableReason)) {
    return null
  }

  const rematchDisabled = busy || !isOnlineReady || !rematchActionsAvailable
  const rematchDisabledReason = !isOnlineReady
    ? 'Sign in to request a rematch.'
    : !rematchActionsAvailable
      ? 'Practice rematch requests require authenticated Supabase multiplayer.'
      : undefined
  const playAgainLabel = actions.continuationKind === 'custom-play-again'
    ? CUSTOM_CODE_CREATION_ENABLED ? 'Set up custom play again' : 'Load as unranked setup'
    : 'Open new unranked match'

  return (
    <section
      className="space-y-3 rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-50"
      data-testid={`practice-postgame-actions-${gameId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">Postgame actions</p>
          <p className="break-words text-emerald-100">Same settings: {formatPostgameSettings(actions.settings)}</p>
        </div>
        {actions.canSearchAgain ? (
          <span className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-50">
            Ranked queue
          </span>
        ) : null}
      </div>

      {actions.rematchUnavailableReason ? (
        <p className="rounded-md border border-white/10 bg-black/20 p-2 text-xs text-emerald-100">
          {actions.rematchUnavailableReason}
        </p>
      ) : null}

      {rematchLifecycleMessage ? (
        <p className="rounded-md border border-cyan-300/30 bg-cyan-300/10 p-3 font-semibold text-cyan-50">
          {rematchLifecycleMessage}
        </p>
      ) : null}

      {activeRematchRequest?.viewerCanAccept ? (
        <div className="rounded-md border border-cyan-300/30 bg-cyan-300/10 p-3">
          <p className="font-semibold text-cyan-50">Rival requested a rematch.</p>
          <p className="text-xs text-cyan-100">Accepting creates a fresh unranked Practice game with the same settings and same seats.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => onAcceptRematch(activeRematchRequest)} size="sm" variant="primary">Accept rematch</Button>
            <Button disabled={busy} onClick={() => onDeclineRematch(activeRematchRequest)} size="sm" variant="secondary">Decline</Button>
          </div>
        </div>
      ) : activeRematchRequest?.viewerCanCancel ? (
        <div className="rounded-md border border-cyan-300/30 bg-cyan-300/10 p-3">
          <p className="font-semibold text-cyan-50">Waiting for rival to accept.</p>
          <p className="text-xs text-cyan-100">The request expires automatically if your rival does not accept.</p>
          <Button className="mt-2" disabled={busy} onClick={() => onCancelRematch(activeRematchRequest)} size="sm" variant="secondary">Cancel request</Button>
        </div>
      ) : actions.canRequestRematch && !hasCreatedRematch ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={rematchDisabled} onClick={onRequestRematch} size="sm" variant="primary">Request rematch</Button>
          {rematchDisabledReason ? <p className="text-xs text-emerald-100">{rematchDisabledReason}</p> : null}
        </div>
      ) : null}

      {actions.canSearchAgain ? (
        <div className="rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-cyan-100">This uses the trusted ranked queue instead of direct rematch.</p>
          <Button className="mt-2" disabled={busy || !isOnlineReady} onClick={onSearchAgain} size="sm" variant="primary">
            Search ranked Practice again
          </Button>
        </div>
      ) : actions.canPlayAgain ? (
        <Button disabled={busy || !isOnlineReady} onClick={onPlayAgain} size="sm" variant="secondary">{playAgainLabel}</Button>
      ) : null}

      {!hasVisibleAction && actions.unavailableReason ? (
        <p className="rounded-md border border-white/10 bg-black/20 p-2 text-xs text-emerald-100">{actions.unavailableReason}</p>
      ) : null}

      {message ? (
        <p className="rounded-md border border-white/10 bg-black/20 p-2 font-semibold text-emerald-50">{message}</p>
      ) : null}
    </section>
  )
}

function getPrivateMatchProfileLabel(profile: PrivateMatchRequestResult['requester'], fallback: string): string {
  return profile.identityAvailable && profile.displayName ? profile.displayName : fallback
}

function getPrivateMatchSettingsLabel(request: PrivateMatchRequestResult): string {
  const mode = request.mode.toUpperCase()
  const clock = request.timeLimitMs ? `${formatClock(request.timeLimitMs)} per side` : 'no clock'
  const hardMode = request.hardMode ? 'Hard Mode on' : 'Hard Mode off'
  const goPuzzles = request.mode === 'go' && request.goPuzzleCount ? `, ${request.goPuzzleCount} puzzles` : ''
  return `${mode}, ${request.wordLength} letters${goPuzzles}, ${hardMode}, ${clock}`
}

function getPrivateMatchLifecycleMessage(request: PrivateMatchRequestResult): string | undefined {
  if (request.expired || request.requestStatus === 'expired') {
    return 'Private match request expired.'
  }
  if (request.requestStatus === 'declined') {
    return 'Private match request declined.'
  }
  if (request.requestStatus === 'cancelled') {
    return 'Private match request cancelled.'
  }
  if (request.requestStatus === 'created') {
    return request.idempotent ? 'Private match already created.' : 'Private match created.'
  }
  return undefined
}

function isTerminalMultiplayerGame(game: MultiplayerGame): boolean {
  return game.status === 'won' || game.status === 'lost' || game.status === 'expired' || game.status === 'cancelled'
}

interface PrivateMatchRequestsPanelProps {
  readonly busy: boolean
  readonly message?: string
  readonly onAccept: (request: PrivateMatchRequestResult) => void
  readonly onCancel: (request: PrivateMatchRequestResult) => void
  readonly onDecline: (request: PrivateMatchRequestResult) => void
  readonly onEnter?: (gameId: string) => void
  readonly requests: readonly PrivateMatchRequestResult[]
}

export function PrivateMatchRequestsPanel({
  busy,
  message,
  onAccept,
  onCancel,
  onDecline,
  onEnter,
  requests,
}: PrivateMatchRequestsPanelProps) {
  const [direction, setDirection] = useState<PrivateRequestCenterDirection>(() => (
    getActivePrivateMatchRequests(requests)[0]?.viewerRole === 'requester' ? 'outgoing' : 'incoming'
  ))
  const [statusFilter, setStatusFilter] = useState<PrivateRequestCenterStatusFilter>('requested')
  const visibleRequests = selectPrivateRequestCenterRows(requests, direction, statusFilter)
  const activeCount = getActivePrivateMatchRequests(requests).length
  const previousActiveCountRef = useRef(activeCount)
  const shouldOpen = activeCount > 0 || Boolean(message)

  useEffect(() => {
    setDirection((current) => getPrivateRequestDirectionAfterAsyncLoad(
      requests,
      current,
      previousActiveCountRef.current,
    ))
    previousActiveCountRef.current = activeCount
  }, [activeCount, requests])

  return (
    <details
      className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-3 text-sm leading-6 text-cyan-50"
      data-testid="private-match-requests"
      open={shouldOpen}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]">
        <div>
          <p className="font-bold">Private Practice requests</p>
          <p className="text-xs text-cyan-100">Authenticated-only, unranked Practice requests between active public profiles.</p>
        </div>
        <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold text-cyan-50">
          {activeCount} active
        </span>
      </summary>

      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Private request direction">
          <Button onClick={() => setDirection('incoming')} size="sm" variant={direction === 'incoming' ? 'primary' : 'secondary'}>Incoming</Button>
          <Button onClick={() => setDirection('outgoing')} size="sm" variant={direction === 'outgoing' ? 'primary' : 'secondary'}>Outgoing</Button>
          <label className="flex items-center gap-2 text-xs font-semibold">
            Status
            <select className="rounded border border-white/15 bg-black/30 px-2 py-1" onChange={(event) => setStatusFilter(event.target.value as PrivateRequestCenterStatusFilter)} value={statusFilter}>
              <option value="all">All</option><option value="requested">Pending</option><option value="created">Created</option>
              <option value="declined">Declined</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option>
            </select>
          </label>
        </div>
        {visibleRequests.length === 0 ? (
          <p className="rounded-md border border-white/10 bg-black/20 p-2 text-xs text-cyan-100">
            No active private match requests.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleRequests.map((request) => {
              const requesterLabel = getPrivateMatchProfileLabel(request.requester, 'Requester')
              const opponentLabel = getPrivateMatchProfileLabel(request.opponent, 'Opponent')
              const counterpart = getPrivateRequestCounterpart(request)
              const isIncoming = request.viewerRole === 'opponent'
              const lifecycleMessage = getPrivateMatchLifecycleMessage(request)
              return (
                <article
                  className="rounded-md border border-white/10 bg-black/25 p-3"
                  data-request-id={request.requestId}
                  key={request.requestId}
                >
                  <p className="font-semibold text-cyan-50">
                    {isIncoming ? `${requesterLabel} requested a private match.` : `Waiting on ${opponentLabel}.`}
                  </p>
                  <p className="text-xs text-cyan-100">{getPrivateMatchSettingsLabel(request)}</p>
                  {lifecycleMessage ? (
                    <p className="mt-2 rounded border border-white/10 bg-black/20 p-2 text-xs font-semibold text-cyan-50">
                      {lifecycleMessage}
                    </p>
                  ) : null}
                  {request.requestStatus === 'requested' ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {request.viewerCanAccept ? (
                        <Button disabled={busy} onClick={() => onAccept(request)} size="sm" variant="primary">Accept private match</Button>
                      ) : null}
                      {request.viewerCanDecline ? (
                        <Button disabled={busy} onClick={() => onDecline(request)} size="sm" variant="secondary">Decline</Button>
                      ) : null}
                      {request.viewerCanCancel ? (
                        <Button disabled={busy} onClick={() => onCancel(request)} size="sm" variant="secondary">Cancel request</Button>
                      ) : null}
                    </div>
                  ) : null}
                  {request.requestStatus === 'created' && request.createdGameId && onEnter ? (
                    <div className="mt-3"><Button disabled={busy} onClick={() => onEnter(request.createdGameId!)} size="sm" variant="primary">Enter private match</Button></div>
                  ) : null}
                  <p className="mt-2 text-xs text-cyan-100">With {counterpart.displayName ?? 'player'} · Updated {new Date(request.updatedAt).toLocaleString()}</p>
                </article>
              )
            })}
          </div>
        )}

        {message ? (
          <p className="rounded-md border border-white/10 bg-black/20 p-2 font-semibold text-cyan-50" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </details>
  )
}

export function MultiplayerPanel(props: MultiplayerPanelProps) {
  const lengths = useMemo(
    () => [5, ...(props.state?.games ?? []).map((game) => game.wordLength)],
    [props.state?.games],
  )
  const preparation = useWordListSetPreparation(lengths)
  if (!preparation.isReady) {
    return (
      <Panel aria-busy={preparation.error ? undefined : true} className="space-y-3" tone="muted">
        <h3 className="text-lg font-bold text-white">{preparation.error ? 'Multiplayer word data unavailable' : 'Preparing multiplayer'}</h3>
        <p aria-live="polite" className="text-sm text-slate-300">{preparation.error ?? 'Loading the word data required by your current matches…'}</p>
        {preparation.error ? <Button onClick={preparation.retry} variant="primary">Retry</Button> : null}
      </Panel>
    )
  }
  return <PreparedMultiplayerPanel {...props} />
}

function PreparedMultiplayerPanel({
  authStatus = 'unconfigured',
  competitiveState,
  dailyDateKey,
  defaultDifficulty,
  defaultGoPuzzleCount,
  onChange,
  onCompetitiveChange,
  onGameplayAutoCenterRequest,
  onOpenEloAbout,
  onSelectedGameChange,
  postgameActions,
  privateMatchActions,
  participantIdentityActions,
  rankedQueueActions,
  readOnly = false,
  selectedGameId,
  scope,
  state,
  viewerProfile,
  viewerUserId,
}: MultiplayerPanelProps) {
  const normalized = useMemo(() => normalizeMultiplayerState(state), [state])
  const competitive = useMemo(() => normalizeCompetitiveMultiplayerState(competitiveState), [competitiveState])
  const visibleGames = useMemo(
    () => normalized.games.filter((game) => game.scope === scope && (scope === 'practice' || game.dailyDateKey === dailyDateKey)),
    [dailyDateKey, normalized.games, scope],
  )
  const activeVisibleGames = visibleGames.filter((game) => !isTerminalMultiplayerGame(game))
  const terminalVisibleGames = visibleGames.filter(isTerminalMultiplayerGame)
  const [internalSelectedGameId, setInternalSelectedGameId] = useState<string | undefined>(() => visibleGames[0]?.id)
  const [mode, setMode] = useState<GameMode>('og')
  const [matchKind, setMatchKind] = useState<MultiplayerMatchKind>('unranked')
  const [hardMode, setHardMode] = useState(false)
  const [timeLimitMs, setTimeLimitMs] = useState<PracticeMultiplayerTimeLimitMs | null>(null)
  const [wordLength, setWordLength] = useState(5)
  const formPreparation = useWordListPreparation('practice', scope === 'daily' ? 5 : wordLength)
  const [localMessage, setLocalMessage] = useState<LocalStatusMessage | undefined>(undefined)
  const [persistenceMessage, setPersistenceMessage] = useState<string | undefined>(undefined)
  const [postgameMessage, setPostgameMessage] = useState<PostgameStatusMessage | undefined>(undefined)
  const [postgameBusy, setPostgameBusy] = useState(false)
  const [practiceRematchRequests, setPracticeRematchRequests] = useState<readonly PracticeRematchRequestResult[]>([])
  const [privateMatchRequests, setPrivateMatchRequests] = useState<readonly PrivateMatchRequestResult[]>([])
  const [privateMatchBusy, setPrivateMatchBusy] = useState(false)
  const [privateMatchMessage, setPrivateMatchMessage] = useState<string | undefined>(undefined)
  const [participantIdentityState, setParticipantIdentityState] = useState<{
    readonly gameId: string
    readonly profiles: Partial<Record<MultiplayerPlayerId, MultiplayerProfileSummary>>
  } | undefined>(undefined)
  const [rankedQueue, setRankedQueue] = useState<RankedQueueUiState>({ message: '', status: 'idle' })
  const [rankedQueueBusy, setRankedQueueBusy] = useState(false)
  const [clockNow, setClockNow] = useState(() => new Date())
  const previousVisibleGamesRef = useRef<readonly MultiplayerGame[]>(visibleGames)
  const openedPrivateMatchGameIdsRef = useRef<Set<string>>(new Set())
  const rankedQueueRefreshInFlightRef = useRef(false)
  const rankedQueueMutationVersionRef = useRef(0)
  const refreshRankedQueueRef = useRef<(trigger?: RankedQueueRefreshTrigger) => Promise<void>>(async () => undefined)
  const needsClock = useMemo(
    () => visibleGames.some((game) => game.scope === 'practice' && game.timeLimitMs && game.status === 'playing'),
    [visibleGames],
  )
  useEffect(() => {
    if (!needsClock) {
      return undefined
    }
    const id = window.setInterval(() => setClockNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [needsClock])
  const activeCount = getActiveMultiplayerGames(normalized, viewerUserId).length
  const onlineReady = authStatus === 'authenticated' && Boolean(viewerUserId)
  const canLoadPrivateMatchRequests = scope === 'practice' && onlineReady && Boolean(privateMatchActions)
  const dailyClaimedForMode = scope === 'daily'
    ? hasDailyMultiplayerParticipation(normalized, dailyDateKey, mode, viewerUserId, matchKind === 'ranked')
    : false
  const existingDailyClaim = scope === 'daily' && viewerUserId
    ? visibleGames.find((game) => (
        game.mode === mode
        && (game.ranked === true) === (matchKind === 'ranked')
        && getViewerMultiplayerPlayerId(game, viewerUserId)
      ))
    : undefined
  const selectGame = useCallback((gameId: string) => {
    setInternalSelectedGameId(gameId)
    setPersistenceMessage(undefined)
    onSelectedGameChange?.(gameId)
  }, [onSelectedGameChange])
  const controlledSelectedGameId = selectedGameId && visibleGames.some((game) => game.id === selectedGameId)
    ? selectedGameId
    : undefined
  const effectiveSelectedGameId = controlledSelectedGameId
    ?? (internalSelectedGameId && visibleGames.some((game) => game.id === internalSelectedGameId)
      ? internalSelectedGameId
      : undefined)
    ?? existingDailyClaim?.id
    ?? visibleGames[0]?.id
  const selectedGame = visibleGames.find((game) => game.id === effectiveSelectedGameId)
  const viewerPlayerId = selectedGame ? getViewerMultiplayerPlayerId(selectedGame, viewerUserId) : undefined
  useEffect(() => {
    const previousGames = previousVisibleGamesRef.current
    previousVisibleGamesRef.current = visibleGames
    if (readOnly) {
      return
    }
    const nextGameId = getCreatorJoinedGameAutoRouteId({
      currentGames: visibleGames,
      previousGames,
      selectedGame,
      viewerUserId,
    })
    if (nextGameId && nextGameId !== effectiveSelectedGameId) {
      selectGame(nextGameId)
      setLocalMessage(undefined)
    }
  }, [effectiveSelectedGameId, readOnly, selectGame, selectedGame, viewerUserId, visibleGames])
  useEffect(() => {
    let active = true
    if (!selectedGame || !viewerPlayerId || !participantIdentityActions) {
      return () => {
        active = false
      }
    }
    const timeoutId = window.setTimeout(() => {
      void participantIdentityActions.getParticipantIdentitySummaries({ gameId: selectedGame.id })
        .then((summaries) => {
          if (active) {
            setParticipantIdentityState({
              gameId: selectedGame.id,
              profiles: participantIdentityProfilesToMap(summaries),
            })
          }
        })
        .catch(() => {
          if (active) {
            setParticipantIdentityState({
              gameId: selectedGame.id,
              profiles: {},
            })
          }
        })
    }, PARTICIPANT_IDENTITY_FETCH_DELAY_MS)
    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [participantIdentityActions, selectedGame, selectedGame?.updatedAt, viewerPlayerId])
  const selectedPlayerProfiles = selectedGame
    ? {
        ...selectedGame.playerProfiles,
        ...(participantIdentityState?.gameId === selectedGame.id ? participantIdentityState.profiles : {}),
      }
    : undefined
  const getSelectedPlayerLabel = (
    playerId: MultiplayerPlayerId,
    fallback?: string,
  ): string => selectedGame
    ? getMultiplayerPlayerDisplayLabel(selectedGame, playerId, viewerPlayerId, selectedPlayerProfiles, fallback)
    : fallback ?? playerId
  const latestSolvedMoveId = getLatestSolvedMoveId(selectedGame)
  const [clearedTerminalSolvedMoveId, setClearedTerminalSolvedMoveId] = useState<string | undefined>(undefined)
  const showTerminalSolvedSurface = Boolean(
    selectedGame
      && !readOnly
      && viewerPlayerId
      && selectedGame.status === 'won'
      && latestSolvedMoveId
      && clearedTerminalSolvedMoveId !== latestSolvedMoveId,
  )
  useEffect(() => {
    if (!showTerminalSolvedSurface || !latestSolvedMoveId) {
      return undefined
    }
    const timeoutId = window.setTimeout(() => {
      setClearedTerminalSolvedMoveId(latestSolvedMoveId)
    }, TERMINAL_SOLVED_SURFACE_HOLD_MS)
    return () => window.clearTimeout(timeoutId)
  }, [latestSolvedMoveId, showTerminalSolvedSurface])
  const rivalPlayerId = viewerPlayerId === 'player-one' ? 'player-two' : viewerPlayerId === 'player-two' ? 'player-one' : undefined
  const rivalPlayer = rivalPlayerId && selectedGame ? selectedGame.players.find((player) => player.id === rivalPlayerId) : undefined
  const waitingHostPlayer = !viewerPlayerId && selectedGame ? selectedGame.players.find((player) => player.id === 'player-one') : undefined
  const selectedPerformance = selectedGame ? projectMultiplayerPerformance(selectedGame) : undefined
  const sharedStatusMessage = selectedGame ? getMultiplayerStatusMessage(selectedGame, viewerPlayerId) : undefined
  const localStatusMessage = localMessage
    && (!selectedGame || (localMessage.gameId === selectedGame.id && localMessage.updatedAt === selectedGame.updatedAt))
    ? localMessage.text
    : undefined
  const displayStatusMessage = localStatusMessage ?? sharedStatusMessage
  const selectedPostgameMessage = postgameMessage && postgameMessage.gameId === selectedGame?.id ? postgameMessage.text : undefined
  const canJoinSelectedGame = selectedGame ? canViewerJoinMultiplayerGame(selectedGame, viewerUserId) : false
  const canCancelSelectedGame = selectedGame ? canViewerCancelMultiplayerGame(selectedGame, viewerUserId) && !readOnly : false
  const joiningWouldClaimDuplicateDaily = Boolean(
    selectedGame
      && selectedGame.scope === 'daily'
      && hasDailyMultiplayerParticipation(
        normalized,
        selectedGame.dailyDateKey,
        selectedGame.mode,
        viewerUserId,
        selectedGame.ranked === true,
      ),
  )
  const canSubmitSelectedGame = Boolean(
    selectedGame
      && onlineReady
      && viewerPlayerId
      && selectedGame.status === 'playing'
      && selectedGame.currentTurn === viewerPlayerId
      && !readOnly,
  )
  const rankedTimeLimitMs = matchKind === 'ranked' && scope === 'practice'
    ? normalizeRankedPracticeTimeLimitMs(timeLimitMs)
    : null
  const timeLimitOptions = matchKind === 'ranked'
    ? RANKED_PRACTICE_TIME_LIMIT_OPTIONS
    : PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS
  const selectedTimeLimitValue = timeLimitOptions.some((option) => option.value === timeLimitMs) ? timeLimitMs ?? '' : ''
  const rankedQueueUnavailableReason = matchKind === 'ranked'
    ? scope === 'practice' && rankedTimeLimitMs === undefined
        ? 'Ranked Practice supports only no clock or the five-minute clock.'
        : scope === 'daily' && !dailyDateKey
          ? 'Ranked Daily requires the current UTC date.'
        : !rankedQueueActions
          ? 'Ranked queue requires authenticated Supabase multiplayer.'
          : undefined
    : undefined
  const canCreate = canCreateMultiplayerGame(normalized, viewerUserId)
    && !readOnly
    && onlineReady
    && !dailyClaimedForMode
    && !rankedQueueUnavailableReason
    && !rankedQueueBusy
    && formPreparation.isReady
    && !(matchKind === 'ranked' && rankedQueue.status === 'queued')

  const upsertFinalizedRankedGame = useCallback((game: MultiplayerGame) => {
    onChange({
      games: mergeFinalizedRankedGameIntoLocalState(normalized.games, game),
    })
    selectGame(game.id)
    onGameplayAutoCenterRequest?.()
  }, [normalized.games, onChange, onGameplayAutoCenterRequest, selectGame])

  const loadRecoverableRankedQueueGame = useCallback(async (matchedGameId: string | undefined) => {
    const localGame = getRecoverableRankedQueueGame({
      currentGames: normalized.games,
      matchedGameId,
      viewerUserId,
    })
    if (localGame) {
      return localGame
    }
    if (!rankedQueueActions || !matchedGameId || !viewerUserId) {
      return undefined
    }
    try {
      const snapshot = await rankedQueueActions.load()
      return getRecoverableRankedQueueGame({
        currentGames: snapshot.state.games,
        matchedGameId,
        viewerUserId,
      })
    } catch {
      return undefined
    }
  }, [normalized.games, rankedQueueActions, viewerUserId])

  const finalizeRankedQueueMatch = useCallback(async (requestId: string) => {
    if (!rankedQueueActions) {
      throw new Error('Ranked queue requires authenticated Supabase multiplayer.')
    }
    const status = await rankedQueueActions.getRankedQueueStatus(requestId)
    if (status.requestStatus !== 'matched' || !status.matchedGameId) {
      const nextStatus = getRankedQueueUiStatus(status.requestStatus)
      setRankedQueue({
        message: getRankedQueueStatusMessage(status.requestStatus),
        requestId: getRankedQueueActiveRequestId({
          requestId: status.requestId,
          status: nextStatus,
        }),
        status: nextStatus,
      })
      return
    }
    const game = buildFinalizedRankedGameFromStatus({
      defaultDifficulty,
      defaultGoPuzzleCount,
      status,
      viewerProfile,
    })
    const idempotencyKey = getRankedQueueFinalizationIdempotencyKey(status)
    if (!game || !idempotencyKey) {
      throw new Error('Unable to build a valid ranked multiplayer game from queue status.')
    }
    let finalization: RankedQueueFinalizationResult
    try {
      finalization = await rankedQueueActions.finalizeRankedQueueGame({
        game,
        idempotencyKey,
        matchedGameId: status.matchedGameId,
        requestId: status.requestId,
      })
    } catch (error) {
      const recoveredGame = await loadRecoverableRankedQueueGame(status.matchedGameId)
      if (recoveredGame) {
        upsertFinalizedRankedGame(recoveredGame)
        setRankedQueue({
          matchedGameId: recoveredGame.id,
          message: 'Ranked match already finalized. Opening the durable game.',
          requestId: status.requestId,
          status: 'matched',
        })
        return
      }
      throw error
    }
    if (finalization.gameId !== game.id) {
      throw new Error('Ranked queue finalization returned an unexpected game id.')
    }
    const durableGame = finalization.idempotent
      ? await loadRecoverableRankedQueueGame(status.matchedGameId)
      : undefined
    const gameToOpen = resolveFinalizedRankedQueueGame({
      built: game,
      durable: durableGame,
      idempotent: finalization.idempotent,
    })
    if (!gameToOpen) {
      throw new Error('Ranked match was already finalized, but its durable game is unavailable.')
    }
    upsertFinalizedRankedGame(gameToOpen)
    setRankedQueue({
      matchedGameId: gameToOpen.id,
      message: finalization.idempotent
        ? 'Ranked match already finalized. Opening the durable game.'
        : 'Ranked match created. Opening the durable game.',
      requestId: status.requestId,
      status: 'matched',
    })
  }, [defaultDifficulty, defaultGoPuzzleCount, loadRecoverableRankedQueueGame, rankedQueueActions, upsertFinalizedRankedGame, viewerProfile])

  const enterRankedQueue = async (override?: Pick<PracticePostgameSettings, 'hardMode' | 'mode' | 'timeLimitMs' | 'wordLength'>) => {
    const queueMode = override?.mode ?? mode
    const queueWordLength = override?.wordLength ?? wordLength
    const queueHardMode = override?.hardMode ?? hardMode
    const queueTimeLimitMs = override ? override.timeLimitMs ?? null : timeLimitMs
    const requestInput = buildRankedQueueRequestInput({
      dailyDateKey: scope === 'daily' ? dailyDateKey : undefined,
      hardMode: queueHardMode,
      mode: queueMode,
      scope,
      timeLimitMs: queueTimeLimitMs,
      wordLength: queueWordLength,
    })
    const unavailableReason = !requestInput
      ? scope === 'daily'
        ? 'Ranked Daily requires a valid current UTC date, five letters, and no clock.'
        : 'Ranked Practice supports only no clock or the five-minute clock.'
      : !rankedQueueActions
        ? 'Ranked queue requires authenticated Supabase multiplayer.'
        : undefined
    if (!rankedQueueActions || !viewerUserId || !requestInput || unavailableReason) {
      setRankedQueue({
        message: unavailableReason ?? 'Sign in to enter ranked matchmaking.',
        status: 'error',
      })
      return
    }
    rankedQueueMutationVersionRef.current += 1
    setRankedQueue({
      message: scope === 'daily'
        ? 'Creating ranked Daily queue request.'
        : requestInput.timeLimitMs
        ? 'Creating timed ranked queue request.'
        : 'Creating ranked queue request.',
      status: 'idle',
    })
    setRankedQueueBusy(true)
    let createdRequestId: string | undefined
    try {
      const request = await rankedQueueActions.createRankedQueueRequest(withRankedQueueExpiry({
        ...requestInput,
        idempotencyKey: getRankedQueueCreationIdempotencyKey(requestInput, viewerUserId),
      }))
      createdRequestId = request.requestId
      const claim = await rankedQueueActions.claimRankedQueuePair({ requestId: request.requestId })
      if (claim.requestStatus !== 'matched' || !claim.matchedGameId) {
        setRankedQueue({
          message: scope === 'daily'
            ? 'Ranked Daily queue request created. Waiting for a compatible signed-in rival.'
            : requestInput.timeLimitMs
            ? 'Timed ranked queue request created. Waiting for a compatible signed-in rival.'
            : 'Ranked queue request created. Waiting for a compatible signed-in rival.',
          requestId: request.requestId,
          status: 'queued',
        })
        return
      }
      setRankedQueue({
        matchedGameId: claim.matchedGameId,
        message: 'Compatible ranked rival found. Creating durable game.',
        requestId: claim.requestId,
        status: 'matched',
      })
      await finalizeRankedQueueMatch(claim.requestId)
    } catch (error) {
      setRankedQueue({
        message: getRankedQueueErrorMessage(error),
        requestId: createdRequestId,
        status: createdRequestId ? 'queued' : 'error',
      })
    } finally {
      setRankedQueueBusy(false)
    }
  }

  const refreshRankedQueue = useCallback(async (trigger: RankedQueueRefreshTrigger = 'manual') => {
    if (!rankedQueueActions || !rankedQueue.requestId || rankedQueueRefreshInFlightRef.current) {
      return
    }
    const shouldShowBusy = shouldShowRankedQueueBusyForRefresh(trigger)
    const mutationVersion = rankedQueueMutationVersionRef.current
    rankedQueueRefreshInFlightRef.current = true
    if (shouldShowBusy) {
      setRankedQueueBusy(true)
    }
    try {
      const status = await rankedQueueActions.getRankedQueueStatus(rankedQueue.requestId)
      if (status.requestStatus === 'matched') {
        if (mutationVersion !== rankedQueueMutationVersionRef.current) {
          return
        }
        await finalizeRankedQueueMatch(status.requestId)
        return
      }
      if (status.requestStatus !== 'queued') {
        if (mutationVersion !== rankedQueueMutationVersionRef.current) {
          return
        }
        const nextStatus = getRankedQueueUiStatus(status.requestStatus)
        setRankedQueue({
          message: getRankedQueueStatusMessage(status.requestStatus),
          requestId: getRankedQueueActiveRequestId({
            requestId: status.requestId,
            status: nextStatus,
          }),
          status: nextStatus,
        })
        return
      }
      const claim = await rankedQueueActions.claimRankedQueuePair({ requestId: status.requestId })
      if (mutationVersion !== rankedQueueMutationVersionRef.current) {
        return
      }
      if (claim.requestStatus === 'matched') {
        await finalizeRankedQueueMatch(claim.requestId)
        return
      }
      setRankedQueue({
        message: 'Still waiting for a compatible signed-in rival.',
        requestId: status.requestId,
        status: 'queued',
      })
    } catch (error) {
      if (mutationVersion === rankedQueueMutationVersionRef.current) {
        setRankedQueue({
          message: getRankedQueueErrorMessage(error),
          requestId: rankedQueue.requestId,
          status: 'error',
        })
      }
    } finally {
      rankedQueueRefreshInFlightRef.current = false
      if (shouldShowBusy) {
        setRankedQueueBusy(false)
      }
    }
  }, [finalizeRankedQueueMatch, rankedQueue.requestId, rankedQueueActions])
  useEffect(() => {
    refreshRankedQueueRef.current = refreshRankedQueue
  }, [refreshRankedQueue])
  useEffect(() => {
    const shouldRefresh = shouldAutoRefreshRankedQueue({
      hasRankedQueueActions: Boolean(rankedQueueActions),
      readOnly,
      requestId: rankedQueue.requestId,
      status: rankedQueue.status,
    })
    if (!shouldRefresh || rankedQueueBusy) {
      return undefined
    }
    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }
      void refreshRankedQueueRef.current('auto')
    }
    const intervalId = window.setInterval(refreshIfVisible, RANKED_QUEUE_REFRESH_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfVisible()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    rankedQueue.requestId,
    rankedQueue.status,
    rankedQueueActions,
    rankedQueueBusy,
    readOnly,
  ])

  const cancelRankedQueue = async () => {
    if (!rankedQueueActions || !rankedQueue.requestId) {
      return
    }
    rankedQueueMutationVersionRef.current += 1
    setRankedQueueBusy(true)
    try {
      const cancellation = await rankedQueueActions.cancelRankedQueueRequest(rankedQueue.requestId)
      setRankedQueue({
        message: getRankedQueueStatusMessage(cancellation.requestStatus),
        requestId: getRankedQueueActiveRequestId({
          requestId: cancellation.requestId,
          status: getRankedQueueUiStatus(cancellation.requestStatus),
        }),
        status: getRankedQueueUiStatus(cancellation.requestStatus),
      })
    } catch (error) {
      setRankedQueue({
        message: getRankedQueueErrorMessage(error),
        requestId: rankedQueue.requestId,
        status: 'error',
      })
    } finally {
      setRankedQueueBusy(false)
    }
  }

  const refreshPrivateMatchRequests = useCallback(async () => {
    try {
      setPrivateMatchRequests(await loadPrivateMatchRequests(
        privateMatchActions,
        canLoadPrivateMatchRequests,
        readOnly,
      ))
    } catch {
      setPrivateMatchRequests([])
    }
  }, [canLoadPrivateMatchRequests, privateMatchActions, readOnly])

  useEffect(() => {
    let active = true
    void loadPrivateMatchRequests(
      privateMatchActions,
      canLoadPrivateMatchRequests,
      readOnly,
    ).then((requests) => {
      if (active) {
        setPrivateMatchRequests(requests)
      }
    }).catch(() => {
      if (active) {
        setPrivateMatchRequests([])
      }
    })
    return () => {
      active = false
    }
  }, [canLoadPrivateMatchRequests, privateMatchActions, readOnly])

  useEffect(() => {
    if (!canLoadPrivateMatchRequests || !privateMatchActions || readOnly) {
      return undefined
    }
    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }
      void refreshPrivateMatchRequests()
    }
    const intervalId = window.setInterval(refreshIfVisible, PRIVATE_MATCH_REFRESH_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfVisible()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    canLoadPrivateMatchRequests,
    privateMatchActions,
    readOnly,
    refreshPrivateMatchRequests,
  ])

  const upsertPrivateMatchRequest = (request: PrivateMatchRequestResult) => {
    setPrivateMatchRequests((current) => [
      request,
      ...current.filter((entry) => entry.requestId !== request.requestId),
    ])
  }

  const cancelPrivateMatchRequest = async (request: PrivateMatchRequestResult) => {
    if (!privateMatchActions) {
      return
    }
    setPrivateMatchBusy(true)
    try {
      const cancelled = await privateMatchActions.cancelPrivateMatchRequest(request.requestId)
      upsertPrivateMatchRequest(cancelled)
      await refreshPrivateMatchRequests()
      setPrivateMatchMessage('Private match request cancelled.')
    } catch (error) {
      setPrivateMatchMessage(getPostgameErrorMessage(error, 'Unable to cancel private match request.'))
    } finally {
      setPrivateMatchBusy(false)
    }
  }

  const declinePrivateMatchRequest = async (request: PrivateMatchRequestResult) => {
    if (!privateMatchActions) {
      return
    }
    setPrivateMatchBusy(true)
    try {
      const declined = await privateMatchActions.declinePrivateMatchRequest(request.requestId)
      upsertPrivateMatchRequest(declined)
      await refreshPrivateMatchRequests()
      setPrivateMatchMessage('Private match request declined.')
    } catch (error) {
      setPrivateMatchMessage(getPostgameErrorMessage(error, 'Unable to decline private match request.'))
    } finally {
      setPrivateMatchBusy(false)
    }
  }

  const acceptPrivateMatchRequest = async (request: PrivateMatchRequestResult) => {
    if (!privateMatchActions) {
      return
    }
    setPrivateMatchBusy(true)
    try {
      const wordList = await prepareBundledWordList('practice', request.wordLength)
      if (!wordList.ok) {
        setPrivateMatchMessage(wordList.message)
        return
      }
      const projection = createPrivateMatchGameProjection(request, {
        defaultDifficulty,
        defaultGoPuzzleCount,
      })
      if (!projection) {
        setPrivateMatchMessage('Unable to create a safe private Practice game from this request.')
        return
      }
      const accepted = await privateMatchActions.acceptPrivateMatchRequest({
        game: projection,
        idempotencyKey: getPrivateMatchAcceptIdempotencyKey(request, projection.id),
        requestId: request.requestId,
      })
      upsertPrivateMatchRequest(accepted)
      const snapshot = await privateMatchActions.load()
      onChange(snapshot.state)
      const createdGameId = accepted.createdGameId ?? projection.id
      selectGame(createdGameId)
      setPrivateMatchMessage(accepted.idempotent ? 'Opening existing private match.' : 'Private match created.')
      onGameplayAutoCenterRequest?.()
      await refreshPrivateMatchRequests()
    } catch (error) {
      setPrivateMatchMessage(getPostgameErrorMessage(error, 'Unable to accept private match request.'))
    } finally {
      setPrivateMatchBusy(false)
    }
  }

  useEffect(() => {
    if (!canLoadPrivateMatchRequests || !privateMatchActions || readOnly || privateMatchBusy) {
      return undefined
    }
    const createdGameId = privateMatchRequests
      .filter((request) => (
        request.requestStatus === 'created'
        && request.createdGameId
        && !request.expired
        && request.createdGameId !== effectiveSelectedGameId
        && !openedPrivateMatchGameIdsRef.current.has(request.createdGameId)
      ))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map((request) => request.createdGameId)
      .find((gameId): gameId is string => Boolean(gameId))
    if (!createdGameId) {
      return undefined
    }
    let active = true
    const timeoutId = window.setTimeout(() => {
      void privateMatchActions.load()
        .then((snapshot) => {
          if (!active) {
            return
          }
          const nextVisibleGames = normalizeMultiplayerState(snapshot.state).games.filter((game) => game.scope === 'practice')
          const nextGameId = getPrivateMatchCreatedGameAutoRouteId({
            requests: privateMatchRequests,
            selectedGameId: effectiveSelectedGameId,
            viewerUserId,
            visibleGames: nextVisibleGames,
          })
          if (!nextGameId || openedPrivateMatchGameIdsRef.current.has(nextGameId)) {
            return
          }
          openedPrivateMatchGameIdsRef.current.add(nextGameId)
          onChange(snapshot.state)
          selectGame(nextGameId)
          setPrivateMatchMessage('Private match ready. Opening it now.')
          onGameplayAutoCenterRequest?.()
          void refreshPrivateMatchRequests()
        })
        .catch(() => {
          if (active) {
            setPrivateMatchMessage('Private match is ready, but it could not be opened automatically. Refresh Practice Multiplayer to try again.')
          }
        })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [
    canLoadPrivateMatchRequests,
    effectiveSelectedGameId,
    onChange,
    onGameplayAutoCenterRequest,
    privateMatchActions,
    privateMatchBusy,
    privateMatchRequests,
    readOnly,
    refreshPrivateMatchRequests,
    selectGame,
    viewerUserId,
  ])

  const createGame = () => {
    if (existingDailyClaim) {
      selectGame(existingDailyClaim.id)
      setLocalMessage({
        gameId: existingDailyClaim.id,
        text: 'You already have today\'s Daily Multiplayer game for this mode. Re-entering it here.',
        updatedAt: existingDailyClaim.updatedAt,
      })
      onGameplayAutoCenterRequest?.()
      return
    }
    if (!canCreate) {
      return
    }
    const ranked = matchKind === 'ranked' && authStatus === 'authenticated' && Boolean(viewerUserId)
    const ratingBucket = ranked
      ? scope === 'daily' ? getRankedDailyRatingBucket(mode) : getRatingBucket(mode)
      : undefined
    if (ranked) {
      void enterRankedQueue()
      return
    }
    if (matchKind === 'custom' && !CUSTOM_CODE_CREATION_ENABLED) {
      setMatchKind('unranked')
      setLocalMessage({
        gameId: selectedGame?.id,
        text: CUSTOM_CODE_HIDDEN_MESSAGE,
        updatedAt: selectedGame?.updatedAt,
      })
      return
    }
    let customGameCode: string | undefined
    if (matchKind === 'custom' && CUSTOM_CODE_CREATION_ENABLED) {
      const lobby = createCustomGameLobby({
        createdByUserId: viewerUserId,
        mode,
        scope,
        wordLength: scope === 'practice' ? wordLength : undefined,
      })
      customGameCode = lobby.code
      onCompetitiveChange?.(upsertCustomGameLobby(competitive, lobby))
    }
    const game = createMultiplayerGame({
      customGameCode,
      dailyDateKey,
      difficulty: defaultDifficulty,
      goPuzzleCount: defaultGoPuzzleCount,
      hardMode: scope === 'practice' || ranked ? hardMode : undefined,
      mode,
      playerProfiles: viewerProfile ? { 'player-one': viewerProfile } : undefined,
      playerUserIds: viewerUserId ? { 'player-one': viewerUserId } : undefined,
      ranked,
      ratingBucket,
      scope,
      timeLimitMs,
      wordLength,
    })
    const next = addMultiplayerGame(normalized, game)
    if (!next.games.some((entry) => entry.id === game.id)) {
      setLocalMessage({
        gameId: selectedGame?.id,
        text: dailyClaimedForMode
          ? 'You already claimed today\'s Daily Multiplayer game for this mode.'
          : 'You already have five active multiplayer games.',
        updatedAt: selectedGame?.updatedAt,
      })
      return
    }
    selectGame(game.id)
    setLocalMessage(undefined)
    onChange(next)
    onGameplayAutoCenterRequest?.()
  }

  const joinGame = () => {
    if (!selectedGame || !viewerUserId || readOnly) {
      return
    }
    const result = joinMultiplayerGame(normalized, {
      gameId: selectedGame.id,
      playerProfile: viewerProfile,
      userId: viewerUserId,
    })
    if (result.error) {
      setLocalMessage({
        gameId: selectedGame.id,
        text: result.error,
        updatedAt: selectedGame.updatedAt,
      })
      return
    }
    setLocalMessage(undefined)
    onChange(result.state)
    onGameplayAutoCenterRequest?.()
  }

  const cancelGame = () => {
    if (!selectedGame || !viewerUserId || readOnly) {
      return
    }
    const result = cancelMultiplayerGame(normalized, {
      gameId: selectedGame.id,
      userId: viewerUserId,
    })
    if (result.error) {
      setLocalMessage({
        gameId: selectedGame.id,
        text: result.error,
        updatedAt: selectedGame.updatedAt,
      })
      return
    }
    setLocalMessage(undefined)
    onChange(result.state)
  }

  const submitTurn = (guess: string) => {
    if (!selectedGame || readOnly || !viewerPlayerId) {
      return
    }
    const result = submitMultiplayerGuess(normalized, {
      gameId: selectedGame.id,
      guess,
      playerId: viewerPlayerId,
    })
    if (result.error) {
      setLocalMessage({
        gameId: selectedGame.id,
        text: result.error,
        updatedAt: selectedGame.updatedAt,
      })
      return
    }
    setLocalMessage(undefined)
    onChange(result.state)
  }

  const forfeitGame = async () => {
    if (!selectedGame || readOnly || !viewerPlayerId) {
      return
    }
    const result = forfeitMultiplayerGame(normalized, {
      gameId: selectedGame.id,
      playerId: viewerPlayerId,
    })
    if (result.error) {
      setLocalMessage({
        gameId: selectedGame.id,
        text: result.error,
        updatedAt: selectedGame.updatedAt,
      })
      return
    }
    setLocalMessage(undefined)
    setPersistenceMessage(undefined)
    const persistence = await onChange(result.state)
    if (persistence?.error) {
      setPersistenceMessage(persistence.error)
    }
  }
  const selectedPostgameActions = selectedGame ? getPracticePostgameActions(selectedGame, viewerUserId) : undefined
  const selectedGameIdForRematches = selectedGame?.id
  const canLoadSelectedRematchRequests = Boolean(
    selectedGame
      && selectedPostgameActions?.settings
      && selectedPostgameActions.continuationKind === 'unranked-play-again',
  )
  useEffect(() => {
    let active = true
    void loadPracticeRematchRequestsForGame(
      postgameActions,
      selectedGameIdForRematches,
      canLoadSelectedRematchRequests,
      readOnly,
    ).then((requests) => {
      if (active) {
        setPracticeRematchRequests(requests)
      }
    }).catch(() => {
      if (active) {
        setPracticeRematchRequests([])
      }
    })
    return () => {
      active = false
    }
  }, [
    canLoadSelectedRematchRequests,
    postgameActions,
    readOnly,
    selectedGameIdForRematches,
    selectedGame?.status,
    selectedGame?.updatedAt,
  ])
  useEffect(() => {
    if (!selectedGameIdForRematches || !canLoadSelectedRematchRequests || !postgameActions || readOnly) {
      return undefined
    }
    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }
      void loadPracticeRematchRequestsForGame(
        postgameActions,
        selectedGameIdForRematches,
        canLoadSelectedRematchRequests,
        readOnly,
      ).then((requests) => {
        setPracticeRematchRequests(requests)
      }).catch(() => {
        setPracticeRematchRequests([])
      })
    }
    const intervalId = window.setInterval(refreshIfVisible, PRACTICE_REMATCH_REFRESH_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfVisible()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    canLoadSelectedRematchRequests,
    postgameActions,
    readOnly,
    selectedGameIdForRematches,
  ])

  const upsertPracticeRematchRequest = (request: PracticeRematchRequestResult) => {
    setPracticeRematchRequests((current) => [
      request,
      ...current.filter((entry) => entry.requestId !== request.requestId),
    ])
  }

  useEffect(() => {
    if (!selectedGame || !viewerPlayerId || readOnly) {
      return
    }
    const createdRequest = practiceRematchRequests.find((request) => (
      request.sourceGameId === selectedGame.id
      && request.requestStatus === 'created'
      && request.createdGameId
    ))
    if (!createdRequest?.createdGameId || createdRequest.createdGameId === effectiveSelectedGameId) {
      return
    }
    const createdGame = visibleGames.find((game) => game.id === createdRequest.createdGameId)
    if (!createdGame) {
      return
    }
    const createdGameId = createdGame.id
    const message = createdRequest.idempotent ? 'Opening existing rematch game.' : 'Rematch game created.'
    const timeoutId = window.setTimeout(() => {
      selectGame(createdGameId)
      setPostgameMessage({ gameId: createdGameId, text: message })
      onGameplayAutoCenterRequest?.()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [
    effectiveSelectedGameId,
    practiceRematchRequests,
    readOnly,
    onGameplayAutoCenterRequest,
    selectGame,
    selectedGame,
    viewerPlayerId,
    visibleGames,
  ])

  const refreshPracticeRematchRequestsAfterAction = async () => {
    try {
      setPracticeRematchRequests(await loadPracticeRematchRequestsForGame(
        postgameActions,
        selectedGameIdForRematches,
        canLoadSelectedRematchRequests,
        readOnly,
      ))
    } catch {
      // Keep the immediate action result visible if a follow-up list refresh fails.
    }
  }

  const applyPostgameSettingsToControls = (settings: PracticePostgameSettings, nextMatchKind: MultiplayerMatchKind) => {
    setMode(settings.mode)
    setMatchKind(nextMatchKind)
    setHardMode(settings.hardMode)
    setTimeLimitMs(settings.timeLimitMs ?? null)
    setWordLength(settings.wordLength)
  }

  const requestPracticeRematch = async () => {
    if (!selectedGame || !postgameActions || !viewerUserId || !selectedPostgameActions?.canRequestRematch) {
      return
    }
    setPostgameBusy(true)
    try {
      const request = await postgameActions.requestPracticeRematch({
        idempotencyKey: `phase31-rematch:request:${selectedGame.id}:${viewerUserId}`,
        sourceGameId: selectedGame.id,
      })
      upsertPracticeRematchRequest(request)
      await refreshPracticeRematchRequestsAfterAction()
      setPostgameMessage({ gameId: selectedGame.id, text: 'Rematch request sent.' })
    } catch (error) {
      setPostgameMessage({
        gameId: selectedGame.id,
        text: getPostgameErrorMessage(error, 'Unable to request rematch.'),
      })
    } finally {
      setPostgameBusy(false)
    }
  }

  const cancelPracticeRematch = async (request: PracticeRematchRequestResult) => {
    if (!selectedGame || !postgameActions) {
      return
    }
    setPostgameBusy(true)
    try {
      const cancelled = await postgameActions.cancelPracticeRematch(request.requestId)
      upsertPracticeRematchRequest(cancelled)
      await refreshPracticeRematchRequestsAfterAction()
      setPostgameMessage({ gameId: selectedGame.id, text: 'Rematch request cancelled.' })
    } catch (error) {
      setPostgameMessage({
        gameId: selectedGame.id,
        text: getPostgameErrorMessage(error, 'Unable to cancel rematch request.'),
      })
    } finally {
      setPostgameBusy(false)
    }
  }

  const declinePracticeRematch = async (request: PracticeRematchRequestResult) => {
    if (!selectedGame || !postgameActions) {
      return
    }
    setPostgameBusy(true)
    try {
      const declined = await postgameActions.declinePracticeRematch(request.requestId)
      upsertPracticeRematchRequest(declined)
      await refreshPracticeRematchRequestsAfterAction()
      setPostgameMessage({ gameId: selectedGame.id, text: 'Rematch request declined.' })
    } catch (error) {
      setPostgameMessage({
        gameId: selectedGame.id,
        text: getPostgameErrorMessage(error, 'Unable to decline rematch request.'),
      })
    } finally {
      setPostgameBusy(false)
    }
  }

  const acceptPracticeRematch = async (request: PracticeRematchRequestResult) => {
    if (!selectedGame || !postgameActions) {
      return
    }
    const projection = createPracticeRematchGameProjection(selectedGame)
    if (!projection) {
      setPostgameMessage({ gameId: selectedGame.id, text: 'Unable to create a safe rematch game from this result.' })
      return
    }
    setPostgameBusy(true)
    try {
      const accepted = await postgameActions.acceptPracticeRematch({
        game: projection,
        idempotencyKey: `phase31-rematch:accept:${request.requestId}:${projection.id}`,
        requestId: request.requestId,
      })
      const rematchGame = accepted.createdGameId && accepted.createdGameId !== projection.id
        ? { ...projection, id: accepted.createdGameId }
        : projection
      const next = addMultiplayerGame(normalized, rematchGame)
      if (!next.games.some((entry) => entry.id === rematchGame.id)) {
        setPostgameMessage({ gameId: selectedGame.id, text: 'You already have five active multiplayer games.' })
        return
      }
      upsertPracticeRematchRequest(accepted)
      await refreshPracticeRematchRequestsAfterAction()
      onChange(next)
      selectGame(rematchGame.id)
      setPostgameMessage({ gameId: rematchGame.id, text: accepted.idempotent ? 'Opening existing rematch game.' : 'Rematch game created.' })
      onGameplayAutoCenterRequest?.()
    } catch (error) {
      setPostgameMessage({
        gameId: selectedGame.id,
        text: getPostgameErrorMessage(error, 'Unable to accept rematch request.'),
      })
    } finally {
      setPostgameBusy(false)
    }
  }

  const playAgainWithSameSettings = () => {
    if (!selectedGame || !viewerUserId || !selectedPostgameActions?.settings) {
      return
    }
    const settings = selectedPostgameActions.settings
    if (selectedPostgameActions.continuationKind === 'custom-play-again') {
      applyPostgameSettingsToControls(settings, CUSTOM_CODE_CREATION_ENABLED ? 'custom' : 'unranked')
      setPostgameMessage({
        gameId: selectedGame.id,
        text: CUSTOM_CODE_CREATION_ENABLED
          ? 'Same custom settings loaded. Open a new custom-code lobby when ready.'
          : LEGACY_CUSTOM_CODE_SETUP_MESSAGE,
      })
      return
    }
    const nextGame = createMultiplayerGame({
      difficulty: defaultDifficulty,
      goPuzzleCount: settings.mode === 'go' ? settings.goPuzzleCount ?? defaultGoPuzzleCount : undefined,
      hardMode: settings.hardMode,
      mode: settings.mode,
      playerProfiles: viewerProfile ? { 'player-one': viewerProfile } : undefined,
      playerUserIds: { 'player-one': viewerUserId },
      ranked: false,
      scope: 'practice',
      timeLimitMs: settings.timeLimitMs ?? null,
      wordLength: settings.wordLength,
    })
    const next = addMultiplayerGame(normalized, nextGame)
    if (!next.games.some((entry) => entry.id === nextGame.id)) {
      setPostgameMessage({ gameId: selectedGame.id, text: 'You already have five active multiplayer games.' })
      return
    }
    applyPostgameSettingsToControls(settings, 'unranked')
    onChange(next)
    selectGame(nextGame.id)
    setPostgameMessage({ gameId: nextGame.id, text: 'New same-settings Practice match opened.' })
    onGameplayAutoCenterRequest?.()
  }

  const searchRankedAgain = () => {
    if (!selectedPostgameActions?.settings || !selectedPostgameActions.canSearchAgain) {
      return
    }
    const settings = selectedPostgameActions.settings
    applyPostgameSettingsToControls(settings, 'ranked')
    setPostgameMessage(undefined)
    void enterRankedQueue({
      hardMode: settings.hardMode,
      mode: settings.mode,
      timeLimitMs: settings.timeLimitMs,
      wordLength: settings.wordLength,
    })
  }

  return (
    <Panel className="min-w-0 space-y-4 text-sm leading-6 text-slate-300" data-testid={`multiplayer-panel-${scope}`} tone="muted">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-xl font-bold text-white">{scope === 'daily' ? 'Daily Multiplayer' : 'Practice Multiplayer'}</h3>
          <p className="break-words">
            Turn-based matches sync between signed-in players. You can keep up to {MAX_MULTIPLAYER_GAMES} active games at once.
            {scope === 'daily' ? ' Daily Multiplayer uses midnight UTC and past games are view-only.' : ' Practice games can use an optional chess-clock time limit.'}
          </p>
          {!onlineReady && !readOnly ? (
            <p className="mt-1 text-xs text-amber-100">Sign in to create, join, or submit real online multiplayer turns.</p>
          ) : null}
        </div>
        <p className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-bold uppercase tracking-wide text-cyan-100">
          {activeCount}/{MAX_MULTIPLAYER_GAMES} active
        </p>
      </div>

      {!readOnly ? (
        <div className="space-y-3 rounded-lg border border-white/10 bg-black/30 p-3">
          <div className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)]">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-5">
            <label className="grid min-w-0 gap-1 font-semibold text-cyan-100">
              Mode
              <select
                className="min-w-0 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                onChange={(event) => setMode(event.target.value as GameMode)}
                value={mode}
              >
                <option value="og">OG</option>
                <option value="go">GO</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1 font-semibold text-cyan-100">
              Match type
              <select
                className="min-w-0 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                onChange={(event) => {
                  const nextMatchKind = event.target.value as MultiplayerMatchKind
                  setMatchKind(nextMatchKind)
                  if (nextMatchKind === 'ranked' && normalizeRankedPracticeTimeLimitMs(timeLimitMs) === undefined) {
                    setTimeLimitMs(null)
                  }
                }}
                value={matchKind}
              >
                <option value="unranked">Unranked</option>
                <option disabled={authStatus !== 'authenticated'} value="ranked">Ranked</option>
                {CUSTOM_CODE_CREATION_ENABLED ? <option value="custom">Custom code</option> : null}
              </select>
            </label>
            {scope === 'practice' ? (
              <>
                <label className="grid min-w-0 gap-1 font-semibold text-cyan-100">
                  Length
                  <input
                    className="min-w-0 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                    max={35}
                    min={2}
                    onChange={(event) => setWordLength(Number(event.target.value))}
                    type="number"
                    value={wordLength}
                  />
                </label>
                <label className="grid min-w-0 gap-1 font-semibold text-cyan-100">
                  {matchKind === 'ranked' ? 'Ranked time control' : 'Time per side'}
                  <select
                    className="min-w-0 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
                    onChange={(event) => setTimeLimitMs(event.target.value ? Number(event.target.value) as PracticeMultiplayerTimeLimitMs : null)}
                    value={selectedTimeLimitValue}
                  >
                    {timeLimitOptions.map((option) => (
                      <option key={option.label} value={option.value ?? ''}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 font-semibold text-cyan-100">
                  <span>Hard Mode</span>
                  <span className="flex items-center gap-2 text-sm text-slate-200">
                    <input
                      checked={hardMode}
                      className="h-4 w-4 rounded border-slate-500 bg-slate-950 text-cyan-300"
                      onChange={(event) => setHardMode(event.target.checked)}
                      type="checkbox"
                    />
                    {hardMode ? 'On' : 'Off'}
                  </span>
                </label>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <p className="font-semibold text-cyan-100">UTC day</p>
                  <p className="break-words">{dailyDateKey}</p>
                </div>
                {matchKind === 'ranked' ? (
                  <label className="grid min-w-0 gap-2 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 font-semibold text-cyan-100">
                    <span>Hard Mode</span>
                    <span className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        checked={hardMode}
                        className="h-4 w-4 rounded border-slate-500 bg-slate-950 text-cyan-300"
                        onChange={(event) => setHardMode(event.target.checked)}
                        type="checkbox"
                      />
                      {hardMode ? 'On' : 'Off'}
                    </span>
                  </label>
                ) : null}
              </>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-cyan-100">Difficulty</p>
              <p className="capitalize">{defaultDifficulty}</p>
            </div>
          </div>
          <Button className="min-h-14 w-full px-4" disabled={!canCreate} onClick={createGame} variant="primary">
            {canCreate
              ? matchKind === 'ranked'
                ? scope === 'daily'
                  ? 'Enter ranked Daily queue'
                  : rankedTimeLimitMs === TIMED_RANKED_PRACTICE_TIME_LIMIT_MS ? 'Enter timed ranked queue' : 'Enter ranked queue'
                : 'Open multiplayer match'
              : rankedQueueBusy
                ? 'Ranked queue working'
                : matchKind === 'ranked' && rankedQueue.status === 'queued'
                  ? 'Already queued'
                  : rankedQueueUnavailableReason
                    ? rankedQueueUnavailableReason
                    : formPreparation.error
                      ? 'Word data unavailable'
                    : !formPreparation.isReady
                      ? 'Preparing word data'
                    : dailyClaimedForMode
                      ? 'Daily multiplayer already claimed'
                      : onlineReady ? 'Active limit reached' : 'Sign in required'}
          </Button>
          </div>
          {scope === 'practice' ? (
            <details className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">
              <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]">
                <p className="font-bold uppercase tracking-wide">Ranked Practice v1</p>
                <span className="rounded border border-white/10 bg-black/20 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-cyan-100">Details</span>
              </summary>
              {onOpenEloAbout ? (
                <Button className="mt-2" onClick={onOpenEloAbout} size="sm" variant="ghost">How is Elo calculated?</Button>
              ) : null}
              <p className="mt-1">
                Ranked is signed-in Practice only. Choose no clock for the current ranked track or 5 minutes for the separate timed ranked track. The queue matches mode, word length, Hard Mode, rating bucket, and ranked time control, then pairs the oldest compatible queued rival first.
              </p>
              <p className="mt-1">
                Points decide the match result first. Elo changes afterward only after trusted settlement confirms server-authorized ranked evidence. Ranked Daily uses separate OG and GO rating buckets with fixed five-letter, no-clock settings. Ranked custom-code games remain deferred.
              </p>
            </details>
          ) : (
            <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50">
              <p className="font-bold uppercase tracking-wide">Ranked Daily v1</p>
              <p className="mt-1">
                Daily Multiplayer stays asynchronous, five-letter, UTC-day keyed, and clock-free. Separate ranked and unranked answer and claim lanes let each signed-in player complete OG and GO once in each lane per UTC day.
              </p>
              <p className="mt-1">
                Ranked matchmaking separates OG/GO and Hard Mode settings, then pairs the oldest compatible queued rival first. Hard Mode shares the same Daily rating bucket.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {matchKind === 'ranked' && authStatus !== 'authenticated' && !readOnly ? (
        <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-semibold text-amber-50">
          Sign in to enter ranked multiplayer queues. Guest and local-preview games remain unranked.
        </p>
      ) : null}

      {matchKind === 'ranked' && authStatus === 'authenticated' && !readOnly && rankedQueue.message ? (
        <div
          className={classNames(
            'rounded-lg border p-3 text-sm font-semibold',
            rankedQueue.status === 'error'
              ? 'border-rose-300/30 bg-rose-400/10 text-rose-50'
              : rankedQueue.status === 'cancelled'
                ? 'border-slate-400/30 bg-slate-400/10 text-slate-100'
                : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-50',
          )}
          data-testid="ranked-queue-status"
        >
          <p>{rankedQueue.message}</p>
          {rankedQueue.status === 'queued' && rankedQueue.requestId ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={rankedQueueBusy} onClick={() => { void refreshRankedQueue('manual') }} size="sm" variant="primary">
                Check ranked queue
              </Button>
              <Button disabled={rankedQueueBusy} onClick={() => { void cancelRankedQueue() }} size="sm" variant="secondary">
                Cancel ranked queue
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {scope === 'practice' && authStatus === 'authenticated' && privateMatchActions && !readOnly ? (
        <PrivateMatchRequestsPanel
          busy={privateMatchBusy}
          message={privateMatchMessage}
          onAccept={(request) => { void acceptPrivateMatchRequest(request) }}
          onCancel={(request) => { void cancelPrivateMatchRequest(request) }}
          onDecline={(request) => { void declinePrivateMatchRequest(request) }}
          onEnter={(gameId) => { selectGame(gameId); onGameplayAutoCenterRequest?.() }}
          requests={privateMatchRequests}
        />
      ) : null}

      {visibleGames.length > 0 ? (
        <div className="min-w-0 space-y-3">
          {activeVisibleGames.length > 0 ? (
            <div className="min-w-0 space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Current matches</p>
              <div className="flex min-w-0 flex-wrap gap-2">
                {activeVisibleGames.map((game) => (
                  <Button
                    data-game-id={game.id}
                    data-testid={`multiplayer-game-tab-${game.id}`}
                    key={game.id}
                    onClick={() => { selectGame(game.id); setLocalMessage(undefined); onGameplayAutoCenterRequest?.() }}
                    variant={game.id === selectedGame?.id ? 'primary' : 'secondary'}
                  >
                    {game.ranked ? 'Ranked' : 'Unranked'} {game.mode.toUpperCase()} · {game.status}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {terminalVisibleGames.length > 0 ? (
            <details className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
              <summary className="cursor-pointer list-none font-semibold text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]">
                Completed and inactive matches ({terminalVisibleGames.length})
              </summary>
              <p className="mt-2 text-xs text-slate-400">Use History for completed-game review. Select one here only to reopen its local result details.</p>
              <div className="mt-3 flex min-w-0 flex-wrap gap-2">
                {terminalVisibleGames.map((game) => (
                  <Button
                    data-game-id={game.id}
                    data-testid={`multiplayer-game-tab-${game.id}`}
                    key={game.id}
                    onClick={() => { selectGame(game.id); setLocalMessage(undefined); onGameplayAutoCenterRequest?.() }}
                    variant={game.id === selectedGame?.id ? 'primary' : 'secondary'}
                  >
                    {game.ranked ? 'Ranked' : 'Unranked'} {game.mode.toUpperCase()} · {game.status}
                  </Button>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="rounded-lg border border-white/10 bg-black/30 p-3">
          {readOnly ? 'No Daily Multiplayer games were recorded for this day.' : 'No multiplayer games yet.'}
        </p>
      )}

      {selectedGame ? (
        <div
          className="min-w-0 space-y-4 rounded-lg border border-white/10 bg-black/30 p-4"
          data-current-turn={selectedGame.currentTurn}
          data-game-id={selectedGame.id}
          data-mode={selectedGame.mode}
          data-scope={selectedGame.scope}
          data-status={selectedGame.status}
          data-testid="multiplayer-selected-game"
        >
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <div className="min-w-0">
              <p className="break-words font-semibold text-cyan-100">{getGameTitle(selectedGame)}</p>
              <p className="break-words capitalize">Status: {selectedGame.status} · {getGameMatchLabel(selectedGame)}</p>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-cyan-100">Turn</p>
              <p className="break-words">{getSelectedPlayerLabel(selectedGame.currentTurn)}</p>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-cyan-100">Deadline</p>
              <p className="break-words">{selectedGame.scope === 'daily' && selectedGame.deadlineAt ? formatUtcDateTime(selectedGame.deadlineAt) : selectedGame.timeLimitMs ? `${formatClock(selectedGame.timeLimitMs)} per side` : 'No time limit'}</p>
            </div>
            {selectedGame.scope === 'practice' ? (
              <div className="min-w-0">
                <p className="font-semibold text-cyan-100">Hard Mode</p>
                <p>{selectedGame.hardMode ? 'On' : 'Off'}</p>
              </div>
            ) : null}
          </div>

          <ClockSummary game={selectedGame} getPlayerLabel={getSelectedPlayerLabel} now={clockNow} />

          {!readOnly && selectedGame.status === 'waiting' ? (
            <div className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-4">
              <p className="font-semibold text-cyan-50">
                {canJoinSelectedGame ? 'Waiting multiplayer match available' : 'Waiting for another signed-in player'}
              </p>
              <p className="mt-1 text-sm text-cyan-100">
                {canJoinSelectedGame
                  ? 'Join this match to claim the rival seat. After that, each player can submit only on their own turn.'
                  : 'This match will start once a second signed-in player joins from another browser or device.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canJoinSelectedGame ? <Button disabled={joiningWouldClaimDuplicateDaily} onClick={joinGame} variant="primary">{joiningWouldClaimDuplicateDaily ? 'Daily multiplayer already claimed' : 'Join multiplayer match'}</Button> : null}
                {canCancelSelectedGame ? <Button onClick={cancelGame} variant="secondary">Cancel Lobby</Button> : null}
              </div>
            </div>
          ) : null}

          {rivalPlayer ? (
            <RivalIdentityCard label={getSelectedPlayerLabel(rivalPlayer.id)} profile={selectedPlayerProfiles?.[rivalPlayer.id]} />
          ) : canJoinSelectedGame && waitingHostPlayer ? (
            <RivalIdentityCard label={getSelectedPlayerLabel(waitingHostPlayer.id, 'Host')} profile={selectedPlayerProfiles?.['player-one']} title="Lobby host" />
          ) : selectedGame.status === 'waiting' ? (
            <RivalIdentityCard label="Waiting for a signed-in rival" title="Rival" />
          ) : null}

          {!readOnly && viewerPlayerId && (selectedGame.status === 'playing' || showTerminalSolvedSurface) ? (
            <MultiplayerGameSurface
              disabled={showTerminalSolvedSurface || !canSubmitSelectedGame}
              game={selectedGame}
              onSubmitGuess={submitTurn}
              playerId={viewerPlayerId}
              statusLabel={showTerminalSolvedSurface ? 'Advancing to final results' : canSubmitSelectedGame ? 'Your turn' : 'Waiting for the other player'}
            />
          ) : null}

          {selectedGame.status === 'cancelled' ? (
            <p className="rounded-lg border border-slate-500/30 bg-slate-900/70 p-3 text-sm text-slate-300">
              This multiplayer lobby was cancelled before a rival joined. It no longer counts against the active-game limit.
            </p>
          ) : null}

          {!readOnly && viewerPlayerId && selectedGame.status === 'playing' ? (
            <div className="rounded-lg border border-rose-300/30 bg-rose-400/10 p-3 text-sm leading-6 text-rose-50">
              <p className="font-bold">Forfeit match</p>
              <p>
                {selectedGame.ranked
                  ? 'Forfeiting ends this ranked game and can settle as a ranked loss once trusted settlement confirms both participants.'
                  : 'Forfeiting ends this multiplayer game. Unranked and custom games do not move Elo.'}
              </p>
              <Button className="mt-2" onClick={forfeitGame} variant="secondary">Forfeit</Button>
            </div>
          ) : null}

          {persistenceMessage ? (
            <p className="rounded-lg border border-rose-300/30 bg-rose-400/10 p-3 font-semibold text-rose-50" role="alert">
              {persistenceMessage}
            </p>
          ) : null}

          {displayStatusMessage ? (
            <p className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 p-3 font-semibold text-cyan-50" data-testid="multiplayer-status-message">
              {displayStatusMessage}
            </p>
          ) : null}

          {selectedPerformance ? (
            <div className="min-w-0 space-y-2 rounded-lg border border-violet-300/30 bg-violet-300/10 p-3">
              <p className="break-words font-semibold text-violet-50">{selectedPerformance.summary}</p>
              <div className="grid min-w-0 gap-2 2xl:grid-cols-2">
                {selectedPerformance.players.map((player) => (
                  <p className="min-w-0 break-words rounded-md border border-white/10 bg-black/30 p-2" key={player.playerId}>
                    {getSelectedPlayerLabel(player.playerId)}: {player.summary}
                  </p>
                ))}
              </div>
              {selectedGame.ranked ? (
                <p className="text-xs text-violet-100">Points decide this result. Elo updates only after trusted settlement confirms authenticated server-authorized ranked evidence; local preview, spectator, custom, unranked Daily, and unsupported timed Practice rows stay unrated.</p>
              ) : null}
            </div>
          ) : null}

          {!readOnly && selectedPostgameActions && !showTerminalSolvedSurface ? (
            <PracticePostgameActionsPanel
              actions={selectedPostgameActions}
              busy={postgameBusy || rankedQueueBusy}
              gameId={selectedGame.id}
              isOnlineReady={onlineReady}
              message={selectedPostgameMessage}
              onAcceptRematch={(request) => { void acceptPracticeRematch(request) }}
              onCancelRematch={(request) => { void cancelPracticeRematch(request) }}
              onDeclineRematch={(request) => { void declinePracticeRematch(request) }}
              onPlayAgain={playAgainWithSameSettings}
              onRequestRematch={() => { void requestPracticeRematch() }}
              onSearchAgain={searchRankedAgain}
              rematchActionsAvailable={Boolean(postgameActions)}
              rematchRequests={practiceRematchRequests}
            />
          ) : null}

          <div className="space-y-2">
            <p className="font-semibold text-cyan-100">Turn history</p>
            {selectedGame.moves.length > 0 ? (
              <div className="min-w-0 space-y-2">
                {selectedGame.moves.map((move) => (
                  <div className="min-w-0 rounded-lg border border-white/10 bg-slate-950/70 p-3" key={move.id}>
                    <p className="break-words text-xs uppercase tracking-wide text-slate-400">
                      {getSelectedPlayerLabel(move.playerId)} · Puzzle {move.puzzleIndex + 1} · {formatUtcDateTime(move.createdAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {move.tiles.map((tile, index) => (
                        <span
                          className={classNames('flex h-8 w-8 items-center justify-center rounded border font-black uppercase', moveStateClass(tile.state))}
                          key={`${move.id}-${index}`}
                        >
                          {tile.letter}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No turns submitted yet.</p>
            )}
          </div>

          {(selectedGame.status !== 'cancelled' && !showTerminalSolvedSurface && (readOnly || selectedGame.status === 'won' || selectedGame.status === 'lost' || selectedGame.status === 'expired')) ? (
            <div className="space-y-3 rounded-lg border border-white/10 bg-slate-950/70 p-3">
              <p className="font-semibold text-cyan-100">Answer and definitions</p>
              {getMultiplayerAnswerWords(selectedGame).map((answer, index) => (
                <DefinitionPanel
                  enabled
                  key={`${selectedGame.id}-${answer}-${index}`}
                  mode={selectedGame.mode}
                  scope={selectedGame.scope}
                  word={answer}
                  wordLength={answer.length}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  )
}
