import { describe, expect, it } from 'vitest'
import { APP_ROUTES, DEFAULT_ROUTE_ID, getPrimaryNavigationRoutes, getRouteById, getRouteCompatibilityTarget, getRoutesByGroup, isDailyCompatibilityRoute } from './routes'

describe('APP_ROUTES', () => {
  it('defines unique route ids with a home default', () => {
    const routeIds = APP_ROUTES.map((route) => route.id)

    expect(new Set(routeIds).size).toBe(routeIds.length)
    expect(getRouteById(DEFAULT_ROUTE_ID).id).toBe('home')
  })

  it('keeps launch daily modes fixed at five letters', () => {
    expect(getRouteById('og-daily')).toMatchObject({ mode: 'og', scope: 'daily', wordLength: 5 })
    expect(getRouteById('go-daily')).toMatchObject({ mode: 'go', scope: 'daily', wordLength: 5 })
  })

  it('includes minimal play and support navigation groups', () => {
    expect(getRoutesByGroup('play').map((route) => route.id)).toEqual(['home', 'solo', 'calendar', 'og-daily', 'go-daily', 'practice', 'multiplayer'])
    expect(getRoutesByGroup('support').map((route) => route.id)).toContain('marketplace')
  })

  it('keeps hidden compatibility routes out of primary navigation while promoting multiplayer', () => {
    expect(getRouteById('og-daily').hidden).toBe(true)
    expect(getRouteById('go-daily').hidden).toBe(true)
    expect(getRouteById('practice').hidden).toBe(true)
    expect(getRouteById('solo').hidden).toBeUndefined()
    expect(getRouteById('solo')).toMatchObject({ navigationGroup: 'play' })
    expect(getRouteById('multiplayer').hidden).toBeUndefined()
    expect(getRouteById('multiplayer')).toMatchObject({ navigationGroup: 'play' })
    expect(getRouteById('history').hidden).toBeUndefined()
    expect(getRouteById('history')).toMatchObject({ navigationGroup: 'support' })
    expect(getRouteById('public-profile')).toMatchObject({ hidden: true, navigationGroup: 'support' })
    expect(getRouteById('leaderboard')).toMatchObject({
      label: 'Leaderboard',
      navigationGroup: 'support',
      shortLabel: 'Leaderboard',
    })
    expect(getRouteById('help')).toMatchObject({
      label: 'Help',
      navigationGroup: 'support',
      shortLabel: 'Help',
    })
    expect(getRouteById('calendar')).toMatchObject({ scope: 'daily' })
  })

  it('keeps the primary navigation ordered with Help between Settings and Feedback', () => {
    expect(getPrimaryNavigationRoutes(false).map((route) => route.id)).toEqual([
      'solo',
      'multiplayer',
      'calendar',
      'marketplace',
      'history',
      'stats',
      'leaderboard',
      'word-explorer',
      'profile',
      'settings',
      'help',
      'feedback',
      'about',
    ])
    expect(getPrimaryNavigationRoutes(true).map((route) => route.id)).toEqual([
      'solo',
      'multiplayer',
      'calendar',
      'marketplace',
      'history',
      'stats',
      'leaderboard',
      'word-explorer',
      'profile',
      'settings',
      'help',
      'feedback',
      'about',
      'admin',
    ])
  })

  it('maps hidden daily compatibility routes back to Calendar for persisted navigation', () => {
    expect(isDailyCompatibilityRoute('og-daily')).toBe(true)
    expect(isDailyCompatibilityRoute('go-daily')).toBe(true)
    expect(isDailyCompatibilityRoute('practice')).toBe(false)
    expect(getRouteCompatibilityTarget('og-daily')).toBe('calendar')
    expect(getRouteCompatibilityTarget('go-daily')).toBe('calendar')
    expect(getRouteCompatibilityTarget('practice')).toBe('solo')
  })
})
