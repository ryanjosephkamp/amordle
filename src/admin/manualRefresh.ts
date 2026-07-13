import type { BrrrdleSupabaseClient } from '../account/supabaseClient'

export interface AdminRefreshLengthSummary {
  readonly length: number
  readonly answers: number
  readonly validGuesses: number
}

export interface AdminRefreshSuccess {
  readonly ok: true
  readonly revision?: string
  readonly generatedAt?: string
  readonly fetchedAt?: string
  readonly lengths?: readonly AdminRefreshLengthSummary[]
  readonly persistence?: {
    readonly status?: string
    readonly store?: string
    readonly previousRevision?: string
    readonly manifestRevision?: string
    readonly reason?: string
  }
}

export type AdminRefreshFailureReason =
  | 'missing-session'
  | 'unauthorized'
  | 'forbidden'
  | 'server-error'
  | 'network-error'

export interface AdminRefreshFailure {
  readonly ok: false
  readonly reason: AdminRefreshFailureReason
  readonly status?: number
  readonly message?: string
  readonly stage?: string
}

export type AdminRefreshResult = AdminRefreshSuccess | AdminRefreshFailure

export interface RequestAdminRefreshOptions {
  readonly supabase: BrrrdleSupabaseClient | undefined
  readonly fetchImpl?: typeof fetch
  readonly endpoint?: string
}

const DEFAULT_ENDPOINT = '/api/admin-refresh'

function failure(reason: AdminRefreshFailureReason, extra: Partial<AdminRefreshFailure> = {}): AdminRefreshFailure {
  return { ok: false, reason, ...extra }
}

function parseSuccess(payload: unknown): AdminRefreshSuccess {
  if (!payload || typeof payload !== 'object') {
    return { ok: true }
  }
  const record = payload as Record<string, unknown>
  const lengthsValue = record.lengths
  const persistenceValue = record.persistence
  return {
    ok: true,
    revision: typeof record.revision === 'string' ? record.revision : undefined,
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : undefined,
    fetchedAt: typeof record.fetchedAt === 'string' ? record.fetchedAt : undefined,
    lengths: Array.isArray(lengthsValue)
      ? lengthsValue
          .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
          .map((entry) => ({
            length: typeof entry.length === 'number' ? entry.length : 0,
            answers: typeof entry.answers === 'number' ? entry.answers : 0,
            validGuesses: typeof entry.validGuesses === 'number' ? entry.validGuesses : 0,
          }))
      : undefined,
    persistence: persistenceValue && typeof persistenceValue === 'object'
      ? {
        status: typeof (persistenceValue as Record<string, unknown>).status === 'string'
          ? (persistenceValue as Record<string, string>).status
          : undefined,
        store: typeof (persistenceValue as Record<string, unknown>).store === 'string'
          ? (persistenceValue as Record<string, string>).store
          : undefined,
        previousRevision: typeof (persistenceValue as Record<string, unknown>).previousRevision === 'string'
          ? (persistenceValue as Record<string, string>).previousRevision
          : undefined,
        manifestRevision: typeof (persistenceValue as Record<string, unknown>).manifestRevision === 'string'
          ? (persistenceValue as Record<string, string>).manifestRevision
          : undefined,
        reason: typeof (persistenceValue as Record<string, unknown>).reason === 'string'
          ? (persistenceValue as Record<string, string>).reason
          : undefined,
      }
      : undefined,
  }
}

function reasonForStatus(status: number): AdminRefreshFailureReason {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  return 'server-error'
}

export async function requestAdminRefresh(options: RequestAdminRefreshOptions): Promise<AdminRefreshResult> {
  const { supabase, fetchImpl = fetch, endpoint = DEFAULT_ENDPOINT } = options
  if (!supabase) {
    return failure('missing-session')
  }

  let accessToken: string | undefined
  try {
    const { data } = await supabase.auth.getSession()
    accessToken = data.session?.access_token ?? undefined
  } catch {
    return failure('missing-session')
  }

  if (!accessToken) {
    return failure('missing-session')
  }

  let response: Response
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
    })
  } catch {
    return failure('network-error')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }

  if (response.status === 202) {
    return parseSuccess(body)
  }

  const message = body && typeof body === 'object' && typeof (body as Record<string, unknown>).message === 'string'
    ? ((body as Record<string, string>).message)
    : undefined
  const stage = body && typeof body === 'object' && typeof (body as Record<string, unknown>).stage === 'string'
    ? ((body as Record<string, string>).stage)
    : undefined

  return failure(reasonForStatus(response.status), {
    status: response.status,
    message,
    stage,
  })
}
