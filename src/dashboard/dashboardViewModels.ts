import type { ResumeSlotCollection, GameHistoryEntry } from '../account'
import type { AppRouteId } from '../app/routes'
import type { HistoryFilters, MultiplayerSubtabId, SoloSubtabId } from '../app/navigationState'
import type { MultiplayerCompetitiveState } from '../multiplayer/competitiveMultiplayer'
import type { AuthenticatedLiveSpectatorGame } from '../multiplayer/multiplayerRepository'
import type {
  MultiplayerActiveGameViewModel,
  MultiplayerLiveGameViewModel,
  MultiplayerLobbyRowViewModel,
  MultiplayerRecentResultViewModel,
} from '../multiplayer/multiplayerViewModels'
import {
  selectActiveMultiplayerGameRows,
  selectLiveMultiplayerRows,
  selectMultiplayerLobbyRows,
  selectRecentMultiplayerResults,
  selectRestrictedLiveMultiplayerCount,
} from '../multiplayer/multiplayerViewModels'
import type { MultiplayerState } from '../multiplayer/multiplayer'
import type { SoloActiveGameKey, SoloActiveGameViewModel, SoloRecentResultViewModel } from '../solo/soloViewModels'
import { selectActiveSoloGames, selectRecentSoloResults } from '../solo/soloViewModels'

export interface DashboardSoloActionTarget {
  readonly routeId: 'solo'
  readonly soloSubtab: SoloSubtabId
  readonly selectedSoloGameKey?: SoloActiveGameKey
}

export interface DashboardMultiplayerActionTarget {
  readonly routeId: 'multiplayer'
  readonly multiplayerSubtab: MultiplayerSubtabId
  readonly resumeMultiplayerGameId?: string
  readonly selectedMultiplayerGameId?: string
}

export interface DashboardHistoryActionTarget {
  readonly routeId: 'history'
  readonly historyFilters?: HistoryFilters
}

export interface DashboardCalendarActionTarget {
  readonly routeId: 'calendar'
}

export interface DashboardRouteActionTarget {
  readonly routeId: Exclude<AppRouteId, 'solo' | 'multiplayer' | 'history' | 'calendar'>
}

export type DashboardActionTarget =
  | DashboardSoloActionTarget
  | DashboardMultiplayerActionTarget
  | DashboardHistoryActionTarget
  | DashboardCalendarActionTarget
  | DashboardRouteActionTarget

export interface DashboardDailyStatusInput {
  readonly ready: boolean
  readonly detailLabel: string
  readonly resetAt?: string
  readonly actionLabel?: string
}

export interface DashboardPreviewLimits {
  readonly activeSolo?: number
  readonly activeMultiplayer?: number
  readonly lobby?: number
  readonly live?: number
  readonly recentSolo?: number
  readonly recentMultiplayer?: number
}

export interface CreateDashboardViewModelInput {
  readonly competitiveMultiplayerState?: MultiplayerCompetitiveState
  readonly dailyDateKey?: string
  readonly dailyMultiplayer?: DashboardDailyStatusInput
  readonly dailySolo?: DashboardDailyStatusInput
  readonly generatedAt?: string
  readonly history?: readonly GameHistoryEntry[]
  readonly limits?: DashboardPreviewLimits
  readonly liveSpectatorRows?: readonly AuthenticatedLiveSpectatorGame[]
  readonly multiplayerState?: MultiplayerState
  readonly resumeSlots?: ResumeSlotCollection
  readonly viewerUserId?: string
}

export interface DashboardSoloActiveGameViewModel extends SoloActiveGameViewModel {
  readonly actionTarget: DashboardSoloActionTarget
}

export interface DashboardMultiplayerActiveGameViewModel extends MultiplayerActiveGameViewModel {
  readonly actionTarget: DashboardMultiplayerActionTarget
}

export interface DashboardLobbyRowViewModel extends MultiplayerLobbyRowViewModel {
  readonly actionTarget: DashboardMultiplayerActionTarget
}

