import { describe, expect, it } from 'vitest'

import adminRefreshFunction, { handleAdminRefresh } from './admin-refresh.js'
import cronRefreshFunction, { handleCronRefresh } from './cron/refresh-word-lists.js'
import wordListManifestFunction, { handleWordListManifest } from './word-lists/manifest.js'

describe('Vercel Web function exports', () => {
  it('exposes the word-list manifest handler through the Web fetch interface', () => {
    expect(wordListManifestFunction.fetch).toBe(handleWordListManifest)
  })

  it('exposes the cron refresh handler through the Web fetch interface', () => {
    expect(cronRefreshFunction.fetch).toBe(handleCronRefresh)
  })

  it('exposes the admin refresh handler through the Web fetch interface', () => {
    expect(adminRefreshFunction.fetch).toBe(handleAdminRefresh)
  })

  it('rejects an unauthenticated cron request without invoking refresh work', async () => {
    const response = await cronRefreshFunction.fetch(new Request('https://amordle.example/api/cron/refresh-word-lists'))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects an unauthenticated admin request without invoking refresh work', async () => {
    const response = await adminRefreshFunction.fetch(new Request('https://amordle.example/api/admin-refresh', { method: 'POST' }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })
})
