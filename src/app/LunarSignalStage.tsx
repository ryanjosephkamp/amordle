import type { ReactNode } from 'react'
import { DEFAULT_SURFACE_THEME, type SurfaceTheme } from '../theme'
import type { RouteAttentionMap } from './attentionViewModels'
import type { AppRoute, AppRouteId } from './routes'

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
  readonly onFocusModeChange?: (enabled: boolean) => void
  readonly progressionHud?: ReactNode
  readonly routeAttention?: RouteAttentionMap
  readonly routes: readonly AppRoute[]
  readonly surfaceTheme?: SurfaceTheme
}

function getRouteEyebrow(route: AppRoute): string {
  switch (route.id) {
    case 'calendar':
    case 'og-daily':
    case 'go-daily':
      return 'Daily'
    case 'practice':
      return 'Practice'
    case 'multiplayer':
      return 'Multiplayer'
    case 'leaderboard':
      return 'Ranked'
    case 'word-explorer':
      return 'Library'
    case 'profile':
      return 'Account'
    case 'feedback':
      return 'Contact'
    case 'definitions':
      return 'Reference'
    case 'stats':
      return 'Progress'
    case 'settings':
      return 'Controls'
    case 'about':
      return 'Info'
    case 'admin':
      return 'Admin'
    default:
      return 'Deck'
  }
}

/**
 * Functional-shell chrome. The historical component name remains stable so
 * route wiring and tests do not need to know that the expensive signal canvas,
 * cursor tracking, decorative layers, and dormant selector were retired.
 */
export function LunarSignalStage({
  accountControls,
  activeRoute,
  children,
  commandTitle = 'Command Center',
  dailyCountdown,
  focusModeEnabled = false,
  onNavigate,
  onFocusModeChange,
  progressionHud,
  routeAttention,
  routes,
  surfaceTheme = DEFAULT_SURFACE_THEME,
}: LunarSignalStageProps) {
  return (
    <div
      className={`brrrdle-lunar-shell min-h-svh min-h-dvh text-white is-awake ${focusModeEnabled ? 'is-focus-mode' : ''}`}
      data-surface={surfaceTheme}
    >
      <div className="brrrdle-lunar-interface">
        <header className="brrrdle-lunar-topbar" aria-label="amordle controls">
          <button className="brrrdle-lunar-brand" onClick={() => onNavigate('home')} type="button">
            <span>amordle</span>
            <small>{commandTitle}</small>
          </button>

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
            {progressionHud}
            {dailyCountdown}
          </div>
        </header>

        <main className="brrrdle-lunar-grid">
          <nav aria-label="amordle destinations" className="brrrdle-lunar-rail">
            {routes.map((route) => {
              const isActive = route.id === activeRoute.id
              const attention = routeAttention?.[route.id]
              const attentionDescriptionId = attention ? `shell-route-${route.id}-attention` : undefined

              return (
                <button
                  aria-current={isActive ? 'page' : undefined}
                  aria-describedby={attentionDescriptionId}
                  aria-label={route.shortLabel}
                  className="brrrdle-lunar-rail-button"
                  key={route.id}
                  onClick={() => onNavigate(route.id)}
                  type="button"
                >
                  <span className="brrrdle-lunar-rail-light" aria-hidden="true" />
                  <span>
                    <strong>{route.shortLabel}</strong>
                    <small>{getRouteEyebrow(route)}</small>
                  </span>
                  {attention ? (
                    <>
                      <span className="sr-only" id={attentionDescriptionId}>{attention.ariaLabel}</span>
                      <span aria-hidden="true" className="brrrdle-attention-badge" data-tone={attention.tone}>{attention.label}</span>
                    </>
                  ) : null}
                </button>
              )
            })}
          </nav>

          <section className="brrrdle-lunar-playfield" aria-labelledby="active-route-title">
            <div className="brrrdle-lunar-route-head">
              <div>
                <p>Current tab</p>
                <h1 id="active-route-title">{activeRoute.label}</h1>
                <span>{activeRoute.description}</span>
              </div>
            </div>
            <div className="brrrdle-lunar-route-body">{children}</div>
          </section>
        </main>
      </div>
    </div>
  )
}
