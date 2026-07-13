import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getE2eEnv } from './env'
import type { E2eUser } from './testUsers'

interface AsyncMultiplayerGameRow {
  readonly current_turn?: string
  readonly id: string
  readonly mode?: string
  readonly player_one_user_id?: string
  readonly player_two_user_id?: string
  readonly projection?: unknown
  readonly scope?: string
  readonly status?: string
  readonly winner_player_id?: string | null
}

interface PrivateMatchRequestRow {
  readonly id: string
}

interface RankedQueueRow {
  readonly expires_at?: string | null
  readonly hard_mode?: boolean | null
  readonly id: string
  readonly matched_game_id?: string | null
  readonly matched_match_id?: string | null
  readonly mode?: string
  readonly queued_at?: string
  readonly rating_bucket?: string
  readonly scope?: string
  readonly status?: string
  readonly time_limit_ms?: number | null
  readonly user_id?: string
  readonly word_length?: number | null
}

interface AuthUserReference {
  readonly created_at?: string
  readonly email?: string
  readonly id?: string
  readonly user_metadata?: {
    readonly displayName?: string
    readonly display_name?: string
  }
}

interface MatchResultReferenceRow {
  readonly id?: string
  readonly match_result_id?: string
}

interface RatingProfileReferenceRow {
  readonly bucket?: string
  readonly user_id?: string
}

interface RankedDailyAuthorityCleanupRow {
  readonly action_rows_deleted?: number
  readonly authority_rows_deleted?: number
  readonly reservation_rows_deleted?: number
}

export function createAnonSupabaseClient(): SupabaseClient {
  const env = getE2eEnv()
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function createAuthenticatedSupabaseClient(user: E2eUser): Promise<SupabaseClient> {
  const client = createAnonSupabaseClient()
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  })
  if (error) {
    throw new Error(`Unable to authenticate E2E Supabase client for ${user.label}: ${error.message}`)
  }
  return client
}

export function createAdminSupabaseClient(): SupabaseClient {
  const env = getE2eEnv()
  if (!env.supabaseServiceRoleKey) {
    throw new Error('E2E_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY is required for admin cleanup.')
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function cleanupRankedDailyMultiplayerForUsers(userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) {
    return 0
  }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin.rpc('cleanup_ranked_daily_multiplayer_for_users', {
    p_user_ids: [...userIds],
  })
  if (error) {
    throw new Error(`Unable to delete temporary ranked Daily authority rows: ${error.message}`)
  }
  const row = (Array.isArray(data) ? data[0] : data) as RankedDailyAuthorityCleanupRow | null
  if (!row) {
    throw new Error('Ranked Daily authority cleanup returned no result.')
  }
  const counts = [row.action_rows_deleted, row.authority_rows_deleted, row.reservation_rows_deleted]
  if (counts.some((value) => !Number.isInteger(value) || (value ?? -1) < 0)) {
    throw new Error('Ranked Daily authority cleanup returned invalid counts.')
  }
  return counts.reduce((total, value) => total + (value ?? 0), 0)
}

export async function deletePrivateMatchRequestsForUsers(userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) {
    return 0
  }

  const admin = createAdminSupabaseClient()
  const requestIds = new Set<string>()
  for (const column of ['requester_user_id', 'opponent_user_id'] as const) {
    const { data, error } = await admin
      .from('multiplayer_private_match_requests')
      .select('id')
      .in(column, [...userIds])
    if (error) {
      throw new Error(`Unable to inspect ${column} private match requests for cleanup: ${error.message}`)
    }
    for (const row of (data ?? []) as readonly PrivateMatchRequestRow[]) {
      requestIds.add(row.id)
    }
  }

  if (requestIds.size === 0) {
    return 0
  }

  const { error } = await admin
    .from('multiplayer_private_match_requests')
    .delete()
    .in('id', [...requestIds])
  if (error) {
    throw new Error(`Unable to delete temporary private match requests: ${error.message}`)
  }

  return requestIds.size
}

