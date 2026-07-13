import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORD_EXPLORER_LENGTH,
  WORD_EXPLORER_LENGTHS,
  difficultyBadgeLabel,
  emptyStateMessage,
  filterAndSortEntries,
  loadWordExplorerEntries,
  loadWordExplorerEntriesFromLive,
  typeBadgeLabel,
  type WordExplorerEntry,
} from './wordExplorerData'

describe('wordExplorerData lengths and defaults', () => {
  it('exposes every bundled length 2..35', () => {
    expect(WORD_EXPLORER_LENGTHS).toContain(2)
    expect(WORD_EXPLORER_LENGTHS).toContain(5)
    expect(WORD_EXPLORER_LENGTHS).toContain(20)
    expect(WORD_EXPLORER_LENGTHS).toContain(35)
  })

  it('defaults to length 5', () => {
    expect(DEFAULT_WORD_EXPLORER_LENGTH).toBe(5)
  })
})

describe('loadWordExplorerEntries', () => {
  it('returns a non-empty, deduped, alphabetically sorted union at length 5', () => {
    const entries = loadWordExplorerEntries(5)
    expect(entries.length).toBeGreaterThan(0)
    const words = entries.map((entry) => entry.word)
    expect([...words]).toEqual([...words].sort())
    expect(new Set(words).size).toBe(words.length)
  })

  it('tags entries that appear in both answers and validGuesses with both types', () => {
    const entries = loadWordExplorerEntries(5)
    const dualTagged = entries.find((entry) => entry.types.has('answer') && entry.types.has('valid-guess'))
    expect(dualTagged).toBeDefined()
  })

  it('returns entries at a short length (2) and a long length (20)', () => {
    expect(loadWordExplorerEntries(2).length).toBeGreaterThan(0)
    expect(loadWordExplorerEntries(20).length).toBeGreaterThan(0)
  })

  it('returns an empty array for an unsupported length', () => {
    expect(loadWordExplorerEntries(0)).toEqual([])
    expect(loadWordExplorerEntries(99)).toEqual([])
  })
})

describe('loadWordExplorerEntriesFromLive', () => {
  it('uses a live manifest entry when available', async () => {
    const fetchJson = async (url: string): Promise<unknown> => {
      if (url === '/manifest') {
        return {
          ok: true,
          manifest: {
            revision: 'r1',
            generatedAt: '2026-05-27T00:00:00Z',
            fetchedAt: '2026-05-27T01:00:00Z',
            source: { datasetId: 'ryanjosephkamp/english-openlist' },
            entries: [{ length: 3, url: '/words-3.json', answers: 1, validGuesses: 2, status: 'served' }],
          },
        }
      }
      return {
        metadata: { length: 3, source: 'live', version: 'r1', generatedAt: '2026-05-27T00:00:00Z' },
        answers: [{ word: 'ice' }],
        validGuesses: ['ice', 'brr'],
      }
    }

    const result = await loadWordExplorerEntriesFromLive(3, { fetchJson, manifestUrl: '/manifest' })
    expect(result.source).toBe('live')
    expect(result.entries.map((entry) => entry.word)).toEqual(['brr', 'ice'])
  })

  it('falls back to bundled entries when the live manifest is unavailable', async () => {
    const result = await loadWordExplorerEntriesFromLive(5, {
      fetchJson: async () => ({ ok: true, manifest: null }),
      manifestUrl: '/manifest',
    })
    expect(result.source).toBe('bundled')
    expect(result.entries.length).toBeGreaterThan(0)
  })
})

