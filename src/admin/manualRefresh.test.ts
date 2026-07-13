import { describe, expect, it, vi } from 'vitest'
import { requestAdminRefresh } from './manualRefresh'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'

function makeClient(session: { access_token: string } | null): BrrrdleSupabaseClient {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
    },
  } as unknown as BrrrdleSupabaseClient
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

describe('requestAdminRefresh', () => {
  it('returns missing-session when the Supabase client is undefined', async () => {
    const result = await requestAdminRefresh({ supabase: undefined })
    expect(result).toEqual({ ok: false, reason: 'missing-session' })
  })

  it('returns missing-session when there is no active session', async () => {
    const client = makeClient(null)
    const result = await requestAdminRefresh({ supabase: client })
    expect(result).toEqual({ ok: false, reason: 'missing-session' })
  })

  it('parses a 202 success response and surfaces the bearer header to the server', async () => {
    const client = makeClient({ access_token: 'secret-token' })
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      revision: 'rev-1',
      generatedAt: '2026-05-27T00:00:00Z',
      fetchedAt: '2026-05-27T00:00:05Z',
      lengths: [{ length: 5, answers: 100, validGuesses: 1000 }],
      persistence: { status: 'swapped', store: 'blob' },
    }, 202))
    const result = await requestAdminRefresh({ supabase: client, fetchImpl })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected success')
    expect(result.revision).toBe('rev-1')
    expect(result.lengths?.length).toBe(1)
    expect(result.persistence?.status).toBe('swapped')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [, init] = fetchImpl.mock.calls[0]
    expect(init?.headers?.authorization).toBe('Bearer secret-token')
    // The bearer token must never appear in the returned payload.
    expect(JSON.stringify(result)).not.toContain('secret-token')
  })

  it('maps a 401 response to reason=unauthorized', async () => {
    const client = makeClient({ access_token: 't' })
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'Unauthorized' }, 401))
    const result = await requestAdminRefresh({ supabase: client, fetchImpl })
    expect(result).toMatchObject({ ok: false, reason: 'unauthorized', status: 401 })
  })

  it('maps a 403 response to reason=forbidden', async () => {
    const client = makeClient({ access_token: 't' })
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'Forbidden' }, 403))
    const result = await requestAdminRefresh({ supabase: client, fetchImpl })
    expect(result).toMatchObject({ ok: false, reason: 'forbidden', status: 403 })
  })

  it('maps a 502 response to reason=server-error and surfaces stage/message', async () => {
    const client = makeClient({ access_token: 't' })
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      ok: false,
      stage: 'refresh',
      message: 'dataset unavailable',
    }, 502))
    const result = await requestAdminRefresh({ supabase: client, fetchImpl })
    expect(result).toMatchObject({
      ok: false,
      reason: 'server-error',
      status: 502,
      stage: 'refresh',
      message: 'dataset unavailable',
    })
  })

  it('maps a thrown fetch (network failure) to reason=network-error', async () => {
    const client = makeClient({ access_token: 't' })
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    const result = await requestAdminRefresh({ supabase: client, fetchImpl })
    expect(result).toEqual({ ok: false, reason: 'network-error' })
  })
})