export async function deleteRankedQueueRowsForUsers(userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) {
    return 0
  }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('multiplayer_matchmaking_queue')
    .select('id')
    .in('user_id', [...userIds])
  if (error) {
    throw new Error(`Unable to inspect ranked queue rows for cleanup: ${error.message}`)
  }

  const rowIds = (data ?? [])
    .map((row) => typeof row.id === 'string' ? row.id : undefined)
    .filter((id): id is string => Boolean(id))
  if (rowIds.length === 0) {
    return 0
  }

  const { error: deleteError } = await admin
    .from('multiplayer_matchmaking_queue')
    .delete()
    .in('id', rowIds)
  if (deleteError) {
    throw new Error(`Unable to delete temporary ranked queue rows: ${deleteError.message}`)
  }

  return rowIds.length
}

export async function fetchStaleE2eUsers({
  olderThanMs,
}: {
  readonly olderThanMs: number
}): Promise<readonly E2eUser[]> {
  const admin = createAdminSupabaseClient()
  const cutoffMs = Date.now() - olderThanMs
  const staleUsers: E2eUser[] = []
  let page = 1

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      throw new Error(`Unable to inspect temporary E2E auth users for cleanup: ${error.message}`)
    }

    const users = (data?.users ?? []) as readonly AuthUserReference[]
    for (const user of users) {
      const email = typeof user.email === 'string' ? user.email.toLocaleLowerCase('en-US') : ''
      const createdAtMs = Date.parse(typeof user.created_at === 'string' ? user.created_at : '')
      if (
        typeof user.id === 'string'
        && email.startsWith('brrrdle-e2e-')
        && Number.isFinite(createdAtMs)
        && createdAtMs < cutoffMs
      ) {
        staleUsers.push({
          displayName: user.user_metadata?.displayName ?? user.user_metadata?.display_name ?? 'Stale E2E user',
          email,
          id: user.id,
          label: 'stale',
          password: '',
        })
      }
    }

    if (users.length < 1000) {
      break
    }
    page += 1
  }

  return staleUsers
}

export async function deleteOrphanedQueuedRankedQueueRows(): Promise<number> {
  const admin = createAdminSupabaseClient()
  const knownUserIds = new Set<string>()
  let page = 1

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) {
      throw new Error(`Unable to inspect auth users before orphaned ranked queue cleanup: ${error.message}`)
    }

    const users = (data?.users ?? []) as readonly AuthUserReference[]
    for (const user of users) {
      if (typeof user.id === 'string') {
        knownUserIds.add(user.id)
      }
    }

    if (users.length < 1000) {
      break
    }
    page += 1
  }

  const { data, error } = await admin
    .from('multiplayer_matchmaking_queue')
    .select('id, user_id')
    .eq('status', 'queued')
  if (error) {
    throw new Error(`Unable to inspect queued ranked rows for orphan cleanup: ${error.message}`)
  }

  const orphanedIds = ((data ?? []) as readonly RankedQueueRow[])
    .filter((row) => typeof row.id === 'string' && typeof row.user_id === 'string' && !knownUserIds.has(row.user_id))
    .map((row) => row.id)

  if (orphanedIds.length === 0) {
    return 0
  }

  const { error: deleteError } = await admin
    .from('multiplayer_matchmaking_queue')
    .delete()
    .in('id', orphanedIds)
  if (deleteError) {
    throw new Error(`Unable to delete orphaned ranked queue rows: ${deleteError.message}`)
  }

  return orphanedIds.length
}