export interface DashboardLiveGameViewModel extends MultiplayerLiveGameViewModel {
  readonly actionTarget: DashboardMultiplayerActionTarget
}

export interface DashboardSoloRecentResultViewModel extends SoloRecentResultViewModel {
  readonly actionTarget: DashboardHistoryActionTarget
}

export interface DashboardMultiplayerRecentResultViewModel extends MultiplayerRecentResultViewModel {
  readonly actionTarget: DashboardHistoryActionTarget
}

export interface DashboardDailyCardViewModel {
  readonly id: 'daily-solo' | 'daily-multiplayer'
  readonly title: string
  readonly ready: boolean
  readonly detailLabel: string
  readonly actionLabel: string
  readonly resetAt?: string
  readonly actionTarget: DashboardSoloActionTarget | DashboardMultiplayerActionTarget
}

export interface DashboardQuickActionViewModel {
  readonly id: string
  readonly label: string
  readonly detailLabel: string
  readonly attentionCount: number
  readonly actionTarget: DashboardActionTarget
}

export interface DashboardSummaryViewModel {
  readonly activeSoloCount: number
  readonly activeMultiplayerCount: number
  readonly yourTurnMultiplayerCount: number
  readonly openLobbyCount: number
  readonly liveGameCount: number
  readonly restrictedLiveGameCount: number
  readonly recentSoloResultCount: number
  readonly recentMultiplayerResultCount: number
}

export interface DashboardViewModel {
  readonly generatedAt: string
  readonly summary: DashboardSummaryViewModel
  readonly daily: readonly DashboardDailyCardViewModel[]
  readonly activeSolo: readonly DashboardSoloActiveGameViewModel[]
  readonly activeMultiplayer: readonly DashboardMultiplayerActiveGameViewModel[]
  readonly yourTurnMultiplayer: readonly DashboardMultiplayerActiveGameViewModel[]
  readonly lobbyPreview: readonly DashboardLobbyRowViewModel[]
  readonly livePreview: readonly DashboardLiveGameViewModel[]
  readonly recentSolo: readonly DashboardSoloRecentResultViewModel[]
  readonly recentMultiplayer: readonly DashboardMultiplayerRecentResultViewModel[]
  readonly quickActions: readonly DashboardQuickActionViewModel[]
}

const DEFAULT_PREVIEW_LIMITS: Required<DashboardPreviewLimits> = {
  activeMultiplayer: 3,
  activeSolo: 3,
  live: 3,
  lobby: 3,
  recentMultiplayer: 3,
  recentSolo: 3,
}

const SOLO_HISTORY_FILTERS: HistoryFilters = {
  mode: 'all',
  player: 'solo',
  scope: 'all',
}

const MULTIPLAYER_HISTORY_FILTERS: HistoryFilters = {
  mode: 'all',
  player: 'multiplayer',
  scope: 'all',
}

function clampLimit(value: number | undefined, fallback: number): number {
  return Math.max(0, value ?? fallback)
}

function takePreview<T>(rows: readonly T[], limit: number): readonly T[] {
  return rows.slice(0, limit)
}

function getLimits(limits: DashboardPreviewLimits | undefined): Required<DashboardPreviewLimits> {
  return {
    activeMultiplayer: clampLimit(limits?.activeMultiplayer, DEFAULT_PREVIEW_LIMITS.activeMultiplayer),
    activeSolo: clampLimit(limits?.activeSolo, DEFAULT_PREVIEW_LIMITS.activeSolo),
    live: clampLimit(limits?.live, DEFAULT_PREVIEW_LIMITS.live),
    lobby: clampLimit(limits?.lobby, DEFAULT_PREVIEW_LIMITS.lobby),
    recentMultiplayer: clampLimit(limits?.recentMultiplayer, DEFAULT_PREVIEW_LIMITS.recentMultiplayer),
    recentSolo: clampLimit(limits?.recentSolo, DEFAULT_PREVIEW_LIMITS.recentSolo),
  }
}

