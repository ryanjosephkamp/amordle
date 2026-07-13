import type { AuthState } from '../account/auth'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'
import { ErrorState, Panel } from '../ui'
import { AdminOperationalDashboard } from './AdminOperationalDashboard'
import type { AdminOperationalDashboardRepository } from './adminDashboard'
import { evaluateAdminAccess } from './authorization'
import { ManualRefreshControls } from './ManualRefreshControls'

interface AdminPanelProps {
  readonly adminDashboardRepository?: AdminOperationalDashboardRepository
  readonly authState: AuthState
  readonly supabaseClient?: BrrrdleSupabaseClient
}

const reasonMessages = {
  'missing-admin-role': 'Your Supabase account does not have the admin role required for developer operations.',
  'missing-authentication': 'Sign in with a Supabase account before using protected developer operations.',
  unconfigured: 'Supabase is not configured in this environment, so developer operations are unavailable.',
} as const

export function AdminPanel({ adminDashboardRepository, authState, supabaseClient }: AdminPanelProps) {
  const access = evaluateAdminAccess(authState)

  if (!access.allowed) {
    return <ErrorState message={reasonMessages[access.reason ?? 'missing-authentication']} title="Developer operations locked" />
  }

  return (
    <section className="space-y-4" aria-labelledby="admin-title">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">protected admin</p>
      <h2 id="admin-title" className="text-3xl font-bold text-white">Developer operations</h2>
      <Panel className="space-y-3 text-sm leading-6 text-slate-300" tone="muted">
        <p>Manual refresh requests must be sent through the protected `/api/admin-refresh` server route with a valid Supabase session.</p>
        <p>Operational dashboard requests must be enforced by Supabase admin checks. The browser never receives service-role credentials.</p>
      </Panel>
      <AdminOperationalDashboard repository={adminDashboardRepository} />
      <ManualRefreshControls supabase={supabaseClient} />
    </section>
  )
}
