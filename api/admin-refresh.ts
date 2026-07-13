/**
 * @module api/admin-refresh
 *
 * Admin-triggered Hugging Face refresh route.
 *
 * Since Phase 17 (LOCAL-WORD-LISTS-SPEC-2026-05-28), gameplay reads the local
 * authoritative word-list source at `src/latest/` via
 * `src/data/localWordLists.ts` by default; this admin route is no longer the
 * gameplay default but remains available as an **optional override**:
 * a successful refresh merges the new dataset into `refreshStore`, and the
 * data layer continues to prefer the local source unless an admin has
 * explicitly swapped a length in-session. Phase 14 admin authorization and
 * the existing request/response contract are unchanged. No logic was changed
 * in Phase 17.3 — only this JSDoc banner was added.
 */
import {
  HUGGING_FACE_API_BASE,
  HUGGING_FACE_DATASET_ID,
  HUGGING_FACE_RAW_BASE,
  fetchHuggingFaceRemoteMetadata,
  isRefreshFailure,
  refreshWordListsFromHuggingFace,
  type RefreshSourceInfo,
} from '../src/data/index.js'
import { resolveWordListStore } from './_lib/wordListStore.js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY

interface JsonResponseInit {
  readonly status: number
}

function jsonResponse(body: unknown, init: JsonResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init.status,
  })
}

async function fetchJson(url: string, init?: { readonly signal?: AbortSignal }): Promise<unknown> {
  const response = await fetch(url, { signal: init?.signal })
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}.`)
  }
  return response.json()
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  const authorization = request.headers.get('authorization')
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization,
    },
  })

  if (!userResponse.ok) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await userResponse.json() as { readonly app_metadata?: { readonly role?: string; readonly roles?: readonly string[] } }
  const roles = Array.isArray(user.app_metadata?.roles) ? user.app_metadata.roles : user.app_metadata?.role ? [user.app_metadata.role] : []
  if (!roles.includes('admin')) {
    return jsonResponse({ error: 'Forbidden' }, { status: 403 })
  }

  let remote
  try {
    remote = await fetchHuggingFaceRemoteMetadata(fetchJson, { apiBase: HUGGING_FACE_API_BASE })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error fetching dataset info.'
    console.error('admin-refresh: dataset info fetch failed', { message })
    return jsonResponse(
      { ok: false, stage: 'dataset-info', message },
      { status: 502 },
    )
  }

  const source: RefreshSourceInfo = {
    datasetId: HUGGING_FACE_DATASET_ID,
    revision: remote.version,
    generatedAt: remote.generatedAt,
  }

  const result = await refreshWordListsFromHuggingFace({
    fetchJson,
    source,
    rawBase: HUGGING_FACE_RAW_BASE,
  })

  if (isRefreshFailure(result)) {
    const failureSummary = result.failures.map((failure) => ({
      length: failure.length,
      reason: failure.reason,
      message: failure.message,
    }))
    console.error('admin-refresh: refresh aborted', {
      revision: result.source.revision,
      failures: failureSummary,
    })
    return jsonResponse(
      {
        ok: false,
        stage: 'refresh',
        revision: result.source.revision,
        generatedAt: result.source.generatedAt,
        fetchedAt: result.fetchedAt,
        failures: failureSummary,
        message: result.message,
      },
      { status: 502 },
    )
  }

  const successSummary = result.files.map((file) => ({
    length: file.length,
    answers: file.file.answers.length,
    validGuesses: file.file.validGuesses.length,
  }))

  const resolvedStore = resolveWordListStore()
  let persistence: Record<string, unknown>
  if (!resolvedStore.store) {
    persistence = { status: 'skipped', reason: resolvedStore.reason }
    console.warn('admin-refresh: persistence skipped', { reason: resolvedStore.reason })
  } else {
    const swap = await resolvedStore.store.atomicSwap({ refresh: result })
    if (swap.status === 'swapped') {
      persistence = {
        status: 'swapped',
        store: resolvedStore.store.name,
        previousRevision: swap.previousRevision,
        manifestRevision: swap.manifest.revision,
      }
      console.log('admin-refresh: persistence swapped', {
        store: resolvedStore.store.name,
        revision: swap.manifest.revision,
        previousRevision: swap.previousRevision,
      })
    } else if (swap.status === 'failed') {
      persistence = {
        status: 'failed',
        store: resolvedStore.store.name,
        stage: swap.stage,
        failedLength: swap.failedLength,
        message: swap.message,
        previousServedSetIntact: swap.previousServedSetIntact,
      }
      console.error('admin-refresh: persistence failed', persistence)
      return jsonResponse(
        {
          ok: false,
          stage: 'persist',
          revision: result.source.revision,
          generatedAt: result.source.generatedAt,
          fetchedAt: result.fetchedAt,
          lengths: successSummary,
          persistence,
        },
        { status: 502 },
      )
    } else {
      persistence = { status: 'skipped', store: resolvedStore.store.name, reason: swap.reason }
      console.warn('admin-refresh: persistence skipped by driver', persistence)
    }
  }

  console.log('admin-refresh: refresh succeeded', {
    revision: result.source.revision,
    fetchedAt: result.fetchedAt,
    lengthCount: result.files.length,
  })

  return jsonResponse(
    {
      ok: true,
      revision: result.source.revision,
      generatedAt: result.source.generatedAt,
      fetchedAt: result.fetchedAt,
      lengths: successSummary,
      persistence,
    },
    { status: 202 },
  )
}
