/**
 * Phase 17 — Local brrrdle Word List source.
 *
 * Lazily imports the 34 authoritative per-length JSON dictionaries committed
 * at `src/latest/words_length_N.json` (lengths 2..35) while keeping only the
 * answer-free `src/latest/manifest.json` eager,
 * synthesizes the legacy `WordListMetadata` block expected by the canonical
 * schema validator (`validateWordListFile`), and exposes:
 *
 *   - `LOCAL_WORD_LIST_LENGTHS`       — sorted `number[]` of available lengths.
 *   - `LOCAL_WORD_LISTS_MANIFEST`     — sanitized projection of `manifest.json`.
 *   - `LOCAL_WORD_LISTS_SOURCE_PATH`  — single loader-path constant for auditability.
 *   - `normalizeLocalWordListFile(raw, length)` — adapter used internally; exported for tests.
 *
 * Spec: `LOCAL-WORD-LISTS-SPEC-2026-05-28.md` and `AGENT-IMPLEMENTATION-PLAN.md` §22.
 *
 * Path reconciliation (per §22.1): the spec text refers to `src/latest/brrrdle/` while
 * the repository as-committed places the files directly at `src/latest/`. The on-disk
 * `src/latest/` layout is treated as authoritative; this single constant is the only
 * point that encodes the loader path so a future `git mv` can be a one-line change.
 *
 * Loader filename convention: `words_length_N.json` only. Transitional length-5
 * compatibility files (`brrrdle_words.json`, `brrrdle_words.txt`) at `src/latest/`
 * are intentionally ignored.
 */
import manifestJson from '../latest/manifest.json' with { type: 'json' }
/**
 * Historical seed JSONs at `src/data/bundled/` are kept on disk per §22.6
 * ("no file deletion"). They are no longer the gameplay source; however, the
 * tiny set of inline `answers[].definitions` they carry is merged into the
 * local source below when a seed answer is also present in the local list.
 * This preserves the existing definition behaviour for the small set of
 * curated answers documented in `src/data/bundled/source.json` without
 * re-introducing the seed as a primary loader (see §22.3 and §22.6).
 */

/**
 * Single loader-path constant. Encodes the on-disk layout chosen during
 * Phase 17.0 reconciliation (`src/latest/`, not `src/latest/brrrdle/`).
 */
export const LOCAL_WORD_LISTS_SOURCE_PATH = 'src/latest' as const