export async function deleteRankedRatingRowsForUsers(userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) {
    return 0
  }

  const admin = createAdminSupabaseClient()
  const matchResultIds = new Set<string>()
  const ratingTransactionIds = new Set<string>()

  const { data: playerResults, error: playerResultsError } = await admin
    .from('multiplayer_player_results')
    .select('match_result_id')
    .in('user_id', [...userIds])
  if (playerResultsError) {
    throw new Error(`Unable to inspect ranked player results for cleanup: ${playerResultsError.message}`)
  }
  for (const row of (playerResults ?? []) as readonly MatchResultReferenceRow[]) {
    if (typeof row.match_result_id === 'string') {
      matchResultIds.add(row.match_result_id)
    }
  }

  for (const column of ['user_id', 'opponent_user_id'] as const) {
    const { data, error } = await admin
      .from('multiplayer_rating_transactions')
      .select('id, match_result_id')
      .in(column, [...userIds])
    if (error) {
      throw new Error(`Unable to inspect ${column} rating transactions for cleanup: ${error.message}`)
    }
    for (const row of (data ?? []) as readonly MatchResultReferenceRow[]) {
      if (typeof row.id === 'string') {
        ratingTransactionIds.add(row.id)
      }
      if (typeof row.match_result_id === 'string') {
        matchResultIds.add(row.match_result_id)
      }
    }
  }

  const { data: profiles, error: profilesError } = await admin
    .from('multiplayer_rating_profiles')
    .select('user_id, bucket')
    .in('user_id', [...userIds])
  if (profilesError) {
    throw new Error(`Unable to inspect ranked rating profiles for cleanup: ${profilesError.message}`)
  }

  if (matchResultIds.size > 0) {
    const { error } = await admin
      .from('multiplayer_match_results')
      .delete()
      .in('id', [...matchResultIds])
    if (error) {
      throw new Error(`Unable to delete temporary ranked match results: ${error.message}`)
    }
  }

  if (ratingTransactionIds.size > 0) {
    const { error } = await admin
      .from('multiplayer_rating_transactions')
      .delete()
      .in('id', [...ratingTransactionIds])
    if (error) {
      throw new Error(`Unable to delete temporary ranked rating transactions: ${error.message}`)
    }
  }

  const profileCount = ((profiles ?? []) as readonly RatingProfileReferenceRow[]).length
  if (profileCount > 0) {
    const { error } = await admin
      .from('multiplayer_rating_profiles')
      .delete()
      .in('user_id', [...userIds])
    if (error) {
      throw new Error(`Unable to delete temporary ranked rating profiles: ${error.message}`)
    }
  }

  return matchResultIds.size + ratingTransactionIds.size + profileCount
}

export async function deleteMultiplayerRowsForUsers(userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) {
    return 0
  }

  const admin = createAdminSupabaseClient()
  const rowIds = new Set<string>()
  for (const column of ['player_one_user_id', 'player_two_user_id'] as const) {
    const { data, error } = await admin
      .from('async_multiplayer_games')
      .select('id')
      .in(column, [...userIds])
    if (error) {
      throw new Error(`Unable to inspect ${column} multiplayer rows for cleanup: ${error.message}`)
    }
    for (const row of (data ?? []) as readonly AsyncMultiplayerGameRow[]) {
      rowIds.add(row.id)
    }
  }

  if (rowIds.size === 0) {
    return 0
  }

  const { error } = await admin
    .from('async_multiplayer_games')
    .delete()
    .in('id', [...rowIds])
  if (error) {
    throw new Error(`Unable to delete temporary multiplayer rows: ${error.message}`)
  }

  return rowIds.size
}

