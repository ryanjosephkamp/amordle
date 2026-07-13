import { isLoadWordListFailure, loadBundledWordList } from '../data/loadWordList.js'
import type { ServedManifest } from '../data/refreshStore.js'
import type { WordEntry } from '../data/types.js'
import { isSchemaValidationFailure, validateWordListFile } from '../data/wordListSchema.js'
import { BUNDLED_WORD_LIST_LENGTHS } from '../data/wordLists.js'
import { classifyAnswerTier, type DifficultyTier } from '../data/difficulty/index.js'

export type WordEntryType = 'answer' | 'valid-guess'

export interface WordExplorerEntry {
  readonly word: string
  readonly types: ReadonlySet<WordEntryType>
  /**
   * Minimal difficulty tier the word belongs to as an **answer** (`'casual'` ⊆
   * `'standard'` ⊆ `'expert'`), or `undefined` when it is a valid-guess-only
   * word. Computed from the in-repo difficulty model for the list length.
   */
  readonly difficulty?: DifficultyTier
}

export const WORD_EXPLORER_LENGTHS: readonly number[] = BUNDLED_WORD_LIST_LENGTHS
export const DEFAULT_WORD_EXPLORER_LENGTH = 5
export const WORD_LIST_MANIFEST_ENDPOINT = '/api/word-lists/manifest'

/**
 * Build the combined, deduplicated union of `answers` + `validGuesses`
 * for a given practice length, tagged with one or both type markers.
 */
export function loadWordExplorerEntries(length: number): readonly WordExplorerEntry[] {
  const result = loadBundledWordList('practice', length)
  if (isLoadWordListFailure(result)) {
    return []
  }

  return buildWordExplorerEntries(result.wordList, length)
}

function buildWordExplorerEntries(file: { readonly answers: readonly WordEntry[]; readonly validGuesses: Iterable<string> }, length: number): readonly WordExplorerEntry[] {
  const byWord = new Map<string, Set<WordEntryType>>()
  for (const answer of file.answers) {
    const key = answer.word
    const existing = byWord.get(key) ?? new Set<WordEntryType>()
    existing.add('answer')
    byWord.set(key, existing)
  }

  for (const guess of file.validGuesses) {
    const existing = byWord.get(guess) ?? new Set<WordEntryType>()
    existing.add('valid-guess')
    byWord.set(guess, existing)
  }

  return [...byWord.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([word, types]) => ({
      word,
      types,
      difficulty: types.has('answer') ? classifyAnswerTier(length, word) : undefined,
    }))
}

interface ManifestResponse {
  readonly ok: boolean
  readonly manifest?: ServedManifest | null
}

function isManifestResponse(value: unknown): value is ManifestResponse {
  return typeof value === 'object' && value !== null && 'ok' in value
}

export interface WordExplorerLoadResult {
  readonly entries: readonly WordExplorerEntry[]
  readonly source: 'live' | 'bundled'
  readonly message?: string
}

export interface WordExplorerLiveLoadOptions {
  readonly fetchJson?: (url: string) => Promise<unknown>
  readonly manifestUrl?: string
}

function bundledResult(length: number, message?: string): WordExplorerLoadResult {
  return { entries: loadWordExplorerEntries(length), source: 'bundled', message }
}

