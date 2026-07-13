import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MultiplayerGame } from '../multiplayer/multiplayer'
import {
  createBrowserNavigationViewState,
  parseBrowserNavigationViewState,
  readCurrentBrowserNavigationViewState,
  resolveBrowserNavigationViewState,
  subscribeBrowserNavigationViewState,
  writeBrowserNavigationViewState,
} from './browserNavigationHistory'

afterEach(() => {
  vi.unstubAllGlobals()
})

function createHistoryWindow(initialState: unknown = null) {
  const listeners: Array<(event: PopStateEvent) => void> = []
  const history = {
    state: initialState,
    pushState: vi.fn((state: unknown) => {
      history.state = state
    }),
    replaceState: vi.fn((state: unknown) => {
      history.state = state
    }),
  }
  const windowRef = {
    addEventListener: vi.fn((event: string, listener: (event: PopStateEvent) => void) => {
      if (event === 'popstate') {
        listeners.push(listener)
      }
    }),
    history,
    location: { href: 'https://play.brrrdle.test/' },
    removeEventListener: vi.fn((event: string, listener: (event: PopStateEvent) => void) => {
      if (event === 'popstate') {
        const index = listeners.indexOf(listener)
        if (index >= 0) {
          listeners.splice(index, 1)
        }
      }
    }),
  }

  vi.stubGlobal('window', windowRef)
  return { history, listeners, windowRef }
}

function playingMultiplayerGame(overrides: Partial<MultiplayerGame> = {}): MultiplayerGame {
  return {
    id: 'match-1',
    playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
    scope: 'practice',
    status: 'playing',
    ...overrides,
  } as MultiplayerGame
}

