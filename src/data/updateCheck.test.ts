import { describe, expect, it } from 'vitest'
import { BUNDLED_REMOTE_METADATA } from './metadata.js'
import { checkForWordListUpdates } from './updateCheck.js'

describe('checkForWordListUpdates', () => {
  it('reports current metadata', async () => {
    await expect(checkForWordListUpdates(BUNDLED_REMOTE_METADATA, async () => BUNDLED_REMOTE_METADATA)).resolves.toMatchObject({
      status: 'current',
    })
  })

  it('reports stale metadata for version changes and missing bundled lengths', async () => {
    const result = await checkForWordListUpdates(BUNDLED_REMOTE_METADATA, async () => ({
      version: 'remote-newer',
      generatedAt: '2026-05-26T00:00:00Z',
      lengths: [...BUNDLED_REMOTE_METADATA.lengths, 36],
    }))

    expect(result).toMatchObject({ status: 'stale', missingLengths: [36] })
  })

  it('degrades gracefully on failed network checks', async () => {
    const result = await checkForWordListUpdates(BUNDLED_REMOTE_METADATA, async () => {
      throw new Error('offline')
    })

    expect(result).toMatchObject({ status: 'unavailable', reason: 'network-error' })
  })

  it('degrades gracefully on malformed metadata', async () => {
    const result = await checkForWordListUpdates(BUNDLED_REMOTE_METADATA, async () => ({ version: 'bad' }))
    expect(result).toMatchObject({ status: 'unavailable', reason: 'malformed-metadata' })
  })
})
