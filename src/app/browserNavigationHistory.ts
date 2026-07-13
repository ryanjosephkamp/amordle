import type { ResumeSlotCollection } from '../account'
import {
  canViewerCancelMultiplayerGame,
  canViewerJoinMultiplayerGame,
  getViewerMultiplayerPlayerId,
  type MultiplayerGame,
} from '../multiplayer/multiplayer'
import type { AuthenticatedLiveSpectatorGame } from '../multiplayer/multiplayerRepository'
import { isSoloActiveGameKey } from '../solo/soloViewModels'
import {
  DEFAULT_NAVIGATION_STATE,
  normalizeNavigationState,
  type NavigationState,
} from './navigationState'

const BROWSER_NAVIGATION_HISTORY_KEY = '__brrrdleNavigation'
const BROWSER_NAVIGATION_HISTORY_VERSION = 1

interface BrowserNavigationHistoryPayload {
  readonly version: typeof BROWSER_NAVIGATION_HISTORY_VERSION
  readonly viewState: BrowserNavigationViewState
}

export interface BrowserNavigationViewState {
  readonly focusedLiveSpectatorGameId?: string
  readonly navigation: NavigationState
}

export interface BrowserNavigationResolutionContext {
  readonly completedSoloSlots?: ResumeSlotCollection
  readonly liveSpectatorRows?: readonly Pick<AuthenticatedLiveSpectatorGame, 'id'>[]
  readonly multiplayerGames?: readonly MultiplayerGame[]
  readonly resumeSlots?: ResumeSlotCollection
  readonly viewerUserId?: string
}

export type BrowserNavigationWriteMode = 'push' | 'replace'

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function toHistoryPayload(viewState: BrowserNavigationViewState): Record<string, BrowserNavigationHistoryPayload> {
  return {
    [BROWSER_NAVIGATION_HISTORY_KEY]: {
      version: BROWSER_NAVIGATION_HISTORY_VERSION,
      viewState,
    },
  }
}

function getPayloadRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const payload = record[BROWSER_NAVIGATION_HISTORY_KEY]
  return typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : undefined
}

export function createBrowserNavigationViewState(
  input: Partial<NavigationState> & { readonly focusedLiveSpectatorGameId?: string },
): BrowserNavigationViewState {
  return {
    focusedLiveSpectatorGameId: normalizeOptionalString(input.focusedLiveSpectatorGameId),
    navigation: normalizeNavigationState(input),
  }
}

export function parseBrowserNavigationViewState(value: unknown): BrowserNavigationViewState | undefined {
  const payload = getPayloadRecord(value)
  if (!payload || payload.version !== BROWSER_NAVIGATION_HISTORY_VERSION) {
    return undefined
  }
  const rawViewState = payload.viewState
  if (typeof rawViewState !== 'object' || rawViewState === null) {
    return undefined
  }
  const record = rawViewState as Record<string, unknown>
  const navigation = typeof record.navigation === 'object' && record.navigation !== null
    ? normalizeNavigationState(record.navigation)
    : DEFAULT_NAVIGATION_STATE

  return {
    focusedLiveSpectatorGameId: normalizeOptionalString(record.focusedLiveSpectatorGameId),
    navigation,
  }
}

export function areBrowserNavigationViewStatesEqual(
  first: BrowserNavigationViewState | undefined,
  second: BrowserNavigationViewState | undefined,
): boolean {
  if (!first || !second) {
    return first === second
  }
  return first.focusedLiveSpectatorGameId === second.focusedLiveSpectatorGameId
    && JSON.stringify(first.navigation) === JSON.stringify(second.navigation)
}

export function readCurrentBrowserNavigationViewState(): BrowserNavigationViewState | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return parseBrowserNavigationViewState(window.history.state)
}

export function writeBrowserNavigationViewState(
  viewState: BrowserNavigationViewState,
  mode: BrowserNavigationWriteMode,
): boolean {
  if (typeof window === 'undefined' || !window.history) {
    return false
  }

  const current = parseBrowserNavigationViewState(window.history.state)
  const payload = toHistoryPayload(viewState)
  const url = window.location?.href
  if (mode === 'push' && !areBrowserNavigationViewStatesEqual(current, viewState)) {
    window.history.pushState(payload, '', url)
    return true
  }

  window.history.replaceState(payload, '', url)
  return true
}