describe('browser navigation history', () => {
  it('serializes only normalized view state into browser history', () => {
    const { history } = createHistoryWindow()
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'multiplayer',
      focusedLiveSpectatorGameId: 'live-1',
      multiplayerSubtab: 'live',
      publicProfileReturnRoute: 'multiplayer',
      selectedPublicProfileId: '123e4567-e89b-42d3-a456-426614174000',
      selectedMultiplayerGameId: 'match-1',
      submitGuess: 'crane',
    } as unknown as Parameters<typeof createBrowserNavigationViewState>[0])

    expect(writeBrowserNavigationViewState(viewState, 'replace')).toBe(true)

    const rawState = JSON.stringify(history.state)
    expect(rawState).toContain('selectedMultiplayerGameId')
    expect(rawState).toContain('selectedPublicProfileId')
    expect(rawState).toContain('publicProfileReturnRoute')
    expect(rawState).not.toContain('submitGuess')
    expect(rawState).not.toContain('crane')
    expect(readCurrentBrowserNavigationViewState()).toEqual(viewState)
  })

  it('keeps public profile history as normalized display-only route state', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'public-profile',
      publicProfileReturnRoute: 'multiplayer',
      selectedPublicProfileId: '123e4567-e89b-42d3-a456-426614174000',
      user_id: 'raw-auth-id',
    } as unknown as Parameters<typeof createBrowserNavigationViewState>[0])

    expect(viewState.navigation.activeRouteId).toBe('public-profile')
    expect(viewState.navigation.selectedPublicProfileId).toBe('123e4567-e89b-42d3-a456-426614174000')
    expect(viewState.navigation.publicProfileReturnRoute).toBe('multiplayer')
    expect(JSON.stringify(viewState)).not.toContain('raw-auth-id')
  })

  it('pushes changed view states and replaces duplicate view states', () => {
    const { history } = createHistoryWindow()
    const first = createBrowserNavigationViewState({ activeRouteId: 'solo', soloSubtab: 'daily' })
    const second = createBrowserNavigationViewState({ activeRouteId: 'solo', soloSubtab: 'practice' })

    writeBrowserNavigationViewState(first, 'replace')
    writeBrowserNavigationViewState(second, 'push')
    writeBrowserNavigationViewState(second, 'push')

    expect(history.replaceState).toHaveBeenCalledTimes(2)
    expect(history.pushState).toHaveBeenCalledTimes(1)
    expect(readCurrentBrowserNavigationViewState()).toEqual(second)
  })

  it('normalizes popstate payloads before invoking subscribers', () => {
    const first = createBrowserNavigationViewState({ activeRouteId: 'solo', soloSubtab: 'daily' })
    const { history, listeners, windowRef } = createHistoryWindow()
    writeBrowserNavigationViewState(first, 'replace')
    const received: unknown[] = []

    const unsubscribe = subscribeBrowserNavigationViewState((viewState) => {
      received.push(viewState)
    })
    listeners[0]?.({ state: history.state } as PopStateEvent)
    unsubscribe()

    expect(received).toEqual([first])
    expect(windowRef.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function))
  })

  it('falls stale Solo selected games back to Active Games without preserving a dead key', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'solo',
      selectedSoloGameKey: 'practice-go',
      soloSubtab: 'practice',
    })

    expect(resolveBrowserNavigationViewState(viewState, { resumeSlots: {} })).toEqual(createBrowserNavigationViewState({
      activeRouteId: 'solo',
      selectedSoloGameKey: undefined,
      soloSubtab: 'active',
    }))
  })

  it('keeps valid Solo selected games and aligns practice mode to the resume slot', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'solo',
      legacyPracticeMode: 'og',
      selectedSoloGameKey: 'practice-go',
      soloSubtab: 'practice',
    })

    const resolved = resolveBrowserNavigationViewState(viewState, {
      resumeSlots: {
        'practice-go': {
          difficulty: 'casual',
          goPuzzleCount: 5,
          mode: 'go',
          scope: 'practice',
          serializedSession: {
            currentPuzzleIndex: 1,
            hardMode: false,
            priorAnswers: ['crane'],
            puzzles: [
              { answer: 'crane', continuationCount: 0, currentGuess: '', guesses: ['crane'], maxAttempts: 6, prefilledGuesses: [] },
              { answer: 'plumb', continuationCount: 0, currentGuess: 'pl', guesses: [], maxAttempts: 6, prefilledGuesses: ['crane'] },
            ],
          },
          updatedAt: '2026-06-30T00:00:00Z',
          wordLength: 5,
        },
      },
    })

    expect(resolved.navigation.selectedSoloGameKey).toBe('practice-go')
    expect(resolved.navigation.legacyPracticeMode).toBe('go')
    expect(resolved.navigation.soloSubtab).toBe('practice')
  })

  it('keeps completed Solo selected games from display-only evidence without requiring a resume slot', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'solo',
      selectedSoloGameKey: 'daily-og',
      soloSubtab: 'daily',
    })

    const resolved = resolveBrowserNavigationViewState(viewState, {
      completedSoloSlots: {
        'daily-og': {
          difficulty: 'expert',
          mode: 'og',
          scope: 'daily',
          serializedSession: {
            answer: 'crane',
            continuationCount: 0,
            currentGuess: '',
            guesses: ['crane'],
            hardMode: false,
            maxAttempts: 6,
          },
          updatedAt: '2026-07-06T00:00:00Z',
          wordLength: 5,
        },
      },
      resumeSlots: {},
    })

    expect(resolved.navigation.selectedSoloGameKey).toBe('daily-og')
    expect(resolved.navigation.soloSubtab).toBe('daily')
  })

  it('falls stale Multiplayer selected games back to Active Games', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'multiplayer',
      multiplayerSubtab: 'practice',
      selectedMultiplayerGameId: 'missing-game',
    })

    const resolved = resolveBrowserNavigationViewState(viewState, { multiplayerGames: [] })

    expect(resolved.navigation.multiplayerSubtab).toBe('active')
    expect(resolved.navigation.selectedMultiplayerGameId).toBeUndefined()
  })

  it('preserves valid resumable Multiplayer selections for browser back and forward', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'multiplayer',
      multiplayerSubtab: 'practice',
      selectedMultiplayerGameId: 'match-1',
    })

    const resolved = resolveBrowserNavigationViewState(viewState, {
      multiplayerGames: [playingMultiplayerGame()],
      viewerUserId: 'user-1',
    })

    expect(resolved.navigation.multiplayerSubtab).toBe('practice')
    expect(resolved.navigation.selectedMultiplayerGameId).toBe('match-1')
  })

  it('preserves waiting Multiplayer selections when the viewer can join the lobby', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'multiplayer',
      multiplayerSubtab: 'practice',
      selectedMultiplayerGameId: 'match-1',
    })

    const resolved = resolveBrowserNavigationViewState(viewState, {
      multiplayerGames: [playingMultiplayerGame({
        playerUserIds: { 'player-one': 'user-1' },
        status: 'waiting',
      })],
      viewerUserId: 'user-2',
    })

    expect(resolved.navigation.multiplayerSubtab).toBe('practice')
    expect(resolved.navigation.selectedMultiplayerGameId).toBe('match-1')
  })

  it('falls terminal Multiplayer selected games back to Active Games', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'multiplayer',
      multiplayerSubtab: 'practice',
      selectedMultiplayerGameId: 'match-1',
    })

    const resolved = resolveBrowserNavigationViewState(viewState, {
      multiplayerGames: [playingMultiplayerGame({
        endedAt: '2026-06-30T01:00:00Z',
        status: 'won',
      })],
      viewerUserId: 'user-1',
    })

    expect(resolved.navigation.multiplayerSubtab).toBe('active')
    expect(resolved.navigation.selectedMultiplayerGameId).toBeUndefined()
  })

  it('preserves visible focused spectator history without requiring participant game membership', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'multiplayer',
      focusedLiveSpectatorGameId: 'live-1',
      multiplayerSubtab: 'live',
      selectedMultiplayerGameId: 'live-1',
    })

    const resolved = resolveBrowserNavigationViewState(viewState, {
      liveSpectatorRows: [{ id: 'live-1' }],
      multiplayerGames: [],
    })

    expect(resolved.focusedLiveSpectatorGameId).toBe('live-1')
    expect(resolved.navigation.multiplayerSubtab).toBe('live')
    expect(resolved.navigation.selectedMultiplayerGameId).toBe('live-1')
  })

  it('falls focused spectator history back to the Live list when the row is gone', () => {
    const viewState = createBrowserNavigationViewState({
      activeRouteId: 'multiplayer',
      focusedLiveSpectatorGameId: 'live-1',
      multiplayerSubtab: 'live',
      selectedMultiplayerGameId: 'live-1',
    })

    const resolved = resolveBrowserNavigationViewState(viewState, {
      liveSpectatorRows: [],
      multiplayerGames: [],
    })

    expect(resolved.focusedLiveSpectatorGameId).toBeUndefined()
    expect(resolved.navigation.multiplayerSubtab).toBe('live')
    expect(resolved.navigation.selectedMultiplayerGameId).toBeUndefined()
  })

  it('rejects malformed browser history payloads', () => {
    expect(parseBrowserNavigationViewState({ garbage: true })).toBeUndefined()
    expect(parseBrowserNavigationViewState(null)).toBeUndefined()
  })
})
