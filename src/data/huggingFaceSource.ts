/**
 * @module huggingFaceSource
 *
 * @deprecated as the default gameplay loading path since Phase 17
 * (LOCAL-WORD-LISTS-SPEC-2026-05-28). The runtime Hugging Face fetch is
 * **no longer** the default source for gameplay word lists; that role now
 * belongs to the local source in `src/latest/` (see `localWordLists.ts` and
 * `wordLists.ts`). This module continues to compile, ships in the bundle,
 * and remains reachable from the `/api/admin-refresh` admin route as an
 * **optional override**. All existing tests in `huggingFaceSource.test.ts`
 * remain green; no logic was changed in Phase 17.3 — only this JSDoc banner
 * was added.
 */
import {
  MAX_PRACTICE_WORD_LENGTH,
  MIN_PRACTICE_WORD_LENGTH,
} from '../game/constants.js'
import type { RemoteWordListMetadata } from './types.js'

/**
 * Configuration for the authoritative upstream Hugging Face word-list source.
 *
 * Per `AGENT-IMPLEMENTATION-PLAN.md` Phase 2 and the v1.2 amendment, the dataset
 * `ryanjosephkamp/english-openlist` exposes the `latest/brrrdle/` folder, which
 * contains exactly 34 JSON dictionaries — one for every word length from
 * `MIN_PRACTICE_WORD_LENGTH` through `MAX_PRACTICE_WORD_LENGTH`. The dataset is
 * public, so only anonymous read access is required.
 */
export const HUGGING_FACE_DATASET_ID = 'ryanjosephkamp/english-openlist'

export const HUGGING_FACE_DATASET_FOLDER = 'latest/brrrdle'

export const HUGGING_FACE_DATASET_URL =
  `https://huggingface.co/datasets/${HUGGING_FACE_DATASET_ID}`

/**
 * Hugging Face dataset API base for fetching repository metadata such as the
 * current revision (`sha`) and `lastModified` timestamp.
 */
export const HUGGING_FACE_API_BASE =
  `https://huggingface.co/api/datasets/${HUGGING_FACE_DATASET_ID}`

/**
 * Default base URL used when fetching raw dataset files. The `main` branch is
 * used because the dataset is regenerated in place on `main` and the
 * `latest/brrrdle/` folder always reflects the most recent nightly run.
 */
export const HUGGING_FACE_RAW_BASE =
  `https://huggingface.co/datasets/${HUGGING_FACE_DATASET_ID}/resolve/main`

export const HUGGING_FACE_EXPECTED_LENGTHS: readonly number[] = Array.from(
  { length: MAX_PRACTICE_WORD_LENGTH - MIN_PRACTICE_WORD_LENGTH + 1 },
  (_, index) => index + MIN_PRACTICE_WORD_LENGTH,
)

export const HUGGING_FACE_EXPECTED_FILE_COUNT = HUGGING_FACE_EXPECTED_LENGTHS.length

/**
 * Default per-length JSON filename inside `latest/brrrdle/`. The Hugging Face
 * publisher controls the actual filenames; the refresh pipeline accepts a
 * filename builder so a different convention can be adopted without code
 * changes here.
 */
export function defaultHuggingFaceFilename(length: number): string {
  return `words_length_${length}.json`
}

export function buildHuggingFaceFileUrl(
  length: number,
  options?: { readonly rawBase?: string; readonly filename?: (length: number) => string },
): string {
  const rawBase = options?.rawBase ?? HUGGING_FACE_RAW_BASE
  const filename = (options?.filename ?? defaultHuggingFaceFilename)(length)
  return `${rawBase}/${HUGGING_FACE_DATASET_FOLDER}/${filename}`
}

export interface HuggingFaceDatasetInfo {
  readonly sha: string
  readonly lastModified: string
}

/**
 * Minimal type guard for the Hugging Face dataset info endpoint response.
 * The dataset info endpoint returns many fields; this guard only validates the
 * ones we actually rely on (`sha`, `lastModified`).
 */
function isHuggingFaceDatasetInfo(value: unknown): value is HuggingFaceDatasetInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const info = value as Record<string, unknown>
  return typeof info.sha === 'string' &&
    info.sha.length > 0 &&
    typeof info.lastModified === 'string' &&
    info.lastModified.length > 0
}

export type JsonFetcher = (url: string, init?: { readonly signal?: AbortSignal }) => Promise<unknown>

/**
 * Fetch the current upstream revision metadata from Hugging Face and project
 * it onto the brrrdle `RemoteWordListMetadata` shape so existing update-check
 * logic can compare against it without changes.
 */
export async function fetchHuggingFaceRemoteMetadata(
  fetchJson: JsonFetcher,
  options?: { readonly apiBase?: string; readonly signal?: AbortSignal },
): Promise<RemoteWordListMetadata> {
  const apiBase = options?.apiBase ?? HUGGING_FACE_API_BASE
  const payload = await fetchJson(apiBase, { signal: options?.signal })
  if (!isHuggingFaceDatasetInfo(payload)) {
    throw new Error('Hugging Face dataset info response was malformed.')
  }
  return {
    version: payload.sha,
    generatedAt: payload.lastModified,
    lengths: [...HUGGING_FACE_EXPECTED_LENGTHS],
  }
}