export function subscribeBrowserNavigationViewState(
  onViewState: (viewState: BrowserNavigationViewState) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const listener = (event: PopStateEvent) => {
    const viewState = parseBrowserNavigationViewState(event.state)
    if (viewState) {
      onViewState(viewState)
    }
  }
  window.addEventListener('popstate', listener)
  return () => window.removeEventListener('popstate', listener)
}

function isFocusedSpectatorVisible(
  id: string | undefined,
  liveSpectatorRows: readonly Pick<AuthenticatedLiveSpectatorGame, 'id'>[],
): boolean {
  return Boolean(id && liveSpectatorRows.some((row) => row.id === id))
}

function isPlayableSelectedMultiplayerGame(
  game: MultiplayerGame | undefined,
  subtab: NavigationState['multiplayerSubtab'],
  viewerUserId: string | undefined,
): boolean {
  if (!game) {
    return false
  }
  if (subtab !== 'daily' && subtab !== 'practice') {
    return true
  }
  const scopeMatches = subtab === 'daily' ? game.scope === 'daily' : game.scope === 'practice'
  if (!scopeMatches) {
    return false
  }
  if (game.status === 'playing') {
    return !viewerUserId || Boolean(getViewerMultiplayerPlayerId(game, viewerUserId))
  }
  if (game.status === 'waiting') {
    return !viewerUserId
      || canViewerJoinMultiplayerGame(game, viewerUserId)
      || canViewerCancelMultiplayerGame(game, viewerUserId)
  }
  return false
}

export function resolveBrowserNavigationViewState(
  viewState: BrowserNavigationViewState,
  context: BrowserNavigationResolutionContext,
): BrowserNavigationViewState {
  const completedSoloSlots = context.completedSoloSlots ?? {}
  const resumeSlots = context.resumeSlots ?? {}
  const multiplayerGames = context.multiplayerGames ?? []
  const liveSpectatorRows = context.liveSpectatorRows ?? []
  const navigation = viewState.navigation
  const requestedSoloGameKey = isSoloActiveGameKey(navigation.selectedSoloGameKey)
    ? navigation.selectedSoloGameKey
    : undefined
  const selectedSoloSlot = requestedSoloGameKey
    ? resumeSlots[requestedSoloGameKey] ?? completedSoloSlots[requestedSoloGameKey]
    : undefined
  const selectedSoloGameKey = selectedSoloSlot ? requestedSoloGameKey : undefined
  const requestedSoloSelectionWasStale = Boolean(navigation.selectedSoloGameKey && !selectedSoloGameKey)

  const focusedLiveSpectatorGameId = isFocusedSpectatorVisible(
    viewState.focusedLiveSpectatorGameId,
    liveSpectatorRows,
  )
    ? viewState.focusedLiveSpectatorGameId
    : undefined
  const selectedMultiplayerGame = navigation.selectedMultiplayerGameId
    ? multiplayerGames.find((game) => game.id === navigation.selectedMultiplayerGameId)
    : undefined
  const selectedMultiplayerGameId = focusedLiveSpectatorGameId
    ?? (isPlayableSelectedMultiplayerGame(
      selectedMultiplayerGame,
      navigation.multiplayerSubtab,
      context.viewerUserId,
    )
      ? selectedMultiplayerGame?.id
      : undefined)
  const requestedMultiplayerSelectionWasStale = Boolean(navigation.selectedMultiplayerGameId && !selectedMultiplayerGameId)
  const multiplayerSubtab = focusedLiveSpectatorGameId || (viewState.focusedLiveSpectatorGameId && !focusedLiveSpectatorGameId)
    ? 'live'
    : navigation.activeRouteId === 'multiplayer' && requestedMultiplayerSelectionWasStale
      ? 'active'
      : navigation.multiplayerSubtab

  return createBrowserNavigationViewState({
    ...navigation,
    focusedLiveSpectatorGameId,
    legacyPracticeMode: selectedSoloSlot?.scope === 'practice'
      ? selectedSoloSlot.mode
      : navigation.legacyPracticeMode,
    multiplayerSubtab,
    selectedMultiplayerGameId,
    selectedSoloGameKey,
    soloSubtab: navigation.activeRouteId === 'solo' && requestedSoloSelectionWasStale
      ? 'active'
      : navigation.soloSubtab,
  })
}
