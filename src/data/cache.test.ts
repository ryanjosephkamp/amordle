import { beforeEach, describe, expect, it } from 'vitest'
import { clearWordListCache, getCachedWordList } from './cache.js'
import { getDataStatus } from './status.js'

describe('data cache and statuses', () => {
  beforeEach(() => {
    clearWordListCache()
  })

  it('exposes loading, ready, stale, failed, and fallback status states', () => {
    expect(getDataStatus('loading')).toMatchObject({ playable: false })
    expect(getDataStatus('ready')).toMatchObject({ playable: true })
    expect(getDataStatus('stale')).toMatchObject({ playable: true })
    expect(getDataStatus('failed')).toMatchObject({ playable: false })
    expect(getDataStatus('fallback')).toMatchObject({ playable: true })
  })

  it('uses bundled fallback data before returning ready cached data', () => {
    const first = getCachedWordList('practice', 2)
    const second = getCachedWordList('practice', 2)

    expect(first.status.kind).toBe('fallback')
    expect(first.wordList?.metadata.length).toBe(2)
    expect(second.status.kind).toBe('ready')
    expect(second.wordList).toBe(first.wordList)
  })

  it('returns failed status for unsupported lengths without blocking other playable bundled data', () => {
    expect(getCachedWordList('practice', 1).status.kind).toBe('failed')
    expect(getCachedWordList('practice', 5).status.playable).toBe(true)
  })
})