export async function fetchMultiplayerRowsForUsers(userIds: readonly string[]) {
  if (userIds.length === 0) {
    return []
  }

  const admin = createAdminSupabaseClient()
  const rows = []
  for (const column of ['player_one_user_id', 'player_two_user_id'] as const) {
    const { data, error } = await admin
      .from('async_multiplayer_games')
      .select('id, mode, scope, status, current_turn, winner_player_id, player_one_user_id, player_two_user_id, projection')
      .in(column, [...userIds])
    if (error) {
      throw new Error(`Unable to inspect ${column} multiplayer rows: ${error.message}`)
    }
    rows.push(...(data ?? []))
  }

  const seen = new Set<string>()
  return rows.filter((row) => {
    const id = typeof row.id === 'string' ? row.id : undefined
    if (!id || seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}

function hasExactPlayerUserIds(row: AsyncMultiplayerGameRow, userIds: readonly string[]): boolean {
  if (userIds.length !== 2 || !row.player_one_user_id || !row.player_two_user_id) {
    return false
  }
  const expected = [...userIds].sort()
  const actual = [row.player_one_user_id, row.player_two_user_id].sort()
  return actual[0] === expected[0] && actual[1] === expected[1]
}

export async function waitForMultiplayerRowForUsers({
  mode,
  scope,
  status,
  timeoutMs = 20_000,
  userIds,
}: {
  readonly mode?: 'go' | 'og'
  readonly scope?: 'daily' | 'practice'
  readonly status?: string
  readonly timeoutMs?: number
  readonly userIds: readonly string[]
}): Promise<AsyncMultiplayerGameRow> {
  const startedAt = Date.now()
  let latestRows: readonly AsyncMultiplayerGameRow[] = []
  while (Date.now() - startedAt < timeoutMs) {
    latestRows = await fetchMultiplayerRowsForUsers(userIds) as readonly AsyncMultiplayerGameRow[]
    const match = latestRows.find((row) => (
      (!mode || row.mode === mode)
      && (!scope || row.scope === scope)
      && (!status || row.status === status)
    ))
    if (match) {
      return match
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for multiplayer row. Last rows: ${latestRows.map((row) => `${row.id}:${row.scope}:${row.mode}:${row.status}`).join(', ') || 'none'}`)
}

export async function waitForMultiplayerRowByIdForUsers({
  id,
  mode,
  scope,
  status,
  timeoutMs = 20_000,
  userIds,
}: {
  readonly id: string
  readonly mode?: 'go' | 'og'
  readonly scope?: 'daily' | 'practice'
  readonly status?: string
  readonly timeoutMs?: number
  readonly userIds: readonly string[]
}): Promise<AsyncMultiplayerGameRow> {
  const startedAt = Date.now()
  let latestRows: readonly AsyncMultiplayerGameRow[] = []
  while (Date.now() - startedAt < timeoutMs) {
    latestRows = await fetchMultiplayerRowsForUsers(userIds) as readonly AsyncMultiplayerGameRow[]
    const match = latestRows.find((row) => (
      row.id === id
      && (!mode || row.mode === mode)
      && (!scope || row.scope === scope)
      && (!status || row.status === status)
    ))
    if (match) {
      return match
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for multiplayer row ${id}. Last rows: ${latestRows.map((row) => `${row.id}:${row.scope}:${row.mode}:${row.status}`).join(', ') || 'none'}`)
}

export async function waitForMultiplayerRowForExactUsers({
  mode,
  scope,
  status,
  timeoutMs = 20_000,
  userIds,
}: {
  readonly mode?: 'go' | 'og'
  readonly scope?: 'daily' | 'practice'
  readonly status?: string
  readonly timeoutMs?: number
  readonly userIds: readonly [string, string]
}): Promise<AsyncMultiplayerGameRow> {
  const startedAt = Date.now()
  let latestRows: readonly AsyncMultiplayerGameRow[] = []
  while (Date.now() - startedAt < timeoutMs) {
    latestRows = await fetchMultiplayerRowsForUsers(userIds) as readonly AsyncMultiplayerGameRow[]
    const match = latestRows.find((row) => (
      hasExactPlayerUserIds(row, userIds)
      && (!mode || row.mode === mode)
      && (!scope || row.scope === scope)
      && (!status || row.status === status)
    ))
    if (match) {
      return match
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for exact-player multiplayer row. Last rows: ${latestRows.map((row) => `${row.scope}:${row.mode}:${row.status}`).join(', ') || 'none'}`)
}

export async function fetchRankedQueueRowsForUsers(userIds: readonly string[]): Promise<readonly RankedQueueRow[]> {
  if (userIds.length === 0) {
    return []
  }

  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('multiplayer_matchmaking_queue')
    .select('id, user_id, mode, scope, word_length, hard_mode, rating_bucket, status, matched_game_id, matched_match_id, queued_at, expires_at, time_limit_ms')
    .in('user_id', [...userIds])
    .order('queued_at', { ascending: false })
  if (error) {
    throw new Error(`Unable to inspect ranked queue rows: ${error.message}`)
  }

  return (data ?? []) as readonly RankedQueueRow[]
}

export async function waitForRankedQueueRowsForUsers({
  minCount = 1,
  status,
  timeoutMs = 20_000,
  userIds,
}: {
  readonly minCount?: number
  readonly status?: string
  readonly timeoutMs?: number
  readonly userIds: readonly string[]
}): Promise<readonly RankedQueueRow[]> {
  const startedAt = Date.now()
  let latestRows: readonly RankedQueueRow[] = []
  while (Date.now() - startedAt < timeoutMs) {
    latestRows = await fetchRankedQueueRowsForUsers(userIds)
    const matchingRows = latestRows.filter((row) => !status || row.status === status)
    if (matchingRows.length >= minCount) {
      return matchingRows
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ranked queue rows. Last statuses: ${latestRows.map((row) => `${row.scope}:${row.mode}:${row.status}`).join(', ') || 'none'}`)
}

export async function fetchPublicRankedLeaderboardRowsForUser(
  user: E2eUser,
  {
    bucket = 'multiplayer:og',
    limit = 20,
    offset = 0,
  }: {
    readonly bucket?: 'multiplayer:go' | 'multiplayer:og'
    readonly limit?: number
    readonly offset?: number
  } = {},
): Promise<readonly Record<string, unknown>[]> {
  const client = await createAuthenticatedSupabaseClient(user)
  try {
    const { data, error } = await client.rpc('get_public_ranked_leaderboard', {
      p_bucket: bucket,
      p_limit: limit,
      p_offset: offset,
    })
    if (error) {
      throw new Error(`Unable to load public ranked leaderboard probe rows: ${error.message}`)
    }
    return Array.isArray(data) ? data as readonly Record<string, unknown>[] : []
  } finally {
    await client.auth.signOut()
  }
}

export async function updateMultiplayerProjection(game: {
  readonly currentTurn: string
  readonly endedAt?: string
  readonly id: string
  readonly status: string
  readonly updatedAt: string
  readonly winnerId?: string
} & Record<string, unknown>): Promise<void> {
  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('async_multiplayer_games')
    .update({
      current_turn: game.currentTurn,
      ended_at: game.endedAt ?? null,
      projection: game,
      status: game.status,
      updated_at: game.updatedAt,
      winner_player_id: game.winnerId ?? null,
    })
    .eq('id', game.id)
  if (error) {
    throw new Error(`Unable to update temporary multiplayer projection: ${error.message}`)
  }
}

export async function fetchPublicProfileIdForUser(user: E2eUser): Promise<string> {
  const admin = createAdminSupabaseClient()
  const { data, error } = await admin
    .from('public_player_profiles')
    .select('public_profile_id')
    .eq('user_id', user.id)
    .single()
  if (error || typeof data?.public_profile_id !== 'string') {
    throw new Error(`Unable to load public profile id for E2E user ${user.label}: ${error?.message ?? 'missing public profile id'}`)
  }
  return data.public_profile_id
}

export async function upsertPublicProfileForUser(user: E2eUser, accentColor = 'ice'): Promise<void> {
  const admin = createAdminSupabaseClient()
  const { error } = await admin
    .from('public_player_profiles')
    .upsert({
      accent_color: accentColor,
      display_name: user.displayName,
      flair_key: 'none',
      user_id: user.id,
      visibility: 'public',
    }, {
      onConflict: 'user_id',
    })
  if (error) {
    throw new Error(`Unable to configure public profile for E2E user ${user.label}: ${error.message}`)
  }
}
