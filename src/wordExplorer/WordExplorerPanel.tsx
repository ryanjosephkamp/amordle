import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Dialog, Panel } from '../ui'
import { DefinitionPanel } from '../definitions'
import { DIFFICULTY_TIERS, getDifficultyTierMeta, isDifficultyTier, type DifficultyTier } from '../data/difficulty'
import { useWordListPreparation } from '../data/useWordListPreparation'
import { buildWordRequestIssueUrl } from '../lib/githubIssue'
import {
  DEFAULT_WORD_EXPLORER_LENGTH,
  WORD_EXPLORER_LENGTHS,
  difficultyBadgeLabel,
  emptyStateMessage,
  filterAndSortEntries,
  loadWordExplorerEntries,
  loadWordExplorerEntriesFromLive,
  typeBadgeLabel,
  type SortDirection,
  type SortField,
  type WordExplorerLoadResult,
} from './wordExplorerData'

function currentIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

const PAGE_SIZE_OPTIONS = [10, 50, 100] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to false
  }
  return false
}

export function WordExplorerPanel() {
  const [length, setLength] = useState<number>(DEFAULT_WORD_EXPLORER_LENGTH)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [showAnswers, setShowAnswers] = useState<boolean>(true)
  const [showValidGuesses, setShowValidGuesses] = useState<boolean>(true)
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyTier | 'all'>('all')
  const [sortField, setSortField] = useState<SortField>('word')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [pageIndex, setPageIndex] = useState(0)
  const [copiedWord, setCopiedWord] = useState<string | undefined>(undefined)
  const [definitionWord, setDefinitionWord] = useState<string | undefined>(undefined)
  const preparation = useWordListPreparation('practice', length)
  const bundledEntries = useMemo(
    () => preparation.isReady ? loadWordExplorerEntries(length) : [],
    [length, preparation.isReady],
  )
  const [liveLoad, setLiveLoad] = useState<{ readonly length: number; readonly result: WordExplorerLoadResult } | undefined>(undefined)

  useEffect(() => {
    if (!preparation.isReady) {
      return undefined
    }
    let isMounted = true
    void loadWordExplorerEntriesFromLive(length).then((result) => {
      if (isMounted) {
        setLiveLoad({ length, result })
      }
    })
    return () => {
      isMounted = false
    }
  }, [length, preparation.isReady])

  const effectiveLoad = liveLoad?.length === length
    ? liveLoad.result
    : {
        entries: bundledEntries,
        source: 'bundled' as const,
        message: preparation.error ?? (preparation.isReady ? 'Checking live word list…' : 'Preparing the selected word length…'),
      }
  const entries = effectiveLoad.entries
  const filtered = useMemo(
    () => filterAndSortEntries(entries, { searchTerm, showAnswers, showValidGuesses, difficulty: difficultyFilter }, { field: sortField, direction: sortDirection }),
    [entries, searchTerm, showAnswers, showValidGuesses, difficultyFilter, sortField, sortDirection],
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const pageStartIndex = safePageIndex * pageSize
  const pageEntries = useMemo(
    () => filtered.slice(pageStartIndex, pageStartIndex + pageSize),
    [filtered, pageSize, pageStartIndex],
  )
  const visibleStart = filtered.length === 0 ? 0 : pageStartIndex + 1
  const visibleEnd = Math.min(filtered.length, pageStartIndex + pageEntries.length)

  const toggleSort = useCallback((field: SortField) => {
    setPageIndex(0)
    if (field === sortField) {
      setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }, [sortField])

  const handleCopy = useCallback(async (word: string) => {
    const ok = await copyToClipboard(word)
    if (ok) {
      setCopiedWord(word)
      setTimeout(() => setCopiedWord((current) => (current === word ? undefined : current)), 1200)
    }
  }, [])

  const requestUrl = useMemo(
    () => buildWordRequestIssueUrl({ word: searchTerm.trim(), length, date: currentIsoDate() }),
    [searchTerm, length],
  )

  const showEmptyState = filtered.length === 0 && searchTerm.trim().length > 0 && (showAnswers || showValidGuesses)

  return (
    <section className="space-y-4" aria-labelledby="word-explorer-title">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">word data</p>
      <h2 id="word-explorer-title" className="text-3xl font-bold text-white">Word Explorer</h2>
      <p className="max-w-3xl text-base leading-7 text-slate-300">
        Browse and search the exact words this build of amordle is using. Choose a length, search the live list,
        and request additions for missing words.
      </p>

      <Panel className="space-y-3 text-sm leading-6 text-slate-300" tone="muted">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 font-semibold text-cyan-100">
            Length
            <select
              aria-label="Word length"
              className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
              onChange={(event) => {
                setLength(Number(event.target.value))
                setPageIndex(0)
              }}
              value={length}
            >
              {WORD_EXPLORER_LENGTHS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-semibold text-cyan-100 sm:col-span-2 lg:col-span-2">
            Search
            <input
              aria-label="Search words"
              className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
              onChange={(event) => {
                setSearchTerm(event.target.value)
                setPageIndex(0)
              }}
              placeholder={`Filter ${length}-letter words…`}
              type="search"
              value={searchTerm}
            />
          </label>
          <div className="grid gap-1 font-semibold text-cyan-100">
            <span>Show</span>
            <label className="flex items-center gap-2 text-slate-100">
              <input
                checked={showAnswers}
                onChange={(event) => {
                  setShowAnswers(event.target.checked)
                  setPageIndex(0)
                }}
                type="checkbox"
              /> Answers
            </label>
            <label className="flex items-center gap-2 text-slate-100">
              <input
                checked={showValidGuesses}
                onChange={(event) => {
                  setShowValidGuesses(event.target.checked)
                  setPageIndex(0)
                }}
                type="checkbox"
              /> Valid Guesses
            </label>
          </div>
          <label className="grid gap-1 font-semibold text-cyan-100">
            Difficulty
            <select
              aria-label="Filter by difficulty"
              className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
              onChange={(event) => {
                setDifficultyFilter(isDifficultyTier(event.target.value) ? event.target.value : 'all')
                setPageIndex(0)
              }}
              value={difficultyFilter}
            >
              <option value="all">All answers &amp; guesses</option>
              {DIFFICULTY_TIERS.map((tier) => (
                <option key={tier} value={tier}>{getDifficultyTierMeta(tier).label} answers</option>
              ))}
            </select>
          </label>
        </div>
        <p aria-live="polite" className="text-xs text-slate-400">
          Showing {filtered.length} of {entries.length} {length}-letter word{entries.length === 1 ? '' : 's'} from {effectiveLoad.source === 'live' ? 'the live manifest' : 'bundled fallback data'}.
          {effectiveLoad.message ? ` ${effectiveLoad.message}` : ''}
        </p>
        {preparation.error ? <Button onClick={preparation.retry} size="sm" variant="primary">Retry word data</Button> : null}
        {filtered.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-950/70 p-3">
            <p className="text-xs text-slate-300">
              Rows {visibleStart}-{visibleEnd} of {filtered.length}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cyan-100">
                Rows
                <select
                  aria-label="Rows per page"
                  className="rounded-lg border border-slate-600 bg-slate-950 px-2 py-1 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (PAGE_SIZE_OPTIONS.includes(next as PageSize)) {
                      setPageSize(next as PageSize)
                      setPageIndex(0)
                    }
                  }}
                  value={pageSize}
                >
                  {PAGE_SIZE_OPTIONS.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <Button disabled={safePageIndex === 0} onClick={() => setPageIndex(Math.max(0, safePageIndex - 1))} size="sm" variant="secondary">
                Previous
              </Button>
              <span className="min-w-20 text-center text-xs text-slate-300">
                {safePageIndex + 1} / {pageCount}
              </span>
              <Button disabled={safePageIndex >= pageCount - 1} onClick={() => setPageIndex(Math.min(pageCount - 1, safePageIndex + 1))} size="sm" variant="secondary">
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Panel>

      {showEmptyState ? (
        <Panel className="space-y-3 text-sm leading-6 text-slate-200" tone="muted">
          <p>{emptyStateMessage(searchTerm.trim(), length)}</p>
          <a
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-ice-200)] bg-[var(--color-ice-200)] px-4 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
            href={requestUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Request this word
          </a>
        </Panel>
      ) : null}

      {filtered.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/60">
          <table className="hidden w-full table-fixed text-left text-sm md:table">
            <thead className="bg-slate-900/80 text-xs uppercase tracking-wider text-cyan-100">
              <tr>
                <th className="w-1/4 px-4 py-3">
                  <button
                    aria-label={`Sort by word (currently ${sortField === 'word' ? sortDirection : 'unsorted'})`}
                    className="inline-flex items-center gap-1 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                    onClick={() => toggleSort('word')}
                    type="button"
                  >
                    Word{sortField === 'word' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
                <th className="w-1/4 px-4 py-3">
                  <button
                    aria-label={`Sort by type (currently ${sortField === 'type' ? sortDirection : 'unsorted'})`}
                    className="inline-flex items-center gap-1 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                    onClick={() => toggleSort('type')}
                    type="button"
                  >
                    Type{sortField === 'type' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
                <th className="w-1/4 px-4 py-3">
                  <button
                    aria-label={`Sort by difficulty (currently ${sortField === 'difficulty' ? sortDirection : 'unsorted'})`}
                    className="inline-flex items-center gap-1 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                    onClick={() => toggleSort('difficulty')}
                    type="button"
                  >
                    Difficulty{sortField === 'difficulty' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
                <th className="w-1/4 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map((entry) => (
                <tr key={entry.word} className="border-t border-slate-800 text-slate-100">
                  <td className="px-4 py-2 font-mono">{entry.word}</td>
                  <td className="px-4 py-2 text-slate-300">{typeBadgeLabel(entry.types)}</td>
                  <td className="px-4 py-2 text-slate-300">{difficultyBadgeLabel(entry.difficulty)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        aria-label={`Define ${entry.word}`}
                        onClick={() => setDefinitionWord(entry.word)}
                        size="sm"
                        variant="secondary"
                      >
                        Define
                      </Button>
                      <Button
                        aria-label={`Copy ${entry.word} to clipboard`}
                        onClick={() => void handleCopy(entry.word)}
                        size="sm"
                        variant="secondary"
                      >
                        {copiedWord === entry.word ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="brrrdle-word-explorer-mobile-list grid gap-2 p-3 md:hidden">
            {pageEntries.map((entry) => (
              <li key={entry.word} className="brrrdle-word-explorer-mobile-row rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-100">
                <p className="font-mono text-base">{entry.word}</p>
                <p className="mt-1 text-xs text-slate-300">{typeBadgeLabel(entry.types)}</p>
                <p className="mt-1 text-xs text-slate-400">{difficultyBadgeLabel(entry.difficulty)}</p>
                <div className="mt-2 flex gap-2">
                  <Button
                    aria-label={`Define ${entry.word}`}
                    onClick={() => setDefinitionWord(entry.word)}
                    size="sm"
                    variant="secondary"
                  >
                    Define
                  </Button>
                  <Button
                    aria-label={`Copy ${entry.word} to clipboard`}
                    onClick={() => void handleCopy(entry.word)}
                    size="sm"
                    variant="secondary"
                  >
                    {copiedWord === entry.word ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog
        description="Definitions are looked up live; difficulty does not affect which words are valid guesses."
        isOpen={definitionWord !== undefined}
        onClose={() => setDefinitionWord(undefined)}
        title={definitionWord ? definitionWord.toLocaleUpperCase('en-US') : 'Definitions'}
      >
        {definitionWord ? (
          <DefinitionPanel
            enabled
            mode="og"
            scope="practice"
            word={definitionWord}
            wordLength={length}
          />
        ) : null}
      </Dialog>
    </section>
  )
}
