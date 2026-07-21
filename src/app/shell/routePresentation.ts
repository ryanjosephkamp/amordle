import type { AmordleIconName } from '../../ui/icons'
import type { MultiplayerSubtabId, SoloSubtabId } from '../navigationState'
import type { AppRoute, AppRouteId } from '../routes'

export type ShellLayout = 'desktop' | 'mobile'
export type ShellDestinationId = 'play' | 'daily' | 'combat' | 'calendar' | 'stats' | 'more'

type DesktopPlacement = 'brand' | 'destination' | 'utility' | 'more' | 'hidden'
type MobilePlacement = 'brand' | 'destination' | 'more' | 'hidden'

export interface RoutePresentation {
  readonly desktopPlacement: DesktopPlacement
  readonly icon: AmordleIconName
  readonly label: string
  readonly mobilePlacement: MobilePlacement
  readonly moreOrder?: number
  readonly routeId: AppRouteId
  readonly utilityOrder?: number
}

export interface ShellDestination {
  readonly attentionRouteId?: AppRouteId
  readonly icon: AmordleIconName
  readonly id: ShellDestinationId
  readonly label: string
}

export interface ShellNavigationIntent {
  readonly destinationId: Exclude<ShellDestinationId, 'more'>
  readonly multiplayerSubtab?: MultiplayerSubtabId
  readonly routeId: AppRouteId
  readonly soloSubtab?: SoloSubtabId
}

export const ROUTE_PRESENTATIONS: Record<AppRouteId, RoutePresentation> = {
  home: {
    desktopPlacement: 'brand',
    icon: 'play',
    label: 'Home',
    mobilePlacement: 'brand',
    routeId: 'home',
  },
  solo: {
    desktopPlacement: 'destination',
    icon: 'play',
    label: 'PLAY',
    mobilePlacement: 'destination',
    routeId: 'solo',
  },
  calendar: {
    desktopPlacement: 'destination',
    icon: 'calendar',
    label: 'Calendar',
    mobilePlacement: 'more',
    moreOrder: 10,
    routeId: 'calendar',
  },
  'og-daily': {
    desktopPlacement: 'hidden',
    icon: 'calendar',
    label: 'og Daily',
    mobilePlacement: 'hidden',
    routeId: 'og-daily',
  },
  'go-daily': {
    desktopPlacement: 'hidden',
    icon: 'calendar',
    label: 'go Daily',
    mobilePlacement: 'hidden',
    routeId: 'go-daily',
  },
  practice: {
    desktopPlacement: 'hidden',
    icon: 'play',
    label: 'Practice',
    mobilePlacement: 'hidden',
    routeId: 'practice',
  },
  multiplayer: {
    desktopPlacement: 'destination',
    icon: 'users',
    label: 'COMBAT',
    mobilePlacement: 'destination',
    routeId: 'multiplayer',
  },
  marketplace: {
    desktopPlacement: 'more',
    icon: 'search',
    label: 'Marketplace',
    mobilePlacement: 'more',
    moreOrder: 30,
    routeId: 'marketplace',
  },
  history: {
    desktopPlacement: 'more',
    icon: 'clock',
    label: 'History',
    mobilePlacement: 'more',
    moreOrder: 40,
    routeId: 'history',
  },
  leaderboard: {
    desktopPlacement: 'more',
    icon: 'users',
    label: 'Leaderboard',
    mobilePlacement: 'more',
    moreOrder: 50,
    routeId: 'leaderboard',
  },
  'word-explorer': {
    desktopPlacement: 'more',
    icon: 'search',
    label: 'Word Explorer',
    mobilePlacement: 'more',
    moreOrder: 60,
    routeId: 'word-explorer',
  },
  profile: {
    desktopPlacement: 'more',
    icon: 'account',
    label: 'Profile',
    mobilePlacement: 'more',
    moreOrder: 70,
    routeId: 'profile',
  },
  'public-profile': {
    desktopPlacement: 'hidden',
    icon: 'account',
    label: 'Public Profile',
    mobilePlacement: 'hidden',
    routeId: 'public-profile',
  },
  feedback: {
    desktopPlacement: 'more',
    icon: 'info',
    label: 'Feedback',
    mobilePlacement: 'more',
    moreOrder: 110,
    routeId: 'feedback',
  },
  definitions: {
    desktopPlacement: 'more',
    icon: 'info',
    label: 'Definitions',
    mobilePlacement: 'more',
    moreOrder: 80,
    routeId: 'definitions',
  },
  stats: {
    desktopPlacement: 'destination',
    icon: 'check-circle',
    label: 'Stats',
    mobilePlacement: 'more',
    moreOrder: 20,
    routeId: 'stats',
  },
  help: {
    desktopPlacement: 'utility',
    icon: 'help',
    label: 'Help',
    mobilePlacement: 'more',
    moreOrder: 100,
    routeId: 'help',
    utilityOrder: 10,
  },
  settings: {
    desktopPlacement: 'utility',
    icon: 'settings',
    label: 'Settings',
    mobilePlacement: 'more',
    moreOrder: 90,
    routeId: 'settings',
    utilityOrder: 20,
  },
  about: {
    desktopPlacement: 'more',
    icon: 'info',
    label: 'About amordle',
    mobilePlacement: 'more',
    moreOrder: 120,
    routeId: 'about',
  },
  admin: {
    desktopPlacement: 'more',
    icon: 'lock',
    label: 'Admin',
    mobilePlacement: 'more',
    moreOrder: 130,
    routeId: 'admin',
  },
}

