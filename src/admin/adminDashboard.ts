import type { BrrrdleSupabaseClient } from '../account/supabaseClient'

export const ADMIN_OPERATIONAL_DASHBOARD_KEY = 'admin-operational-dashboard-v1' as const

export interface AdminOperationalDashboardSnapshot {
  readonly accountsTotal: number
  readonly asyncGamesActive: number
  readonly asyncGamesTerminal: number
  readonly dailyClaimsToday: number
  readonly dashboardKey: typeof ADMIN_OPERATIONAL_DASHBOARD_KEY
  readonly generatedAt: string
  readonly latestAsyncGameActivityAt?: string
  readonly latestPrivateRequestActivityAt?: string
  readonly latestRankedQueueActivityAt?: string
  readonly privateMatchRequestsPending: number
  readonly privateMatchRequestsTerminal: number
  readonly publicProfilesActivePublic: number
  readonly publicProfilesHiddenOrPrivate: number
  readonly publicProfilesSuspended: number
  readonly publicProfilesTotal: number
  readonly rankedProfilesEstablished: number
  readonly rankedProfilesTotal: number
  readonly rankedQueuePending: number
  readonly rankedQueueStaleCandidates: number
}

export interface AdminOperationalDashboardRepository {
  readonly loadAdminOperationalDashboard: () => Promise<AdminOperationalDashboardSnapshot | undefined>
}

const ADMIN_DASHBOARD_ALLOWED_KEYS = new Set([
  'accounts_total',
  'async_games_active',
  'async_games_terminal',
  'daily_claims_today',
  'dashboard_key',
  'generated_at',
  'latest_async_game_activity_at',
  'latest_private_request_activity_at',
  'latest_ranked_queue_activity_at',
  'private_match_requests_pending',
  'private_match_requests_terminal',
  'public_profiles_active_public',
  'public_profiles_hidden_or_private',
  'public_profiles_suspended',
  'public_profiles_total',
  'ranked_profiles_established',
  'ranked_profiles_total',
  'ranked_queue_pending',
  'ranked_queue_stale_candidates',
])

const FORBIDDEN_ADMIN_DASHBOARD_KEY_TOKENS = [
  'answer',
  'authid',
  'authuserid',
  'email',
  'matchid',
  'metadata',
  'opponentid',
  'playersession',
  'projection',
  'queueid',
  'raw',
  'ratingtransaction',
  'seed',
  'serializedsession',
  'session',
  'settlementid',
  'token',
  'transactionid',
  'userid',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePrivacyKey(key: string): string {
  return key.replace(/[^a-z0-9]/giu, '').toLowerCase()
}

function isAllowedAdminDashboardKey(key: string): boolean {
  if (!ADMIN_DASHBOARD_ALLOWED_KEYS.has(key)) {
    return false
  }
  const normalized = normalizePrivacyKey(key)
  return !FORBIDDEN_ADMIN_DASHBOARD_KEY_TOKENS.some((token) => normalized.includes(token))
}

function hasOnlyAdminDashboardKeys(record: Record<string, unknown>): boolean {
  return Object.keys(record).every(isAllowedAdminDashboardKey)
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function getCount(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : undefined
  }
  return undefined
}

function parseRequiredTimestamp(record: Record<string, unknown>, key: string): string | undefined {
  const value = getString(record, key)
  return value && !Number.isNaN(Date.parse(value)) ? value : undefined
}

function parseOptionalTimestamp(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === null || value === undefined) {
    return undefined
  }
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined
}

export function parseAdminOperationalDashboardDto(value: unknown): AdminOperationalDashboardSnapshot | undefined {
  if (!isRecord(value) || !hasOnlyAdminDashboardKeys(value)) {
    return undefined
  }

  const dashboardKey = getString(value, 'dashboard_key')
  const generatedAt = parseRequiredTimestamp(value, 'generated_at')
  const accountsTotal = getCount(value, 'accounts_total')
  const publicProfilesTotal = getCount(value, 'public_profiles_total')
  const publicProfilesActivePublic = getCount(value, 'public_profiles_active_public')
  const publicProfilesHiddenOrPrivate = getCount(value, 'public_profiles_hidden_or_private')
  const publicProfilesSuspended = getCount(value, 'public_profiles_suspended')
  const rankedProfilesTotal = getCount(value, 'ranked_profiles_total')
  const rankedProfilesEstablished = getCount(value, 'ranked_profiles_established')
  const rankedQueuePending = getCount(value, 'ranked_queue_pending')
  const rankedQueueStaleCandidates = getCount(value, 'ranked_queue_stale_candidates')
  const asyncGamesActive = getCount(value, 'async_games_active')
  const asyncGamesTerminal = getCount(value, 'async_games_terminal')
  const privateMatchRequestsPending = getCount(value, 'private_match_requests_pending')
  const privateMatchRequestsTerminal = getCount(value, 'private_match_requests_terminal')
  const dailyClaimsToday = getCount(value, 'daily_claims_today')
  const latestRankedQueueActivityAt = parseOptionalTimestamp(value, 'latest_ranked_queue_activity_at')
  const latestPrivateRequestActivityAt = parseOptionalTimestamp(value, 'latest_private_request_activity_at')
  const latestAsyncGameActivityAt = parseOptionalTimestamp(value, 'latest_async_game_activity_at')

  if (
    dashboardKey !== ADMIN_OPERATIONAL_DASHBOARD_KEY
    || !generatedAt
    || accountsTotal === undefined
    || publicProfilesTotal === undefined
    || publicProfilesActivePublic === undefined
    || publicProfilesHiddenOrPrivate === undefined
    || publicProfilesSuspended === undefined
    || rankedProfilesTotal === undefined
    || rankedProfilesEstablished === undefined
    || rankedQueuePending === undefined
    || rankedQueueStaleCandidates === undefined
    || asyncGamesActive === undefined
    || asyncGamesTerminal === undefined
    || privateMatchRequestsPending === undefined
    || privateMatchRequestsTerminal === undefined
    || dailyClaimsToday === undefined
    || publicProfilesActivePublic > publicProfilesTotal
    || publicProfilesSuspended > publicProfilesTotal
    || rankedProfilesEstablished > rankedProfilesTotal
    || rankedQueueStaleCandidates > rankedQueuePending
  ) {
    return undefined
  }

  return {
    accountsTotal,
    asyncGamesActive,
    asyncGamesTerminal,
    dailyClaimsToday,
    dashboardKey,
    generatedAt,
    latestAsyncGameActivityAt,
    latestPrivateRequestActivityAt,
    latestRankedQueueActivityAt,
    privateMatchRequestsPending,
    privateMatchRequestsTerminal,
    publicProfilesActivePublic,
    publicProfilesHiddenOrPrivate,
    publicProfilesSuspended,
    publicProfilesTotal,
    rankedProfilesEstablished,
    rankedProfilesTotal,
    rankedQueuePending,
    rankedQueueStaleCandidates,
  }
}

function firstParsedRow<T>(value: unknown, parser: (row: unknown) => T | undefined): T | undefined {
  if (!Array.isArray(value)) {
    return parser(value)
  }
  for (const row of value) {
    const parsed = parser(row)
    if (parsed) {
      return parsed
    }
  }
  return undefined
}

export function createSupabaseAdminOperationalDashboardRepository(
  client: BrrrdleSupabaseClient,
): AdminOperationalDashboardRepository {
  return {
    async loadAdminOperationalDashboard() {
      const { data, error } = await client.rpc('get_admin_operational_dashboard_v1')
      if (error) {
        return undefined
      }
      return firstParsedRow(data, parseAdminOperationalDashboardDto)
    },
  }
}
