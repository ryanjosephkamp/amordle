import type { WordListStore } from '../../src/data/refreshStore.js'
import { VercelBlobWordListStore } from './vercelBlobStore.js'

export interface ResolvedWordListStore {
  readonly store: WordListStore | null
  readonly reason?: string
}

/**
 * Resolve the production `WordListStore` from the deployment-environment
 * configuration.
 *
 * Selection order:
 *   1. If `BLOB_READ_WRITE_TOKEN` is set, return a `VercelBlobWordListStore`.
 *   2. Otherwise, return `null` with a human-readable reason. The cron and
 *      admin handlers translate `null` into an `AtomicSwapSkipped` result
 *      so the refresh pipeline still validates upstream files (and returns
 *      them in the response) without breaking the deployment.
 *
 * This keeps the project vendor-neutral: replacing Vercel Blob with Supabase
 * Storage, S3, etc. is a one-driver change to this factory. The
 * `WordListStore` interface and the cron/admin call sites stay constant.
 */
export function resolveWordListStore(): ResolvedWordListStore {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken && blobToken.trim().length > 0) {
    return { store: new VercelBlobWordListStore(blobToken) }
  }
  return {
    store: null,
    reason: 'No production word-list store configured. Set BLOB_READ_WRITE_TOKEN to enable Vercel Blob persistence, or wire a different driver in api/_lib/wordListStore.ts.',
  }
}