function getDailyCard(
  id: DashboardDailyCardViewModel['id'],
  input: DashboardDailyStatusInput | undefined,
): DashboardDailyCardViewModel {
  const isSolo = id === 'daily-solo'
  const ready = input?.ready ?? false
  return {
    actionLabel: input?.actionLabel ?? (ready ? 'Play daily' : 'Open daily'),
    actionTarget: isSolo
      ? { routeId: 'solo', soloSubtab: 'daily' }
      : { routeId: 'multiplayer', multiplayerSubtab: 'daily' },
    detailLabel: input?.detailLabel ?? (isSolo ? 'Open Daily Solo from the Solo workspace.' : 'Open Daily Multiplayer from the Multiplayer workspace.'),
    id,
    ready,
    resetAt: input?.resetAt,
    title: isSolo ? 'Daily Solo' : 'Daily Multiplayer',
  }
}

function attachSoloAction(game: SoloActiveGameViewModel): DashboardSoloActiveGameViewModel {
  return {
    ...game,
    actionTarget: {
      routeId: 'solo',
      selectedSoloGameKey: game.key,
      soloSubtab: 'active',
    },
  }
}

function attachMultiplayerAction(game: MultiplayerActiveGameViewModel): DashboardMultiplayerActiveGameViewModel {
  return {
    ...game,
    actionTarget: {
      multiplayerSubtab: 'active',
      resumeMultiplayerGameId: game.id,
      routeId: 'multiplayer',
      selectedMultiplayerGameId: game.id,
    },
  }
}

function attachLobbyAction(row: MultiplayerLobbyRowViewModel): DashboardLobbyRowViewModel {
  return {
    ...row,
    actionTarget: {
      multiplayerSubtab: 'lobby',
      routeId: 'multiplayer',
      selectedMultiplayerGameId: row.id,
    },
  }
}

function attachLiveAction(row: MultiplayerLiveGameViewModel): DashboardLiveGameViewModel {
  return {
    ...row,
    actionTarget: {
      multiplayerSubtab: 'live',
      routeId: 'multiplayer',
      selectedMultiplayerGameId: row.id,
    },
  }
}

function attachSoloHistoryAction(result: SoloRecentResultViewModel): DashboardSoloRecentResultViewModel {
  return {
    ...result,
    actionTarget: {
      historyFilters: SOLO_HISTORY_FILTERS,
      routeId: 'history',
    },
  }
}

function attachMultiplayerHistoryAction(result: MultiplayerRecentResultViewModel): DashboardMultiplayerRecentResultViewModel {
  return {
    ...result,
    actionTarget: {
      historyFilters: MULTIPLAYER_HISTORY_FILTERS,
      routeId: 'history',
    },
  }
}

function getQuickActions(input: {
  readonly daily: readonly DashboardDailyCardViewModel[]
  readonly summary: DashboardSummaryViewModel
}): readonly DashboardQuickActionViewModel[] {
  const dailySolo = input.daily.find((card) => card.id === 'daily-solo')
  const dailyMultiplayer = input.daily.find((card) => card.id === 'daily-multiplayer')

  return [
    {
      actionTarget: dailySolo?.actionTarget ?? { routeId: 'solo', soloSubtab: 'daily' },
      attentionCount: dailySolo?.ready ? 1 : 0,
      detailLabel: dailySolo?.detailLabel ?? 'Open Daily Solo.',
      id: 'daily-solo',
      label: 'Daily Solo',
    },
    {
      actionTarget: { routeId: 'solo', soloSubtab: 'practice' },
      attentionCount: input.summary.activeSoloCount,
      detailLabel: 'Start or resume Solo Practice.',
      id: 'practice-solo',
      label: 'Practice Solo',
    },
    {
      actionTarget: dailyMultiplayer?.actionTarget ?? { routeId: 'multiplayer', multiplayerSubtab: 'daily' },
      attentionCount: dailyMultiplayer?.ready ? 1 : 0,
      detailLabel: dailyMultiplayer?.detailLabel ?? 'Open Daily Multiplayer.',
      id: 'daily-multiplayer',
      label: 'Daily Multiplayer',
    },
    {
      actionTarget: { routeId: 'multiplayer', multiplayerSubtab: 'active' },
      attentionCount: input.summary.yourTurnMultiplayerCount,
      detailLabel: 'Resume active Multiplayer games.',
      id: 'active-multiplayer',
      label: 'Active Multiplayer',
    },
    {
      actionTarget: { routeId: 'multiplayer', multiplayerSubtab: 'lobby' },
      attentionCount: input.summary.openLobbyCount,
      detailLabel: 'Browse joinable lobbies.',
      id: 'lobby',
      label: 'Lobby',
    },
    {
      actionTarget: { historyFilters: { mode: 'all', player: 'all', scope: 'all' }, routeId: 'history' },
      attentionCount: input.summary.recentSoloResultCount + input.summary.recentMultiplayerResultCount,
      detailLabel: 'Review recent completed games.',
      id: 'history',
      label: 'History',
    },
  ]
}

