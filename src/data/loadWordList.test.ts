import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as loadWordListModule from './loadWordList.js'

const { loadBundledWordList, resolveWordListLength } = loadWordListModule

interface PreparationApi {
  readonly prepareBundledWordList: (scope: 'daily' | 'practice', length: number) => Promise<ReturnType<typeof loadBundledWordList>>
  readonly resetPreparedWordListsForTests: () => void
  readonly setWordListImporterForTests: (importer?: (length: number) => Promise<unknown>) => void
}

function preparationApi(): PreparationApi {
  return loadWordListModule as unknown as PreparationApi
}

beforeAll(async () => {
  await (loadWordListModule as unknown as { prepareAllBundledWordLists: () => Promise<unknown> }).prepareAllBundledWordLists()
})

describe('loadBundledWordList', () => {
  it('loads bundled boundary lengths 2, 5, and 35', () => {
    expect(loadBundledWordList('practice', 2).ok).toBe(true)
    expect(loadBundledWordList('practice', 5).ok).toBe(true)
    expect(loadBundledWordList('practice', 35).ok).toBe(true)
  })

  it('loads every supported practice length between 2 and 35', () => {
    for (let length = 2; length <= 35; length += 1) {
      expect(loadBundledWordList('practice', length).ok).toBe(true)
    }
  })

  it('rejects practice lengths outside 2 through 35', () => {
    expect(resolveWordListLength('practice', 1)).toMatchObject({ ok: false, reason: 'unsupported-length' })
    expect(resolveWordListLength('practice', 36)).toMatchObject({ ok: false, reason: 'unsupported-length' })
  })

  it('locks direct daily loading to five letters', () => {
    expect(resolveWordListLength('daily', 5)).toEqual({ ok: true, length: 5 })
    expect(resolveWordListLength('daily', 6)).toMatchObject({ ok: false, reason: 'daily-length-locked' })
  })

  it('returns normalized valid guesses and definitions', () => {
    const result = loadBundledWordList('practice', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected bundled word list to load.')
    }

    expect(result.wordList.validGuesses.has('crane')).toBe(true)
    expect(result.wordList.definitionsByWord.get('crane')?.[0].definition).toContain('bird')
  })

  it('exposes an asynchronous preparation boundary without weakening the synchronous read contract', async () => {
    const api = preparationApi()
    expect(typeof api.prepareBundledWordList).toBe('function')
    expect(typeof api.resetPreparedWordListsForTests).toBe('function')

    api.resetPreparedWordListsForTests()
    expect(loadBundledWordList('practice', 5)).toMatchObject({
      ok: false,
      reason: 'word-list-not-prepared',
    })

    const prepared = await api.prepareBundledWordList('practice', 5)
    expect(prepared.ok).toBe(true)
    expect(loadBundledWordList('practice', 5)).toBe(prepared)
  })

  it('deduplicates concurrent same-length preparation and retries after a failed import', async () => {
    const api = preparationApi()
    expect(typeof api.prepareBundledWordList).toBe('function')
    expect(typeof api.setWordListImporterForTests).toBe('function')

    const actualModule = await import('../latest/words_length_5.json', { with: { type: 'json' } })
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(actualModule.default)

    api.resetPreparedWordListsForTests()
    api.setWordListImporterForTests(importer)

    const firstAttempt = await Promise.all([
      api.prepareBundledWordList('practice', 5),
      api.prepareBundledWordList('practice', 5),
    ])
    expect(importer).toHaveBeenCalledTimes(1)
    expect(firstAttempt).toEqual([
      expect.objectContaining({ ok: false, reason: 'word-list-load-failed' }),
      expect.objectContaining({ ok: false, reason: 'word-list-load-failed' }),
    ])

    const retry = await api.prepareBundledWordList('practice', 5)
    expect(importer).toHaveBeenCalledTimes(2)
    expect(retry.ok).toBe(true)

    api.setWordListImporterForTests()
  })
})