export async function loadWordExplorerEntriesFromLive(
  length: number,
  options: WordExplorerLiveLoadOptions = {},
): Promise<WordExplorerLoadResult> {
  const fetchJson = options.fetchJson ?? (typeof fetch === 'function'
    ? async (url: string) => {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}.`)
        }
        return response.json() as Promise<unknown>
      }
    : undefined)
  if (!fetchJson) {
    return bundledResult(length, 'Live manifest unavailable; showing bundled data.')
  }

  try {
    const manifestResponse = await fetchJson(options.manifestUrl ?? WORD_LIST_MANIFEST_ENDPOINT)
    if (!isManifestResponse(manifestResponse) || !manifestResponse.ok || !manifestResponse.manifest) {
      return bundledResult(length, 'Live manifest unavailable; showing bundled data.')
    }

    const entry = manifestResponse.manifest.entries.find((manifestEntry) => manifestEntry.length === length)
    if (!entry) {
      return bundledResult(length, 'Selected length is not in the live manifest; showing bundled data.')
    }

    const liveFile = await fetchJson(entry.url)
    const validation = validateWordListFile(liveFile)
    if (isSchemaValidationFailure(validation)) {
      return bundledResult(length, 'Live word list did not validate; showing bundled data.')
    }

    return { entries: buildWordExplorerEntries(validation.value, length), source: 'live' }
  } catch {
    return bundledResult(length, 'Live word list fetch failed; showing bundled data.')
  }
}

export interface WordExplorerFilter {
  readonly searchTerm: string
  readonly showAnswers: boolean
  readonly showValidGuesses: boolean
  readonly difficulty?: DifficultyTier | 'all'
}

export type SortField = 'word' | 'type' | 'difficulty'
export type SortDirection = 'asc' | 'desc'

export interface WordExplorerSort {
  readonly field: SortField
  readonly direction: SortDirection
}

function matchesTypeFilter(entry: WordExplorerEntry, filter: WordExplorerFilter): boolean {
  if (filter.showAnswers && entry.types.has('answer')) {
    return true
  }
  if (filter.showValidGuesses && entry.types.has('valid-guess')) {
    return true
  }
  return false
}

function matchesDifficultyFilter(entry: WordExplorerEntry, filter: WordExplorerFilter): boolean {
  const difficulty = filter.difficulty ?? 'all'
  if (difficulty === 'all') {
    return true
  }
  // A word belongs to a tier if its minimal tier is at or below the requested
  // tier (Casual ⊆ Standard ⊆ Expert). Valid-guess-only words have no tier.
  if (!entry.difficulty) {
    return false
  }
  const rank: Record<DifficultyTier, number> = { casual: 0, standard: 1, expert: 2 }
  return rank[entry.difficulty] <= rank[difficulty]
}

function matchesSearchTerm(entry: WordExplorerEntry, searchTerm: string): boolean {
  const normalized = searchTerm.trim().toLocaleLowerCase('en-US')
  if (normalized.length === 0) {
    return true
  }
  return entry.word.toLocaleLowerCase('en-US').includes(normalized)
}

export function typeBadgeLabel(types: ReadonlySet<WordEntryType>): string {
  const labels: string[] = []
  if (types.has('answer')) {
    labels.push('Answer')
  }
  if (types.has('valid-guess')) {
    labels.push('Valid Guess')
  }
  return labels.join(' & ')
}

const DIFFICULTY_RANK: Record<DifficultyTier, number> = { casual: 0, standard: 1, expert: 2 }

/**
 * Human-readable difficulty label for a Word Explorer row. Because tiers are
 * nested, a Casual answer is also available at Standard and Expert; this is
 * reflected in the label so players understand the inclusion.
 */
export function difficultyBadgeLabel(difficulty: DifficultyTier | undefined): string {
  switch (difficulty) {
    case 'casual':
      return 'Casual · Standard · Expert'
    case 'standard':
      return 'Standard · Expert'
    case 'expert':
      return 'Expert only'
    default:
      return 'Valid guess only'
  }
}

function compareEntries(a: WordExplorerEntry, b: WordExplorerEntry, sort: WordExplorerSort): number {
  if (sort.field === 'word') {
    const ordering = a.word < b.word ? -1 : a.word > b.word ? 1 : 0
    return sort.direction === 'asc' ? ordering : -ordering
  }

  if (sort.field === 'difficulty') {
    // Valid-guess-only words (no tier) sort after all tiered answers.
    const rankA = a.difficulty ? DIFFICULTY_RANK[a.difficulty] : 3
    const rankB = b.difficulty ? DIFFICULTY_RANK[b.difficulty] : 3
    const ordering = rankA - rankB
    if (ordering !== 0) {
      return sort.direction === 'asc' ? ordering : -ordering
    }
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0
  }

  const labelA = typeBadgeLabel(a.types)
  const labelB = typeBadgeLabel(b.types)
  const ordering = labelA < labelB ? -1 : labelA > labelB ? 1 : 0
  if (ordering !== 0) {
    return sort.direction === 'asc' ? ordering : -ordering
  }

  // Stable secondary sort by word so the order is deterministic.
  return a.word < b.word ? -1 : a.word > b.word ? 1 : 0
}

export function filterAndSortEntries(
  entries: readonly WordExplorerEntry[],
  filter: WordExplorerFilter,
  sort: WordExplorerSort,
): readonly WordExplorerEntry[] {
  const filtered = entries.filter((entry) =>
    matchesTypeFilter(entry, filter)
    && matchesDifficultyFilter(entry, filter)
    && matchesSearchTerm(entry, filter.searchTerm))
  return [...filtered].sort((a, b) => compareEntries(a, b, sort))
}

export function emptyStateMessage(searchTerm: string, length: number): string {
  return `"${searchTerm}" is not in the current ${length}-letter word list.`
}
