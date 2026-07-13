import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AdminOperationalDashboardSnapshot } from './adminDashboard'
import { AdminOperationalDashboardView } from './AdminOperationalDashboard'

const DASHBOARD: AdminOperationalDashboardSnapshot = {
  accountsTotal: 20,
  asyncGamesActive: 5,
  asyncGamesTerminal: 101,
  dailyClaimsToday: 9,
  dashboardKey: 'admin-operational-dashboard-v1',
  generatedAt: '2026-07-03T16:22:00.000Z',
  latestAsyncGameActivityAt: '2026-07-03T16:19:00.000Z',
  latestPrivateRequestActivityAt: '2026-07-03T16:18:00.000Z',
  latestRankedQueueActivityAt: '2026-07-03T16:17:00.000Z',
  privateMatchRequestsPending: 2,
  privateMatchRequestsTerminal: 12,
  publicProfilesActivePublic: 8,
  publicProfilesHiddenOrPrivate: 3,
  publicProfilesSuspended: 1,
  publicProfilesTotal: 12,
  rankedProfilesEstablished: 7,
  rankedProfilesTotal: 10,
  rankedQueuePending: 3,
  rankedQueueStaleCandidates: 1,
}

describe('AdminOperationalDashboardView', () => {
  it('renders unavailable, loading, and error states without private data', () => {
    const unavailable = renderToStaticMarkup(<AdminOperationalDashboardView status="idle" />)
    const loading = renderToStaticMarkup(<AdminOperationalDashboardView status="loading" />)
    const error = renderToStaticMarkup(<AdminOperationalDashboardView status="error" />)

    expect(unavailable).toContain('Supabase is not configured')
    expect(loading).toContain('Loading admin operational dashboard')
    expect(error).toContain('Unable to load the admin operational dashboard')
    for (const html of [unavailable, loading, error]) {
      expect(html).not.toContain('user_id')
      expect(html).not.toContain('email')
      expect(html).not.toContain('session')
      expect(html).not.toContain('token')
      expect(html).not.toContain('serialized_session')
    }
  })

  it('renders admin aggregate counts without raw operational identifiers', () => {
    const html = renderToStaticMarkup(
      <AdminOperationalDashboardView dashboard={DASHBOARD} status="ready" />,
    )

    expect(html).toContain('Operational dashboard')
    expect(html).toContain('Accounts')
    expect(html).toContain('Active public profiles')
    expect(html).toContain('Pending ranked queue')
    expect(html).toContain('Stale queue candidates')
    expect(html).toContain('Pending private requests')
    expect(html).toContain('Daily claims today')
    expect(html).toContain('20')
    expect(html).toContain('101')
    expect(html).not.toContain(DASHBOARD.dashboardKey)
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('email')
    expect(html).not.toContain('queue_id')
    expect(html).not.toContain('rating_transaction_id')
  })
})
