import { describe, expect, it } from 'vitest'
import * as localWordListsModule from './localWordLists.js'
import { isLoadWordListFailure, loadBundledWordList } from './loadWordList.js'
import {
  LOCAL_WORD_LISTS_MANIFEST,
  LOCAL_WORD_LISTS_SOURCE_PATH,
  LOCAL_WORD_LIST_LENGTHS,
  normalizeLocalWordListFile,
} from './localWordLists.js'
import { validateWordListFile } from './wordListSchema.js'
import rawLength5 from '../latest/words_length_5.json' with { type: 'json' }
import rawLength12 from '../latest/words_length_12.json' with { type: 'json' }
import rawLength20 from '../latest/words_length_20.json' with { type: 'json' }

describe('LOCAL_WORD_LISTS_MANIFEST', () => {
  it('projects the src/latest/manifest.json into a typed manifest', () => {
    expect(LOCAL_WORD_LISTS_MANIFEST.dataset).toBe('english-openlist-brrrdle')
    expect(LOCAL_WORD_LISTS_MANIFEST.schemaVersion).toBe('2.0')
    expect(LOCAL_WORD_LISTS_MANIFEST.releaseDate).toBe('2026-05-28')
    expect(LOCAL_WORD_LISTS_MANIFEST.generatedAt).toBe('2026-05-28T01:39:10.899912+00:00')
    expect(LOCAL_WORD_LISTS_MANIFEST.supportedWordLengths).toEqual({ min: 2, max: 35 })
  })

  it('exposes every length from 2 through 35 inclusive', () => {
    expect(LOCAL_WORD_LIST_LENGTHS).toEqual(Array.from({ length: 34 }, (_, i) => i + 2))
  })

  it('pins the loader-path constant to the on-disk src/latest layout', () => {
    expect(LOCAL_WORD_LISTS_SOURCE_PATH).toBe('src/latest')
  })

  it('keeps the eager loader answer-free by avoiding static per-length imports', () => {
    expect('LOCAL_WORD_LISTS' in localWordListsModule).toBe(false)
    expect(LOCAL_WORD_LIST_LENGTHS).toHaveLength(34)
  })
})

describe('normalizeLocalWordListFile', () => {
  it('synthesizes the legacy WordListMetadata block from manifest + per-length file', () => {
    const adapted = normalizeLocalWordListFile(rawLength5, 5) as {
      metadata: {
        length: number
        source: string
        version: string
        generatedAt: string
        curation?: Record<string, unknown>
      }
      answers: unknown
      validGuesses: unknown
    }
    expect(adapted.metadata.length).toBe(5)
    expect(adapted.metadata.source).toBe(
      'src/latest (english-openlist-brrrdle 2026-05-28)',
    )
    expect(adapted.metadata.version).toBe('2026-05-28')
    expect(adapted.metadata.generatedAt).toBe('2026-05-28T01:39:10.899912+00:00')
    // curation block from the raw file is preserved through the additive optional field.
    expect(adapted.metadata.curation).toBeDefined()
    expect(adapted.metadata.curation?.method).toBe('stratified_quality_score_v1')
    // answers and validGuesses are passed through unchanged.
    expect(Array.isArray(adapted.answers)).toBe(true)
    expect(Array.isArray(adapted.validGuesses)).toBe(true)
  })

  it('produces a payload that passes the canonical schema for representative lengths', () => {
    for (const length of [2, 5, 12, 20, 35] as const) {
      const loaded = loadBundledWordList('practice', length)
      expect(loaded.ok, `length ${length} should validate`).toBe(true)
    }
  })
})

describe('local word-list schema integration', () => {
  it('every prepared length 2..35 passes the canonical schema validator', () => {
    for (let length = 2; length <= 35; length += 1) {
      const loaded = loadBundledWordList('practice', length)
      expect(loaded.ok, `length ${length} should validate`).toBe(true)
    }
  })

  it('answer and valid-guess counts match the per-length JSON files for sampled lengths', () => {
    const sample = [
      { length: 5, raw: rawLength5 },
      { length: 12, raw: rawLength12 },
      { length: 20, raw: rawLength20 },
    ] as const
    for (const { length, raw } of sample) {
      const rawAnswers = (raw as { answers: readonly unknown[] }).answers
      const rawValidGuesses = (raw as { validGuesses: readonly unknown[] }).validGuesses
      const loaded = loadBundledWordList('practice', length)
      expect(loaded.ok).toBe(true)
      if (!loaded.ok) throw new Error('unreachable')
      expect(loaded.wordList.answers.length).toBe(rawAnswers.length)
      expect(loaded.wordList.validGuesses.size).toBe(rawValidGuesses.length)
    }
  })

  it('rejects a deliberately malformed local file with the canonical schema failure', () => {
    const malformed = normalizeLocalWordListFile(
      {
        metadata: { curation: { method: 'broken' } },
        // missing validGuesses entirely; answers contain a wrong-length entry.
        answers: ['too-long-five'],
      },
      5,
    )
    const validation = validateWordListFile(malformed)
    expect(validation.ok).toBe(false)
    if (validation.ok) throw new Error('unreachable')
    expect(validation.issues.length).toBeGreaterThan(0)
  })
})

describe('loadBundledWordList against local source (will be wired in 17.2)', () => {
  it('the local payload for daily length 5 contains a representative ordinary English word as a valid guess', () => {
    const loaded = loadBundledWordList('daily', 5)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('unreachable')
    expect(loaded.wordList.validGuesses.has('house')).toBe(true)
  })

  it('loadBundledWordList still returns failure-free results for current bundled source (unchanged at 17.1)', () => {
    // Phase 17.1 only adds the loader; it does not yet re-point BUNDLED_WORD_LISTS.
    // Existing daily and practice lengths must continue to load without regression.
    const dailyResult = loadBundledWordList('daily', 5)
    expect(isLoadWordListFailure(dailyResult)).toBe(false)
    const practiceResult = loadBundledWordList('practice', 35)
    expect(isLoadWordListFailure(practiceResult)).toBe(false)
  })
})