export function createDashboardViewModel(input: CreateDashboardViewModelInput = {}): DashboardViewModel {
  const limits = getLimits(input.limits)
  const activeSoloRows = selectActiveSoloGames(input.resumeSlots)
  const activeMultiplayerRows = selectActiveMultiplayerGameRows(input.multiplayerState, input.viewerUserId)
  const lobbyRows = selectMultiplayerLobbyRows(input.multiplayerState, {
    dailyDateKey: input.dailyDateKey,
    viewerUserId: input.viewerUserId,
  })
  const liveRows = selectLiveMultiplayerRows(input.multiplayerState, input.viewerUserId, input.liveSpectatorRows)
  const recentSoloRows = selectRecentSoloResults(input.history, limits.recentSolo)
  const recentMultiplayerRows = selectRecentMultiplayerResults(
    input.competitiveMultiplayerState,
    input.viewerUserId,
    limits.recentMultiplayer,
  )
  const activeSolo = takePreview(activeSoloRows.map(attachSoloAction), limits.activeSolo)
  const activeMultiplayer = takePreview(activeMultiplayerRows.map(attachMultiplayerAction), limits.activeMultiplayer)
  const yourTurnMultiplayerRows = activeMultiplayerRows.filter((row) => row.turnLabel === 'Your turn')
  const yourTurnMultiplayer = takePreview(yourTurnMultiplayerRows.map(attachMultiplayerAction), limits.activeMultiplayer)
  const lobbyPreview = takePreview(lobbyRows.map(attachLobbyAction), limits.lobby)
  const livePreview = takePreview(liveRows.map(attachLiveAction), limits.live)
  const recentSolo = recentSoloRows.map(attachSoloHistoryAction)
  const recentMultiplayer = recentMultiplayerRows.map(attachMultiplayerHistoryAction)
  const daily = [
    getDailyCard('daily-solo', input.dailySolo),
    getDailyCard('daily-multiplayer', input.dailyMultiplayer),
  ]
  const summary: DashboardSummaryViewModel = {
    activeMultiplayerCount: activeMultiplayerRows.length,
    activeSoloCount: activeSoloRows.length,
    liveGameCount: liveRows.length,
    openLobbyCount: lobbyRows.filter((row) => row.canJoin || row.canCancel).length,
    recentMultiplayerResultCount: recentMultiplayerRows.length,
    recentSoloResultCount: recentSoloRows.length,
    restrictedLiveGameCount: selectRestrictedLiveMultiplayerCount(input.multiplayerState, input.viewerUserId, input.liveSpectatorRows),
    yourTurnMultiplayerCount: yourTurnMultiplayerRows.length,
  }

  return {
    activeMultiplayer,
    activeSolo,
    daily,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    livePreview,
    lobbyPreview,
    quickActions: getQuickActions({ daily, summary }),
    recentMultiplayer,
    recentSolo,
    summary,
    yourTurnMultiplayer,
  }
}
