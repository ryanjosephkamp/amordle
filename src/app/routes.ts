import type { GameMode, PlayScope } from '../game/types'

export type AppRouteId = 'home' | 'solo' | 'calendar' | 'marketplace' | 'og-daily' | 'go-daily' | 'practice' | 'multiplayer' | 'history' | 'leaderboard' | 'word-explorer' | 'profile' | 'public-profile' | 'feedback' | 'definitions' | 'stats' | 'help' | 'settings' | 'about' | 'admin'

export interface AppRoute {
  readonly id: AppRouteId
  readonly label: string
  readonly shortLabel: string
  readonly description: string
  readonly navigationGroup: 'play' | 'support'
  readonly mode?: GameMode
  readonly scope?: PlayScope
  readonly wordLength?: number
  /**
   * Routes kept only for backward-compatible deep links or future inert route
   * foundations. Hidden routes are excluded from the primary navigation rail.
   */
  readonly hidden?: boolean
}

export const APP_ROUTES = [
  {
    id: 'home',
    label: 'Home',
    shortLabel: 'Home',
    description: 'Choose an amordle mode and review launch status.',
    navigationGroup: 'play',
  },
  {
    id: 'solo',
    label: 'Solo',
    shortLabel: 'Solo',
    description: 'Play Solo Daily and Practice games, resume active games, and review recent results.',
    navigationGroup: 'play',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    shortLabel: 'Calendar',
    description: 'Play today\u2019s daily puzzles or unlock and replay any past daily back to January 1, 2025.',
    navigationGroup: 'play',
    scope: 'daily',
  },
  {
    id: 'og-daily',
    label: 'og Daily',
    shortLabel: 'og',
    description: 'Classic daily amordle, fixed at five letters for launch.',
    navigationGroup: 'play',
    mode: 'og',
    scope: 'daily',
    wordLength: 5,
    hidden: true,
  },
  {
    id: 'go-daily',
    label: 'go Daily',
    shortLabel: 'go',
    description: 'Daily multi-board amordle, fixed at five letters for launch.',
    navigationGroup: 'play',
    mode: 'go',
    scope: 'daily',
    wordLength: 5,
    hidden: true,
  },
  {
    id: 'practice',
    label: 'Practice',
    shortLabel: 'Practice',
    description: 'Legacy compatibility route for Practice. Current Practice entry points live under Solo and Multiplayer.',
    navigationGroup: 'play',
    scope: 'practice',
    hidden: true,
  },
  {
    id: 'multiplayer',
    label: 'Multiplayer',
    shortLabel: 'Multiplayer',
    description: 'Play Daily and Practice Multiplayer, resume active games, browse lobbies, and check Live v1.',
    navigationGroup: 'play',
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    shortLabel: 'Market',
    description: 'Buy coin-funded consumables for Solo Practice games.',
    navigationGroup: 'support',
  },
  {
    id: 'history',
    label: 'History',
    shortLabel: 'History',
    description: 'Review completed Solo and Multiplayer results.',
    navigationGroup: 'support',
  },
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    shortLabel: 'Leaderboard',
    description: 'Review public ranked Practice leaderboards and competitive multiplayer ratings.',
    navigationGroup: 'support',
  },
  {
    id: 'word-explorer',
    label: 'Word Explorer',
    shortLabel: 'Words',
    description: 'Browse and search the exact words amordle is using.',
    navigationGroup: 'support',
  },
  {
    id: 'profile',
    label: 'Profile',
    shortLabel: 'Profile',
    description: 'Manage your public Player name and player-card details.',
    navigationGroup: 'support',
  },
  {
    id: 'public-profile',
    label: 'Public Profile',
    shortLabel: 'Profile',
    description: 'View a display-only public player profile opened from an approved public identity surface.',
    navigationGroup: 'support',
    hidden: true,
  },
  {
    id: 'definitions',
    label: 'Definitions',
    shortLabel: 'Defs',
    description: 'Definition results will appear here after games end.',
    navigationGroup: 'support',
  },
  {
    id: 'stats',
    label: 'Stats',
    shortLabel: 'Stats',
    description: 'Review your local and synced gameplay statistics.',
    navigationGroup: 'support',
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    description: 'Manage preferences, notifications, account access, sync, and local progress.',
    navigationGroup: 'support',
  },
  {
    id: 'help',
    label: 'Help',
    shortLabel: 'Help',
    description: 'Open the quick route guide and first-run tutorial.',
    navigationGroup: 'support',
  },
  {
    id: 'feedback',
    label: 'Feedback',
    shortLabel: 'Feedback',
    description: 'Send a pre-filled bug report, feature request, or note.',
    navigationGroup: 'support',
  },
  {
    id: 'about',
    label: 'About amordle',
    shortLabel: 'About',
    description: 'Project notes, rules context, credits, and release details for amordle.',
    navigationGroup: 'support',
  },
  {
    id: 'admin',
    label: 'Admin',
    shortLabel: 'Admin',
    description: 'Protected data refresh controls will appear here in the admin phase.',
    navigationGroup: 'support',
  },
] as const satisfies readonly AppRoute[]

export const DEFAULT_ROUTE_ID: AppRouteId = 'home'

export const PRIMARY_NAVIGATION_ROUTE_IDS = [
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
] as const satisfies readonly AppRouteId[]

const HIDDEN_DAILY_COMPATIBILITY_ROUTE_IDS = ['og-daily', 'go-daily'] as const satisfies readonly AppRouteId[]

export function isAppRouteId(value: unknown): value is AppRouteId {
  return typeof value === 'string' && APP_ROUTES.some((route) => route.id === value)
}

export function isDailyCompatibilityRoute(routeId: AppRouteId): boolean {
  return (HIDDEN_DAILY_COMPATIBILITY_ROUTE_IDS as readonly AppRouteId[]).includes(routeId)
}

export function getRouteCompatibilityTarget(routeId: AppRouteId): AppRouteId {
  if (isDailyCompatibilityRoute(routeId)) {
    return 'calendar'
  }

  return routeId === 'practice' ? 'solo' : routeId
}

export function getRouteById(routeId: AppRouteId): AppRoute {
  return APP_ROUTES.find((route) => route.id === routeId) ?? APP_ROUTES[0]
}

export function getRoutesByGroup(group: AppRoute['navigationGroup']): readonly AppRoute[] {
  return APP_ROUTES.filter((route) => route.navigationGroup === group)
}

export function getPrimaryNavigationRoutes(isAdmin: boolean): readonly AppRoute[] {
  const routeIds: readonly AppRouteId[] = isAdmin ? [...PRIMARY_NAVIGATION_ROUTE_IDS, 'admin'] : PRIMARY_NAVIGATION_ROUTE_IDS

  return routeIds.map((routeId) => getRouteById(routeId))
}