describe('filterAndSortEntries', () => {
  const sample: readonly WordExplorerEntry[] = [
    { word: 'apple', types: new Set(['answer']) },
    { word: 'banana', types: new Set(['valid-guess']) },
    { word: 'cherry', types: new Set(['answer', 'valid-guess']) },
  ]

  it('filters by type checkboxes (answers only)', () => {
    const result = filterAndSortEntries(
      sample,
      { searchTerm: '', showAnswers: true, showValidGuesses: false },
      { field: 'word', direction: 'asc' },
    )
    expect(result.map((entry) => entry.word)).toEqual(['apple', 'cherry'])
  })

  it('filters by type checkboxes (valid guesses only)', () => {
    const result = filterAndSortEntries(
      sample,
      { searchTerm: '', showAnswers: false, showValidGuesses: true },
      { field: 'word', direction: 'asc' },
    )
    expect(result.map((entry) => entry.word)).toEqual(['banana', 'cherry'])
  })

  it('returns nothing when both checkboxes are off', () => {
    const result = filterAndSortEntries(
      sample,
      { searchTerm: '', showAnswers: false, showValidGuesses: false },
      { field: 'word', direction: 'asc' },
    )
    expect(result).toEqual([])
  })

  it('searches case-insensitively as a substring', () => {
    const result = filterAndSortEntries(
      sample,
      { searchTerm: 'AN', showAnswers: true, showValidGuesses: true },
      { field: 'word', direction: 'asc' },
    )
    expect(result.map((entry) => entry.word)).toEqual(['banana'])
  })

  it('sorts descending when requested', () => {
    const result = filterAndSortEntries(
      sample,
      { searchTerm: '', showAnswers: true, showValidGuesses: true },
      { field: 'word', direction: 'desc' },
    )
    expect(result.map((entry) => entry.word)).toEqual(['cherry', 'banana', 'apple'])
  })

  const tiered: readonly WordExplorerEntry[] = [
    { word: 'aaaaa', types: new Set(['answer']), difficulty: 'casual' },
    { word: 'bbbbb', types: new Set(['answer']), difficulty: 'standard' },
    { word: 'ccccc', types: new Set(['answer']), difficulty: 'expert' },
    { word: 'ddddd', types: new Set(['valid-guess']) },
  ]

  it('filters by difficulty using nested tier inclusion', () => {
    const casual = filterAndSortEntries(tiered, { searchTerm: '', showAnswers: true, showValidGuesses: true, difficulty: 'casual' }, { field: 'word', direction: 'asc' })
    expect(casual.map((entry) => entry.word)).toEqual(['aaaaa'])

    const standard = filterAndSortEntries(tiered, { searchTerm: '', showAnswers: true, showValidGuesses: true, difficulty: 'standard' }, { field: 'word', direction: 'asc' })
    expect(standard.map((entry) => entry.word)).toEqual(['aaaaa', 'bbbbb'])

    const expert = filterAndSortEntries(tiered, { searchTerm: '', showAnswers: true, showValidGuesses: true, difficulty: 'expert' }, { field: 'word', direction: 'asc' })
    expect(expert.map((entry) => entry.word)).toEqual(['aaaaa', 'bbbbb', 'ccccc'])
  })

  it('sorts by difficulty with valid-guess-only words last', () => {
    const result = filterAndSortEntries(tiered, { searchTerm: '', showAnswers: true, showValidGuesses: true, difficulty: 'all' }, { field: 'difficulty', direction: 'asc' })
    expect(result.map((entry) => entry.word)).toEqual(['aaaaa', 'bbbbb', 'ccccc', 'ddddd'])
  })
})

describe('difficultyBadgeLabel', () => {
  it('reflects nested tier inclusion', () => {
    expect(difficultyBadgeLabel('casual')).toBe('Casual · Standard · Expert')
    expect(difficultyBadgeLabel('standard')).toBe('Standard · Expert')
    expect(difficultyBadgeLabel('expert')).toBe('Expert only')
    expect(difficultyBadgeLabel(undefined)).toBe('Valid guess only')
  })
})

describe('typeBadgeLabel', () => {
  it('renders both labels when both types are present', () => {
    expect(typeBadgeLabel(new Set(['answer', 'valid-guess']))).toBe('Answer & Valid Guess')
  })

  it('renders only the answer label', () => {
    expect(typeBadgeLabel(new Set(['answer']))).toBe('Answer')
  })

  it('renders only the valid guess label', () => {
    expect(typeBadgeLabel(new Set(['valid-guess']))).toBe('Valid Guess')
  })
})

describe('emptyStateMessage', () => {
  it('uses the exact wording required by ADDITIONS-2026-05-27.md §1', () => {
    expect(emptyStateMessage('xyzq', 5)).toBe('"xyzq" is not in the current 5-letter word list.')
  })
})
