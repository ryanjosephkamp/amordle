/**
 * @module updateCheck
 *
 * @deprecated as the default gameplay loading path since Phase 17
 * (LOCAL-WORD-LISTS-SPEC-2026-05-28). The Hugging Face remote-version
 * comparison is no longer consulted by gameplay by default; gameplay reads
 * the local source at `src/latest/` via `localWordLists.ts`. This module
 * remains compiled, tested, and reachable from the admin/cron flow as part
 * of the **optional override** path. No logic was changed in Phase 17.3.
 */
import type { RemoteWordListMetadata } from './types.js'

export interface UpdateCheckCurrent {
  readonly status: 'current'
  readonly remote: RemoteWordListMetadata
}

export interface UpdateCheckStale {
  readonly status: 'stale'
  readonly remote: RemoteWordListMetadata
  readonly missingLengths: readonly number[]
}

export interface UpdateCheckUnavailable {
  readonly status: 'unavailable'
  readonly reason: 'network-error' | 'malformed-metadata'
  readonly message: string
}

export type UpdateCheckResult = UpdateCheckCurrent | UpdateCheckStale | UpdateCheckUnavailable

export type MetadataFetcher = () => Promise<unknown>

function isRemoteMetadata(value: unknown): value is RemoteWordListMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const metadata = value as Record<string, unknown>
  return typeof metadata.version === 'string' &&
    typeof metadata.generatedAt === 'string' &&
    Array.isArray(metadata.lengths) &&
    metadata.lengths.every((length) => Number.isInteger(length))
}

export async function checkForWordListUpdates(
  bundled: RemoteWordListMetadata,
  fetchMetadata: MetadataFetcher,
): Promise<UpdateCheckResult> {
  let remoteValue: unknown
  try {
    remoteValue = await fetchMetadata()
  } catch (error) {
    return {
      status: 'unavailable',
      reason: 'network-error',
      message: error instanceof Error ? error.message : 'Unable to fetch remote word-list metadata.',
    }
  }

  if (!isRemoteMetadata(remoteValue)) {
    return {
      status: 'unavailable',
      reason: 'malformed-metadata',
      message: 'Remote word-list metadata was malformed.',
    }
  }

  const missingLengths = remoteValue.lengths.filter((length) => !bundled.lengths.includes(length))
  if (remoteValue.version !== bundled.version || missingLengths.length > 0) {
    return {
      status: 'stale',
      remote: remoteValue,
      missingLengths,
    }
  }

  return {
    status: 'current',
    remote: remoteValue,
  }
}
