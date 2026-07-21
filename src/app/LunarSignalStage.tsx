import { useState, type ReactNode } from 'react'
import { AmordleIcon, Dialog } from '../ui'
import { DEFAULT_SURFACE_THEME, type SurfaceTheme } from '../theme'
import type { AttentionCueViewModel, RouteAttentionMap } from './attentionViewModels'
import type { SoloSubtabId } from './navigationState'
import type { AppRoute, AppRouteId } from './routes'
import {
  ROUTE_PRESENTATIONS,
  SHELL_DESTINATIONS,
  getActiveShellDestinationId,
  getMoreRoutes,
  getRouteDisplayLabel,
  getUtilityRoutes,
  resolveShellNavigationIntent,
  type ShellDestination,
  type ShellLayout,
  type ShellNavigationIntent,
} from './shell/routePresentation'

interface SignalMetric {
  readonly label: string
  readonly value: ReactNode
}

interface LunarSignalStageProps {
  readonly accountControls: ReactNode
  readonly activeRoute: AppRoute
  readonly children: ReactNode
  readonly commandTitle?: string
  readonly dailyCountdown?: ReactNode
  readonly metrics: readonly SignalMetric[]
  readonly focusModeEnabled?: boolean
  readonly onNavigate: (routeId: AppRouteId) => void
  readonly onShellNavigate: (intent: ShellNavigationIntent) => void
  readonly onFocusModeChange?: (enabled: boolean) => void
  readonly progressionHud?: ReactNode
  readonly routeAttention?: RouteAttentionMap
  readonly routes: readonly AppRoute[]
  readonly soloSubtab: SoloSubtabId
  readonly surfaceTheme?: SurfaceTheme
}

interface AttentionBadgeProps {
  readonly attention: AttentionCueViewModel
  readonly descriptionId: string
}

function AttentionBadge({ attention, descriptionId }: AttentionBadgeProps) {
  return (
    <>
      <span className="sr-only" id={descriptionId}>{attention.ariaLabel}</span>
      <span
        aria-hidden="true"
        className="brrrdle-attention-badge"
        data-tone={attention.tone}
      >
        {attention.label}
      </span>
    </>
  )
}

interface DestinationNavigationProps {
  readonly activeRouteId: AppRouteId
  readonly layout: ShellLayout
  readonly onActivate: (destination: ShellDestination) => void
  readonly routeAttention?: RouteAttentionMap
  readonly soloSubtab: SoloSubtabId
}

