import { describe, expect, it } from 'vitest'
import { refreshWordListsFromHuggingFace, type RefreshSourceInfo } from './refresh.js'

const SOURCE: RefreshSourceInfo = {
  datasetId: 'ryanjosephkamp/english-openlist',
  revision: 'test-revision',
  generatedAt: '2026-05-26T00:00:00Z',
}

function wordListPayload(length: number, words: readonly string[]) {
  return {
    metadata: {
      length,
      source: 'huggingface:ryanjosephkamp/english-openlist',
      version: 'test-revision',
      generatedAt: '2026-05-26T00:00:00Z',
    },
    answers: words,
    validGuesses: words,
  }
}

describe('refreshWordListsFromHuggingFace', () => {
  it('succeeds when every requested length validates against the brrrdle schema', async () => {
    const lengths = [2, 5, 35] as const
    const result = await refreshWordListsFromHuggingFace({
      fetchJson: async (url) => {
        if (url.endsWith('words_length_2.json')) return wordListPayload(2, ['go', 'ox'])
        if (url.endsWith('words_length_5.json')) return wordListPayload(5, ['crane', 'slate'])
        if (url.endsWith('words_length_35.json')) {
          return wordListPayload(35, ['a'.repeat(35), 'b'.repeat(35)])
        }
        throw new Error(`Unexpected url ${url}`)
      },
      source: SOURCE,
      lengths,
      now: () => new Date('2026-05-26T00:01:02Z'),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files).toHaveLength(3)
    expect(result.files.map((file) => file.length)).toEqual([2, 5, 35])
    expect(result.fetchedAt).toBe('2026-05-26T00:01:02.000Z')
    expect(result.source.revision).toBe('test-revision')
  })

  it('accepts a flat string array payload by injecting source metadata', async () => {
    const result = await refreshWordListsFromHuggingFace({
      fetchJson: async () => ['go', 'ox', 'am'],
      source: SOURCE,
      lengths: [2],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.files[0].file.metadata.version).toBe('test-revision')
    expect(result.files[0].file.metadata.source).toContain('huggingface:')
    expect(result.files[0].file.answers).toHaveLength(3)
  })

  it('aborts atomically when any single length fails schema validation', async () => {
    const result = await refreshWordListsFromHuggingFace({
      fetchJson: async (url) => {
        if (url.endsWith('words_length_2.json')) return wordListPayload(2, ['go', 'ox'])
        if (url.endsWith('words_length_5.json')) {
          // wrong length inside the payload should be rejected
          return wordListPayload(4, ['four'])
        }
        return wordListPayload(35, ['a'.repeat(35)])
      },
      source: SOURCE,
      lengths: [2, 5, 35],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toMatchObject({ length: 5, reason: 'invalid-payload' })
    expect(result.message).toContain('Refresh aborted')
  })

  it('aborts atomically when any single length fetch fails over the network', async () => {
    const result = await refreshWordListsFromHuggingFace({
      fetchJson: async (url) => {
        if (url.endsWith('words_length_5.json')) {
          throw new Error('network down')
        }
        if (url.endsWith('words_length_2.json')) return wordListPayload(2, ['go'])
        return wordListPayload(35, ['a'.repeat(35)])
      },
      source: SOURCE,
      lengths: [2, 5, 35],
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toMatchObject({ length: 5, reason: 'fetch-failed' })
    expect(result.failures[0].message).toBe('network down')
  })

  it('records the unexpected upstream revision in the source info on success', async () => {
    const result = await refreshWordListsFromHuggingFace({
      fetchJson: async () => ['go', 'ox'],
      source: { ...SOURCE, revision: 'unexpected-new-sha' },
      lengths: [2],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source.revision).toBe('unexpected-new-sha')
    expect(result.files[0].file.metadata.version).toBe('unexpected-new-sha')
  })
})
