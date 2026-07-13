import { describe, expect, it, vi } from 'vitest'
import { lookupDefinitions } from './definitionService'

function jsonResponse(payload: unknown, ok = true, status = ok ? 200 : 500): Response {
  return new Response(JSON.stringify(payload), { status })
}

describe('definition service', () => {
  it('prefers bundled definitions when present', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const result = await lookupDefinitions({ mode: 'og', scope: 'daily', word: 'crane', wordLength: 5 }, { fetcher })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('bundled')
      expect(result.definitions[0].definition).toContain('large bird')
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses Wiktionary when bundled definitions are absent', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      en: [{ partOfSpeech: 'adjective', definitions: [{ definition: '<b>Quick and active.</b>' }] }],
    }))

    const result = await lookupDefinitions({ mode: 'og', scope: 'daily', word: 'brisk', wordLength: 5 }, { fetcher })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('wiktionary')
      expect(result.definitions).toEqual([{ definition: 'Quick and active.', partOfSpeech: 'adjective', source: 'wiktionary' }])
    }
  })

  it('falls back to Dictionary API after Wiktionary failures or empty results', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ en: [] }))
      .mockResolvedValueOnce(jsonResponse([
        { meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A test word.' }] }] },
      ]))

    const result = await lookupDefinitions({ mode: 'og', scope: 'daily', word: 'brisk', wordLength: 5 }, { fetcher })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.source).toBe('dictionary-api')
      expect(result.definitions).toEqual([{ definition: 'A test word.', partOfSpeech: 'noun', source: 'dictionary-api' }])
    }
  })

  it('returns a non-crashing fallback result for malformed responses and network errors', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ unexpected: true }))
      .mockRejectedValueOnce(new Error('offline'))

    const result = await lookupDefinitions({ mode: 'go', scope: 'practice', word: 'brisk', wordLength: 5 }, { fetcher })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })
})