function DestinationNavigation({
  activeRouteId,
  layout,
  onActivate,
  routeAttention,
  soloSubtab,
}: DestinationNavigationProps) {
  const activeDestinationId = getActiveShellDestinationId(activeRouteId, soloSubtab, layout)
  const isDesktop = layout === 'desktop'

  return (
    <nav
      aria-label={isDesktop ? 'Primary destinations' : 'Mobile destinations'}
      className={isDesktop ? 'brrrdle-lunar-rail' : 'brrrdle-mobile-dock'}
    >
      {SHELL_DESTINATIONS[layout].map((destination) => {
        const isActive = destination.id === activeDestinationId
        const attention = destination.attentionRouteId
          ? routeAttention?.[destination.attentionRouteId]
          : undefined
        const attentionDescriptionId = attention
          ? `shell-${layout}-${destination.id}-attention`
          : undefined

        return (
          <button
            aria-current={isActive ? 'page' : undefined}
            aria-describedby={attentionDescriptionId}
            aria-label={destination.label}
            className={isDesktop ? 'brrrdle-lunar-rail-button' : 'brrrdle-mobile-dock-button'}
            key={destination.id}
            onClick={() => onActivate(destination)}
            type="button"
          >
            <AmordleIcon name={destination.icon} size={isDesktop ? 21 : 19} />
            <span className="brrrdle-shell-destination-label">{destination.label}</span>
            {attention && attentionDescriptionId ? (
              <AttentionBadge attention={attention} descriptionId={attentionDescriptionId} />
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

interface MoreRouteListProps {
  readonly activeRouteId: AppRouteId
  readonly layout: ShellLayout
  readonly onNavigate: (routeId: AppRouteId) => void
  readonly routeAttention?: RouteAttentionMap
  readonly routes: readonly AppRoute[]
}

function MoreRouteList({
  activeRouteId,
  layout,
  onNavigate,
  routeAttention,
  routes,
}: MoreRouteListProps) {
  return (
    <div className={`brrrdle-more-route-list brrrdle-more-route-list-${layout}`}>
      {getMoreRoutes(routes, layout).map((route) => {
        const presentation = ROUTE_PRESENTATIONS[route.id]
        const attention = routeAttention?.[route.id]
        const attentionDescriptionId = attention
          ? `shell-more-${layout}-${route.id}-attention`
          : undefined

        return (
          <button
            aria-current={route.id === activeRouteId ? 'page' : undefined}
            aria-describedby={attentionDescriptionId}
            aria-label={presentation.label}
            className="brrrdle-more-route-button"
            key={route.id}
            onClick={() => onNavigate(route.id)}
            type="button"
          >
            <AmordleIcon name={presentation.icon} />
            <span>
              <strong>{presentation.label}</strong>
              <small>{route.description}</small>
            </span>
            {attention && attentionDescriptionId ? (
              <AttentionBadge attention={attention} descriptionId={attentionDescriptionId} />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Global Wave 02 shell. The historical component name remains stable so the
 * route and gameplay tree stays mounted while its presentation is transformed.
 */
export function LunarSignalStage({
  accountControls,
  activeRoute,
  children,
  commandTitle = 'Command Center',
  dailyCountdown,
  focusModeEnabled = false,
  onNavigate,
  onShellNavigate,
  onFocusModeChange,
  progressionHud,
  routeAttention,
  routes,
  soloSubtab,
  surfaceTheme = DEFAULT_SURFACE_THEME,
}: LunarSignalStageProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const utilityRoutes = getUtilityRoutes(routes)
  const routeTitle = getRouteDisplayLabel(activeRoute.id, soloSubtab)

  function handleDestinationActivate(destination: ShellDestination) {
    if (destination.id === 'more') {
      setMoreOpen(true)
      return
    }
    const intent = resolveShellNavigationIntent(destination.id)
    if (intent) {
      onShellNavigate(intent)
    }
  }

  function handleMoreNavigate(routeId: AppRouteId) {
    setMoreOpen(false)
    onNavigate(routeId)
  }

  return (
    <div
      className={`brrrdle-lunar-shell min-h-svh min-h-dvh text-white is-awake ${focusModeEnabled ? 'is-focus-mode' : ''}`}
      data-surface={surfaceTheme}
    >
      <div aria-hidden="true" className="brrrdle-shell-atmosphere" />
      <div className="brrrdle-lunar-interface">
        <header className="brrrdle-lunar-topbar" aria-label="amordle controls">
          <button
            aria-label="amordle Home"
            className="brrrdle-lunar-brand"
            onClick={() => onNavigate('home')}
            type="button"
          >
            <span>amordle</span>
            <small>{commandTitle}</small>
          </button>

          <div aria-label="Utility destinations" className="brrrdle-lunar-utility" role="navigation">
            {utilityRoutes.map((route) => {
              const presentation = ROUTE_PRESENTATIONS[route.id]
              return (
                <button
                  aria-current={activeRoute.id === route.id ? 'page' : undefined}
                  aria-label={presentation.label}
                  className="brrrdle-lunar-utility-button"
                  key={route.id}
                  onClick={() => onNavigate(route.id)}
                  type="button"
                >
                  <AmordleIcon name={presentation.icon} size={18} />
                  <span>{presentation.label}</span>
                </button>
              )
            })}
          </div>

          {onFocusModeChange ? (
            <button
              aria-label={focusModeEnabled ? 'Exit focus mode and restore the full shell' : 'Enter focus mode'}
              aria-pressed={focusModeEnabled}
              className="brrrdle-lunar-focus-toggle"
              onClick={() => onFocusModeChange(!focusModeEnabled)}
              type="button"
            >
              {focusModeEnabled ? 'Exit focus' : 'Focus'}
            </button>
          ) : null}

          <div className="brrrdle-lunar-account-stack">
            <div className="brrrdle-lunar-account">{accountControls}</div>
            <div className="brrrdle-lunar-progression-context">{progressionHud}</div>
            <div className="brrrdle-lunar-time-context">{dailyCountdown}</div>
          </div>
        </header>

        <main className="brrrdle-lunar-grid">
          <DestinationNavigation
            activeRouteId={activeRoute.id}
            layout="desktop"
            onActivate={handleDestinationActivate}
            routeAttention={routeAttention}
            soloSubtab={soloSubtab}
          />

          <section className="brrrdle-lunar-playfield" aria-labelledby="active-route-title">
            <div className="brrrdle-lunar-route-head">
              <div>
                <p>Current destination</p>
                <h1 id="active-route-title">{routeTitle}</h1>
                <span>{activeRoute.description}</span>
              </div>
            </div>
            <div className="brrrdle-lunar-route-body">{children}</div>
          </section>
        </main>

        <DestinationNavigation
          activeRouteId={activeRoute.id}
          layout="mobile"
          onActivate={handleDestinationActivate}
          routeAttention={routeAttention}
          soloSubtab={soloSubtab}
        />
      </div>

      <Dialog
        description="Open another amordle destination. Hidden compatibility routes and protected destinations are not listed."
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More destinations"
      >
        <MoreRouteList
          activeRouteId={activeRoute.id}
          layout="desktop"
          onNavigate={handleMoreNavigate}
          routeAttention={routeAttention}
          routes={routes}
        />
        <MoreRouteList
          activeRouteId={activeRoute.id}
          layout="mobile"
          onNavigate={handleMoreNavigate}
          routeAttention={routeAttention}
          routes={routes}
        />
      </Dialog>
    </div>
  )
}
