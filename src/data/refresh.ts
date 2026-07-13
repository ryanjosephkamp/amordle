/**
 * @module refresh
 *
 * @deprecated as the default gameplay loading path since Phase 17
 * (LOCAL-WORD-LISTS-SPEC-2026-05-28). The atomic refresh pipeline that
 * fetches the Hugging Face dataset and rebuilds the in-memory word-list
 * snapshot is no longer the gameplay default; gameplay reads `src/latest/`
 * via `localWordLists.ts`. This module remains compiled, tested, and
 * reachable from `/api/admin-refresh` and the Vercel Cron job as an
 * **optional admin-triggered override**. No logic was changed in Phase 17.3.
 */
import type { WordListFile } from './types.js'
import {
  isSchemaValidationFailure,
  validateWordListFile,
  type SchemaIssue,
} from './wordListSchema.js'
import {
  HUGGING_FACE_EXPECTED_LENGTHS,
  buildHuggingFaceFileUrl,
  type JsonFetcher,
} from './huggingFaceSource.js'

export interface RefreshSourceInfo {
  readonly datasetId: string
  readonly revision: string
  readonly generatedAt: string
}

export interface RefreshLengthSuccess {
  readonly length: number
  readonly ok: true
  readonly file: WordListFile
}

export interface RefreshLengthFailure {
  readonly length: number
  readonly ok: false
  readonly reason: 'fetch-failed' | 'invalid-payload'
  readonly message: string
  readonly issues?: readonly SchemaIssue[]
}

export type RefreshLengthResult = RefreshLengthSuccess | RefreshLengthFailure

export interface RefreshSuccess {
  readonly ok: true
  readonly source: RefreshSourceInfo
  readonly files: readonly RefreshLengthSuccess[]
  readonly fetchedAt: string
}

export interface RefreshFailure {
  readonly ok: false
  readonly source: RefreshSourceInfo
  readonly attempts: readonly RefreshLengthResult[]
  readonly failures: readonly RefreshLengthFailure[]
  readonly fetchedAt: string
  readonly message: string
}

export type RefreshResult = RefreshSuccess | RefreshFailure

export function isRefreshSuccess(result: RefreshResult): result is RefreshSuccess {
  return result.ok === true
}

export function isRefreshFailure(result: RefreshResult): result is RefreshFailure {
  return result.ok === false
}

export interface RefreshOptions {
  readonly fetchJson: JsonFetcher
  readonly source: RefreshSourceInfo
  readonly lengths?: readonly number[]
  readonly rawBase?: string
  readonly filename?: (length: number) => string
  readonly signal?: AbortSignal
  readonly now?: () => Date
}

/**
 * Coerce a raw Hugging Face payload into a WordListFile shape.
 *
 * The Hugging Face publisher may emit either:
 *   1. A WordListFile object that already matches the brrrdle schema, or
 *   2. A flat array of lowercase words.
 *
 * In case (2), metadata is injected from the refresh source info so the
 * resulting object passes the existing `validateWordListFile` checks. This
 * keeps `wordListSchema.ts` as the single source of truth for validation.
 */
function coercePayload(
  payload: unknown,
  length: number,
  source: RefreshSourceInfo,
): unknown {
  if (Array.isArray(payload)) {
    return {
      metadata: {
        length,
        source: `huggingface:${source.datasetId}`,
        version: source.revision,
        generatedAt: source.generatedAt,
      },
      answers: payload,
      validGuesses: payload,
    }
  }
  return payload
}

async function refreshOneLength(
  length: number,
  options: RefreshOptions,
): Promise<RefreshLengthResult> {
  const url = buildHuggingFaceFileUrl(length, {
    rawBase: options.rawBase,
    filename: options.filename,
  })

  let payload: unknown
  try {
    payload = await options.fetchJson(url, { signal: options.signal })
  } catch (error) {
    return {
      length,
      ok: false,
      reason: 'fetch-failed',
      message: error instanceof Error ? error.message : `Failed to fetch ${url}.`,
    }
  }

  const coerced = coercePayload(payload, length, options.source)
  const validation = validateWordListFile(coerced)
  if (isSchemaValidationFailure(validation)) {
    return {
      length,
      ok: false,
      reason: 'invalid-payload',
      message: `Word list for length ${length} failed schema validation.`,
      issues: validation.issues,
    }
  }
  if (validation.value.metadata.length !== length) {
    return {
      length,
      ok: false,
      reason: 'invalid-payload',
      message:
        `Word list for length ${length} reported metadata length ${validation.value.metadata.length}.`,
    }
  }

  return { length, ok: true, file: validation.value }
}

/**
 * Atomically fetch and validate the full set of length-indexed dictionaries
 * from the Hugging Face dataset.
 *
 * The pipeline is all-or-nothing: if any length fails to fetch or fails schema
 * validation, the overall result is a `RefreshFailure` and the caller must
 * leave any previously persisted dictionaries in place. Successful refreshes
 * return validated `WordListFile` objects which the caller may then persist
 * via an atomic swap into the production storage layer.
 *
 * The refresh pipeline is intentionally pure — it does no I/O beyond the
 * supplied `fetchJson` callback — so it can be reused identically by both the
 * scheduled cron route and the protected admin manual refresh route, and it
 * can be unit-tested without any network access.
 */
export async function refreshWordListsFromHuggingFace(
  options: RefreshOptions,
): Promise<RefreshResult> {
  const lengths = options.lengths ?? HUGGING_FACE_EXPECTED_LENGTHS
  const fetchedAt = (options.now?.() ?? new Date()).toISOString()

  const attempts: RefreshLengthResult[] = []
  for (const length of lengths) {
    attempts.push(await refreshOneLength(length, options))
  }

  const failures = attempts.filter((attempt): attempt is RefreshLengthFailure => !attempt.ok)
  if (failures.length > 0) {
    return {
      ok: false,
      source: options.source,
      attempts,
      failures,
      fetchedAt,
      message: `Refresh aborted: ${failures.length} of ${attempts.length} length file(s) failed.`,
    }
  }

  const files = attempts.filter((attempt): attempt is RefreshLengthSuccess => attempt.ok)
  return {
    ok: true,
    source: options.source,
    files,
    fetchedAt,
  }
}
