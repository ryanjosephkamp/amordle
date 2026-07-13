import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NAVIGATION_STATE,
  LEGACY_NAVIGATION_STORAGE_KEY,
  NAVIGATION_STORAGE_KEY,
  loadNavigationState,
  saveNavigationState,
} from './navigationState'

function createStorage(initial: Record<string, string> = {}) {
  const records = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
  }
}

function createBrowserStorage(localInitial: Record<string, string> = {}, sessionInitial: Record<string, string> = {}) {
  const localStorage = createStorage(localInitial)
  const sessionStorage = createStorage(sessionInitial)
  vi.stubGlobal('window', { localStorage, sessionStorage })
  return { localStorage, sessionStorage }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('navigationState', () => {
  it('returns defaults without browser storage', () => {
    expect(loadNavigationState(undefined)).toEqual(DEFAULT_NAVIGATION_STATE)
  })

  it('loads and saves validated v2 route and subtab state', () => {
    const storage = createStorage()

    saveNavigationState({
      activeRouteId: 'solo',
      historyFilters: { mode: 'go', player: 'solo', scope: 'daily' },
      legacyPracticeMode: 'go',
      multiplayerSubtab: 'lobby',
      publicProfileReturnRoute: 'multiplayer',
      selectedMultiplayerGameId: 'game-123',
      selectedPublicProfileId: '123e4567-e89b-42d3-a456-426614174000',
      selectedSoloGameKey: 'practice-go',
      soloSubtab: 'daily',
    }, storage)

    expect(loadNavigationState(storage)).toEqual({
      activeRouteId: 'solo',
      historyFilters: { mode: 'go', player: 'solo', scope: 'daily' },
      legacyPracticeMode: 'go',
      multiplayerSubtab: 'lobby',
      publicProfileReturnRoute: 'multiplayer',
      selectedMultiplayerGameId: 'game-123',
      selectedPublicProfileId: '123e4567-e89b-42d3-a456-426614174000',
      selectedSoloGameKey: 'practice-go',
      soloSubtab: 'daily',
    })
  })

  it('prefers same-tab session navigation over stale local navigation when merging saved state', () => {
    createBrowserStorage({
      [NAVIGATION_STORAGE_KEY]: JSON.stringify({
        activeRouteId: 'home',
        legacyPracticeMode: 'og',
        multiplayerSubtab: 'overview',
        soloSubtab: 'overview',
      }),
    }, {
      [NAVIGATION_STORAGE_KEY]: JSON.stringify({
        activeRouteId: 'solo',
        legacyPracticeMode: 'go',
        multiplayerSubtab: 'overview',
        selectedSoloGameKey: 'practice-go',
        soloSubtab: 'practice',
      }),
    })

    expect(loadNavigationState()).toMatchObject({
      activeRouteId: 'solo',
      legacyPracticeMode: 'go',
      selectedSoloGameKey: 'practice-go',
      soloSubtab: 'practice',
    })
  })

  it('saves default browser navigation to local and same-tab session storage', () => {
    const { localStorage, sessionStorage } = createBrowserStorage()

    saveNavigationState({
      activeRouteId: 'multiplayer',
      multiplayerSubtab: 'lobby',
    })

    expect(loadNavigationState(localStorage)).toMatchObject({
      activeRouteId: 'multiplayer',
      multiplayerSubtab: 'lobby',
    })
    expect(loadNavigationState(sessionStorage)).toMatchObject({
      activeRouteId: 'multiplayer',
      multiplayerSubtab: 'lobby',
    })
  })

  it('falls back safely when v2 navigation state is corrupt or obsolete', () => {
    const storage = createStorage({
      [NAVIGATION_STORAGE_KEY]: JSON.stringify({
        activeRouteId: 'obsolete-route',
        historyFilters: { mode: 'invalid', player: 'invalid', scope: 'invalid' },
        legacyPracticeMode: 'invalid',
        multiplayerSubtab: 'invalid',
        publicProfileReturnRoute: 'invalid',
        selectedMultiplayerGameId: '',
        selectedPublicProfileId: 'raw-auth-id',
        selectedSoloGameKey: '',
        soloSubtab: 'invalid',
      }),
    })

    expect(loadNavigationState(storage)).toEqual(DEFAULT_NAVIGATION_STATE)
  })

  it('maps legacy v1 Practice navigation to the Solo Practice compatibility target', () => {
    const storage = createStorage({
      [LEGACY_NAVIGATION_STORAGE_KEY]: JSON.stringify({
        activeRouteId: 'practice',
        practiceMode: 'go',
      }),
    })

    expect(loadNavigationState(storage)).toEqual({
      ...DEFAULT_NAVIGATION_STATE,
      activeRouteId: 'solo',
      legacyPracticeMode: 'go',
      soloSubtab: 'practice',
    })
  })

  it('maps v2 Practice compatibility navigation to the Solo Practice subtab', () => {
    const storage = createStorage({
      [NAVIGATION_STORAGE_KEY]: JSON.stringify({
        activeRouteId: 'practice',
        legacyPracticeMode: 'og',
        soloSubtab: 'overview',
      }),
    })

    expect(loadNavigationState(storage)).toMatchObject({
      activeRouteId: 'solo',
      legacyPracticeMode: 'og',
      soloSubtab: 'practice',
    })
  })

  it('normalizes legacy hidden daily route ids to the Calendar route', () => {
    const storage = createStorage({
      [LEGACY_NAVIGATION_STORAGE_KEY]: JSON.stringify({
        activeRouteId: 'go-daily',
        practiceMode: 'og',
      }),
    })

    expect(loadNavigationState(storage)).toMatchObject({
      activeRouteId: 'calendar',
      legacyPracticeMode: 'og',
    })
  })

  it('prefers valid v2 state over legacy v1 state', () => {
    const storage = createStorage({
      [LEGACY_NAVIGATION_STORAGE_KEY]: JSON.stringify({
        activeRouteId: 'practice',
        practiceMode: 'go',
      }),
      [NAVIGATION_STORAGE_KEY]: JSON.stringify({
        activeRouteId: 'multiplayer',
        legacyPracticeMode: 'og',
        multiplayerSubtab: 'live',
        soloSubtab: 'overview',
      }),
    })

    expect(loadNavigationState(storage)).toMatchObject({
      activeRouteId: 'multiplayer',
      legacyPracticeMode: 'og',
      multiplayerSubtab: 'live',
      soloSubtab: 'overview',
    })
  })
})