const PLAY_DESTINATION = {
  attentionRouteId: 'solo',
  icon: 'play',
  id: 'play',
  label: 'PLAY',
} as const satisfies ShellDestination

const DAILY_DESTINATION = {
  icon: 'calendar',
  id: 'daily',
  label: 'DAILY',
} as const satisfies ShellDestination

const COMBAT_DESTINATION = {
  attentionRouteId: 'multiplayer',
  icon: 'users',
  id: 'combat',
  label: 'COMBAT',
} as const satisfies ShellDestination

const CALENDAR_DESTINATION = {
  attentionRouteId: 'calendar',
  icon: 'calendar',
  id: 'calendar',
  label: 'CALENDAR',
} as const satisfies ShellDestination

const STATS_DESTINATION = {
  icon: 'check-circle',
  id: 'stats',
  label: 'STATS',
} as const satisfies ShellDestination

const MORE_DESTINATION = {
  icon: 'chevron-down',
  id: 'more',
  label: 'MORE',
} as const satisfies ShellDestination

export const SHELL_DESTINATIONS: Record<ShellLayout, readonly ShellDestination[]> = {
  desktop: [
    PLAY_DESTINATION,
    DAILY_DESTINATION,
    COMBAT_DESTINATION,
    CALENDAR_DESTINATION,
    STATS_DESTINATION,
    MORE_DESTINATION,
  ],
  mobile: [
    PLAY_DESTINATION,
    DAILY_DESTINATION,
    COMBAT_DESTINATION,
    MORE_DESTINATION,
  ],
}

export function resolveShellNavigationIntent(
  destinationId: ShellDestinationId,
): ShellNavigationIntent | undefined {
  switch (destinationId) {
    case 'play':
      return { destinationId, routeId: 'solo', soloSubtab: 'overview' }
    case 'daily':
      return { destinationId, routeId: 'solo', soloSubtab: 'daily' }
    case 'combat':
      return { destinationId, multiplayerSubtab: 'overview', routeId: 'multiplayer' }
    case 'calendar':
      return { destinationId, routeId: 'calendar' }
    case 'stats':
      return { destinationId, routeId: 'stats' }
    case 'more':
      return undefined
  }
}

export function getActiveShellDestinationId(
  routeId: AppRouteId,
  soloSubtab: SoloSubtabId,
  layout: ShellLayout,
): ShellDestinationId | undefined {
  if (routeId === 'solo') {
    return soloSubtab === 'daily' ? 'daily' : 'play'
  }
  if (routeId === 'multiplayer') {
    return 'combat'
  }
  if (layout === 'desktop' && (routeId === 'calendar' || routeId === 'stats')) {
    return routeId
  }

  const presentation = ROUTE_PRESENTATIONS[routeId]
  return presentation[`${layout}Placement`] === 'more' ? 'more' : undefined
}

export function getRouteDisplayLabel(routeId: AppRouteId, soloSubtab: SoloSubtabId): string {
  if (routeId === 'solo') {
    return soloSubtab === 'daily' ? 'DAILY' : 'PLAY'
  }
  return ROUTE_PRESENTATIONS[routeId].label
}

export function getMoreRoutes(routes: readonly AppRoute[], layout: ShellLayout): readonly AppRoute[] {
  return routes
    .filter((route) => !route.hidden && ROUTE_PRESENTATIONS[route.id][`${layout}Placement`] === 'more')
    .sort((first, second) => (
      (ROUTE_PRESENTATIONS[first.id].moreOrder ?? Number.MAX_SAFE_INTEGER)
      - (ROUTE_PRESENTATIONS[second.id].moreOrder ?? Number.MAX_SAFE_INTEGER)
    ))
}

export function getUtilityRoutes(routes: readonly AppRoute[]): readonly AppRoute[] {
  return routes
    .filter((route) => (
      !route.hidden && ROUTE_PRESENTATIONS[route.id].desktopPlacement === 'utility'
    ))
    .sort((first, second) => (
      (ROUTE_PRESENTATIONS[first.id].utilityOrder ?? Number.MAX_SAFE_INTEGER)
      - (ROUTE_PRESENTATIONS[second.id].utilityOrder ?? Number.MAX_SAFE_INTEGER)
    ))
}