export interface LocalWordListsManifest {
  readonly dataset: string
  readonly schemaVersion: string
  readonly releaseDate: string
  readonly generatedAt: string
  readonly supportedWordLengths: { readonly min: number; readonly max: number }
  readonly totalWordCount: number
  readonly perLengthCounts: Readonly<Record<string, number>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(record: Record<string, unknown>, key: string, fallback: string): string {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function readNumberField(record: Record<string, unknown>, key: string, fallback: number): number {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function projectManifest(raw: unknown): LocalWordListsManifest {
  const record = isRecord(raw) ? raw : {}
  const supportedRaw = isRecord(record.supported_word_lengths) ? record.supported_word_lengths : {}
  const perLengthRaw = isRecord(record.per_length_counts) ? record.per_length_counts : {}
  const perLengthCounts: Record<string, number> = {}
  for (const [key, value] of Object.entries(perLengthRaw)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      perLengthCounts[key] = value
    }
  }
  return {
    dataset: readStringField(record, 'dataset', 'english-openlist-brrrdle'),
    schemaVersion: readStringField(record, 'schema_version', '2.0'),
    releaseDate: readStringField(record, 'release_date', ''),
    generatedAt: readStringField(record, 'generated_at', ''),
    supportedWordLengths: {
      min: readNumberField(supportedRaw, 'min', 2),
      max: readNumberField(supportedRaw, 'max', 35),
    },
    totalWordCount: readNumberField(record, 'total_word_count', 0),
    perLengthCounts,
  }
}

export const LOCAL_WORD_LISTS_MANIFEST: LocalWordListsManifest = projectManifest(manifestJson)

/**
 * Synthesize a `WordListFile`-shaped object from a raw `src/latest/words_length_N.json`
 * payload by injecting the legacy `metadata` block (`length`, `source`, `version`,
 * `generatedAt`) derived from the per-length file plus the global manifest. Any
 * existing `metadata.curation` block is preserved on the additive optional
 * `WordListMetadata.curation` field. `answers` and `validGuesses` are passed
 * through as-is so the canonical `validateWordListFile` schema runs the heavy
 * validation downstream.
 *
 * Importantly, this adapter does **not** validate the payload itself — it only
 * synthesizes metadata. A malformed local file (missing `answers`/`validGuesses`,
 * wrong-length words, non-string entries, etc.) is rejected when the result is
 * fed to `validateWordListFile`, producing the canonical `'invalid-bundled-list'`
 * failure surface in `loadBundledWordList`.
 */
function buildSeedDefinitionsForLength(rawSeed: unknown): ReadonlyMap<string, Readonly<Record<string, unknown>>[]> {
  const map = new Map<string, Readonly<Record<string, unknown>>[]>()
  if (!isRecord(rawSeed)) return map
  const answers = Array.isArray(rawSeed.answers) ? rawSeed.answers : []
  for (const entry of answers) {
    if (!isRecord(entry)) continue
    const word = typeof entry.word === 'string' ? entry.word.trim().toLocaleLowerCase('en-US') : undefined
    if (!word) continue
    if (!Array.isArray(entry.definitions) || entry.definitions.length === 0) continue
    const definitions = entry.definitions.filter((d): d is Record<string, unknown> => isRecord(d))
    if (definitions.length > 0) {
      map.set(word, definitions)
    }
  }
  return map
}

/**
 * Per-length seed-definition supplement (additive only). Maps a word in the
 * local source's answers list to its inline definitions from the historical
 * `src/data/bundled/` seed. Empty for lengths whose seed file has no inline
 * `answers[].definitions`.
 */
function mergeSeedDefinitionsIntoAnswers(rawAnswers: unknown, rawSeed: unknown): unknown {
  if (!Array.isArray(rawAnswers)) return rawAnswers
  const seedDefs = buildSeedDefinitionsForLength(rawSeed)
  if (seedDefs.size === 0) return rawAnswers
  return rawAnswers.map((entry) => {
    if (typeof entry !== 'string') return entry
    const normalized = entry.trim().toLocaleLowerCase('en-US')
    const definitions = seedDefs.get(normalized)
    return definitions ? { word: entry, definitions } : entry
  })
}

export function normalizeLocalWordListFile(raw: unknown, length: number, rawSeed?: unknown): unknown {
  const record = isRecord(raw) ? raw : {}
  const rawMetadata = isRecord(record.metadata) ? record.metadata : {}
  const rawCuration = isRecord(rawMetadata.curation) ? rawMetadata.curation : undefined

  const synthesizedMetadata: Record<string, unknown> = {
    length,
    source: `${LOCAL_WORD_LISTS_SOURCE_PATH} (${LOCAL_WORD_LISTS_MANIFEST.dataset} ${LOCAL_WORD_LISTS_MANIFEST.releaseDate})`,
    version: LOCAL_WORD_LISTS_MANIFEST.releaseDate || LOCAL_WORD_LISTS_MANIFEST.schemaVersion,
    generatedAt: LOCAL_WORD_LISTS_MANIFEST.generatedAt,
  }
  if (rawCuration) {
    synthesizedMetadata.curation = rawCuration
  }

  return {
    ...record,
    metadata: synthesizedMetadata,
    answers: mergeSeedDefinitionsIntoAnswers(record.answers, rawSeed),
    validGuesses: record.validGuesses,
  }
}

type WordListJsonModule = { readonly default: unknown }
type WordListModuleImporter = () => Promise<WordListJsonModule>

const LOCAL_WORD_LIST_IMPORTERS: Readonly<Record<number, WordListModuleImporter>> = {
  2: () => import('../latest/words_length_2.json'),
  3: () => import('../latest/words_length_3.json'),
  4: () => import('../latest/words_length_4.json'),
  5: () => import('../latest/words_length_5.json'),
  6: () => import('../latest/words_length_6.json'),
  7: () => import('../latest/words_length_7.json'),
  8: () => import('../latest/words_length_8.json'),
  9: () => import('../latest/words_length_9.json'),
  10: () => import('../latest/words_length_10.json'),
  11: () => import('../latest/words_length_11.json'),
  12: () => import('../latest/words_length_12.json'),
  13: () => import('../latest/words_length_13.json'),
  14: () => import('../latest/words_length_14.json'),
  15: () => import('../latest/words_length_15.json'),
  16: () => import('../latest/words_length_16.json'),
  17: () => import('../latest/words_length_17.json'),
  18: () => import('../latest/words_length_18.json'),
  19: () => import('../latest/words_length_19.json'),
  20: () => import('../latest/words_length_20.json'),
  21: () => import('../latest/words_length_21.json'),
  22: () => import('../latest/words_length_22.json'),
  23: () => import('../latest/words_length_23.json'),
  24: () => import('../latest/words_length_24.json'),
  25: () => import('../latest/words_length_25.json'),
  26: () => import('../latest/words_length_26.json'),
  27: () => import('../latest/words_length_27.json'),
  28: () => import('../latest/words_length_28.json'),
  29: () => import('../latest/words_length_29.json'),
  30: () => import('../latest/words_length_30.json'),
  31: () => import('../latest/words_length_31.json'),
  32: () => import('../latest/words_length_32.json'),
  33: () => import('../latest/words_length_33.json'),
  34: () => import('../latest/words_length_34.json'),
  35: () => import('../latest/words_length_35.json'),
}

const SEED_DEFINITION_IMPORTERS: Readonly<Record<number, WordListModuleImporter>> = {
  2: () => import('./bundled/words_length_2.json'),
  5: () => import('./bundled/words_length_5.json'),
}

export const LOCAL_WORD_LIST_LENGTHS: readonly number[] = Object.keys(LOCAL_WORD_LIST_IMPORTERS)
  .map(Number)
  .sort((a, b) => a - b)

export async function importRawLocalWordListFile(length: number): Promise<unknown> {
  const importer = LOCAL_WORD_LIST_IMPORTERS[length]
  if (!importer) {
    return undefined
  }
  const seedImporter = SEED_DEFINITION_IMPORTERS[length]
  const [wordListModule, seedModule] = await Promise.all([
    importer(),
    seedImporter?.(),
  ])
  return normalizeLocalWordListFile(wordListModule.default, length, seedModule?.default)
}
