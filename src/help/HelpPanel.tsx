import { Button, Panel } from '../ui'
import type { AppRouteId } from '../app/routes'

interface HelpPanelProps {
  readonly onNavigate?: (routeId: AppRouteId) => void
}

export function HelpPanel({ onNavigate }: HelpPanelProps) {
  return (
    <section className="space-y-5" aria-labelledby="help-title">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">Help</p>
        <h2 id="help-title" className="text-3xl font-bold text-white">Help and tutorials</h2>
        <p className="max-w-3xl text-base leading-7 text-slate-300">
          This route is being rebuilt into a clearer beginner guide. For now, use About for rules and boundaries, Settings for preferences, and Feedback when something looks off.
        </p>
      </div>

      <Panel className="space-y-4 text-sm leading-6 text-slate-300" tone="muted">
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">Guide under construction</h3>
          <p>
            The full tutorial will return in a later phase with better structure and fewer noisy shortcuts. This placeholder does not save settings, claim a Daily game, join a queue, create a match, or change gameplay.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onNavigate ? (
            <>
              <Button onClick={() => onNavigate('about')} size="sm" variant="secondary">Open About</Button>
              <Button onClick={() => onNavigate('settings')} size="sm" variant="secondary">Open Settings</Button>
              <Button onClick={() => onNavigate('feedback')} size="sm" variant="ghost">Send Feedback</Button>
            </>
          ) : null}
        </div>
      </Panel>
    </section>
  )
}
