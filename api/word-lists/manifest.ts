import { resolveWordListStore } from '../_lib/wordListStore.js'

interface JsonResponseInit {
  readonly status: number
}

function jsonResponse(body: unknown, init: JsonResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      // Cache control: clients should re-check periodically but the manifest
      // may legitimately be requested many times per session. A short cache
      // keeps the read path cheap while still picking up nightly refreshes.
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
    },
    status: init.status,
  })
}

/**
 * Public read endpoint that returns the current word-list manifest.
 *
 * The manifest is the single source of truth that the client-side
 * update-check helper consults to discover what upstream revision is being
 * served and which length files are available. The endpoint is public on
 * purpose: every dictionary is derived from a public Hugging Face dataset
 * and contains no secrets, so there is no value in gating reads.
 *
 * Response shapes:
 *   - 200 with `{ ok: true, manifest }` when a manifest is currently served.
 *   - 200 with `{ ok: true, manifest: null, note }` when no manifest has
 *     been written yet (fresh deployment, or persistence not configured).
 *     The client falls back to bundled data in this case.
 *   - 502 only for store I/O errors.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  const resolved = resolveWordListStore()
  if (!resolved.store) {
    return jsonResponse(
      {
        ok: true,
        manifest: null,
        note: resolved.reason ?? 'No production word-list store configured.',
      },
      { status: 200 },
    )
  }

  try {
    const manifest = await resolved.store.loadManifest()
    return jsonResponse({ ok: true, manifest }, { status: 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load manifest.'
    console.error('word-lists/manifest: load failed', { message })
    return jsonResponse({ ok: false, message }, { status: 502 })
  }
}
