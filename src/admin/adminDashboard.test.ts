import { describe, expect, it, vi } from 'vitest'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'
import {
  createSupabaseAdminOperationalDashboardRepository,
  parseAdminOperationalDashboardDto,
} from './adminDashboard'

const ADMIN_DASHBOARD_ROW = {
  accounts_total: 20,
  async_games_active: 5,
  async_games_terminal: 101,
  daily_claims_today: 9,
  dashboard_key: 'admin-operational-dashboard-v1',
  generated_at: '2026-07-03T16:22:00.000Z',
  latest_async_game_activity_at: '2026-07-03T16:19:00.000Z',
  latest_private_request_activity_at: '2026-07-03T16:18:00.000Z',
  latest_ranked_queue_activity_at: '2026-07-03T16:17:00.000Z',
  private_match_requests_pending: 2,
  private_match_requests_terminal: 12,
  public_profiles_active_public: 8,
  public_profiles_hidden_or_private: 3,
  public_profiles_suspended: 1,
  public_profiles_total: 12,
  ranked_profiles_established: 7,
  ranked_profiles_total: 10,
  ranked_queue_pending: 3,
  ranked_queue_stale_candidates: 1,
}

function client(rpc: ReturnType<typeof vi.fn>): BrrrdleSupabaseClient {
  return { rpc } as unknown as BrrrdleSupabaseClient
}

describe('admin operational dashboard DTO parsing', () => {
  it('parses the allow-listed admin aggregate RPC row shape', () => {
    expect(parseAdminOperationalDashboardDto(ADMIN_DASHBOARD_ROW)).toEqual({
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
    })
  })

  it('accepts bigint strings and nullable operational timestamps', () => {
    expect(parseAdminOperationalDashboardDto({
      ...ADMIN_DASHBOARD_ROW,
      accounts_total: '20',
      latest_async_game_activity_at: null,
      latest_private_request_activity_at: null,
      latest_ranked_queue_activity_at: null,
      ranked_queue_pending: '3',
    })).toMatchObject({
      accountsTotal: 20,
      latestAsyncGameActivityAt: undefined,
      latestPrivateRequestActivityAt: undefined,
      latestRankedQueueActivityAt: undefined,
      rankedQueuePending: 3,
    })
  })

  it('rejects forbidden/private fields and impossible aggregates', () => {
    expect(parseAdminOperationalDashboardDto({ ...ADMIN_DASHBOARD_ROW, user_id: 'raw-auth-id' })).toBeUndefined()
    expect(parseAdminOperationalDashboardDto({ ...ADMIN_DASHBOARD_ROW, email: 'admin@example.invalid' })).toBeUndefined()
    expect(parseAdminOperationalDashboardDto({ ...ADMIN_DASHBOARD_ROW, session: 'browser-session' })).toBeUndefined()
    expect(parseAdminOperationalDashboardDto({ ...ADMIN_DASHBOARD_ROW, token: 'secret-shaped' })).toBeUndefined()
    expect(parseAdminOperationalDashboardDto({ ...ADMIN_DASHBOARD_ROW, generated_at: 'not-a-date' })).toBeUndefined()
    expect(parseAdminOperationalDashboardDto({ ...ADMIN_DASHBOARD_ROW, ranked_queue_pending: 0, ranked_queue_stale_candidates: 1 })).toBeUndefined()
  })
})

describe('createSupabaseAdminOperationalDashboardRepository', () => {
  it('calls the authenticated admin aggregate dashboard RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [ADMIN_DASHBOARD_ROW], error: null })
    const repository = createSupabaseAdminOperationalDashboardRepository(client(rpc))

    await expect(repository.loadAdminOperationalDashboard()).resolves.toMatchObject({ dashboardKey: 'admin-operational-dashboard-v1' })
    expect(rpc).toHaveBeenCalledWith('get_admin_operational_dashboard_v1')
  })

  it('returns undefined for denial/error responses and corrupt payloads', async () => {
    const deniedRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Admin dashboard access denied.' } })
    const corruptRpc = vi.fn().mockResolvedValue({ data: [{ ...ADMIN_DASHBOARD_ROW, auth_user_id: 'raw-auth-id' }], error: null })

    await expect(createSupabaseAdminOperationalDashboardRepository(client(deniedRpc)).loadAdminOperationalDashboard()).resolves.toBeUndefined()
    await expect(createSupabaseAdminOperationalDashboardRepository(client(corruptRpc)).loadAdminOperationalDashboard()).resolves.toBeUndefined()
  })
})
