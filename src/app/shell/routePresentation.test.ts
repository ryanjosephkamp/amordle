import { describe, expect, it } from 'vitest'
import type { AppRouteId } from '../routes'
import { APP_ROUTES, getPrimaryNavigationRoutes } from '../routes'
import {
  ROUTE_PRESENTATIONS,
  SHELL_DESTINATIONS,
  getActiveShellDestinationId,
  getMoreRoutes,
  getRouteDisplayLabel,
  getUtilityRoutes,
  resolveShellNavigationIntent,
} from './routePresentation'

describe('Wave 02 route presentation authority', () => {
  it('is exhaustive across every unchanged internal route id', () => {
    const routeIds = APP_ROUTES.map((route) => route.id).sort()
    const presentationIds = Object.keys(ROUTE_PRESENTATIONS).sort()

    expect(presentationIds).toEqual(routeIds)
    expect(ROUTE_PRESENTATIONS.multiplayer.label).toBe('COMBAT')
    expect(ROUTE_PRESENTATIONS.multiplayer.routeId).toBe('multiplayer')
    expect(JSON.stringify(ROUTE_PRESENTATIONS)).not.toContain('amordle COMBAT')
  })

  it('defines the accepted desktop and mobile destination orders', () => {
    expect(SHELL_DESTINATIONS.desktop.map((destination) => destination.id)).toEqual([
      'play',
      'daily',
      'combat',
      'calendar',
      'stats',
      'more',
    ])
    expect(SHELL_DESTINATIONS.mobile.map((destination) => destination.id)).toEqual([
      'play',
      'daily',
      'combat',
      'more',
    ])
  })

  it('resolves typed shell intents through existing route and subtab ids', () => {
    expect(resolveShellNavigationIntent('play')).toEqual({
      destinationId: 'play',
      routeId: 'solo',
      soloSubtab: 'overview',
    })
    expect(resolveShellNavigationIntent('daily')).toEqual({
      destinationId: 'daily',
      routeId: 'solo',
      soloSubtab: 'daily',
    })
    expect(resolveShellNavigationIntent('combat')).toEqual({
      destinationId: 'combat',
      multiplayerSubtab: 'overview',
      routeId: 'multiplayer',
    })
    expect(resolveShellNavigationIntent('calendar')).toEqual({
      destinationId: 'calendar',
      routeId: 'calendar',
    })
    expect(resolveShellNavigationIntent('stats')).toEqual({
      destinationId: 'stats',
      routeId: 'stats',
    })
    expect(resolveShellNavigationIntent('more')).toBeUndefined()
  })

  it('derives current destinations without claiming Home as a dock destination', () => {
    expect(getActiveShellDestinationId('home', 'overview', 'desktop')).toBeUndefined()
    expect(getActiveShellDestinationId('home', 'overview', 'mobile')).toBeUndefined()
    expect(getActiveShellDestinationId('solo', 'overview', 'desktop')).toBe('play')
    expect(getActiveShellDestinationId('solo', 'practice', 'mobile')).toBe('play')
    expect(getActiveShellDestinationId('solo', 'daily', 'mobile')).toBe('daily')
    expect(getActiveShellDestinationId('multiplayer', 'overview', 'desktop')).toBe('combat')
    expect(getActiveShellDestinationId('calendar', 'overview', 'desktop')).toBe('calendar')
    expect(getActiveShellDestinationId('calendar', 'overview', 'mobile')).toBe('more')
    expect(getActiveShellDestinationId('settings', 'overview', 'desktop')).toBeUndefined()
    expect(getActiveShellDestinationId('settings', 'overview', 'mobile')).toBe('more')
  })

  it('filters hidden routes and Admin while exposing each remaining destination once', () => {
    const ordinaryRoutes = getPrimaryNavigationRoutes(false)
    const desktopMoreIds = getMoreRoutes(ordinaryRoutes, 'desktop').map((route) => route.id)
    const mobileMoreIds = getMoreRoutes(ordinaryRoutes, 'mobile').map((route) => route.id)
    const desktopUtilityIds = getUtilityRoutes(ordinaryRoutes).map((route) => route.id)

    expect(desktopUtilityIds).toEqual(['help', 'settings'])
    expect(desktopMoreIds).toEqual([
      'marketplace',
      'history',
      'leaderboard',
      'word-explorer',
      'profile',
      'definitions',
      'feedback',
      'about',
    ])
    expect(mobileMoreIds).toEqual([
      'calendar',
      'stats',
      'marketplace',
      'history',
      'leaderboard',
      'word-explorer',
      'profile',
      'definitions',
      'settings',
      'help',
      'feedback',
      'about',
    ])
    expect(getMoreRoutes(getPrimaryNavigationRoutes(true), 'desktop').at(-1)?.id).toBe('admin')

    const globallyHidden = new Set<AppRouteId>(['home', 'og-daily', 'go-daily', 'practice', 'public-profile'])
    expect([...desktopMoreIds, ...mobileMoreIds, ...desktopUtilityIds].some((id) => globallyHidden.has(id))).toBe(false)
    expect(new Set(desktopMoreIds).size).toBe(desktopMoreIds.length)
    expect(new Set(mobileMoreIds).size).toBe(mobileMoreIds.length)
  })

  it('uses destination-aware route titles without changing route content authority', () => {
    expect(getRouteDisplayLabel('solo', 'overview')).toBe('PLAY')
    expect(getRouteDisplayLabel('solo', 'practice')).toBe('PLAY')
    expect(getRouteDisplayLabel('solo', 'daily')).toBe('DAILY')
    expect(getRouteDisplayLabel('multiplayer', 'overview')).toBe('COMBAT')
    expect(getRouteDisplayLabel('history', 'overview')).toBe('History')
  })
})
