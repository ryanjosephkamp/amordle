import { list, put } from '@vercel/blob'
import type {
  AtomicSwapInput,
  AtomicSwapResult,
  ServedManifest,
  WordListStore,
} from '../../src/data/refreshStore.js'
import { projectManifest } from '../../src/data/refreshStore.js'

const MANIFEST_PATHNAME = 'word-lists/manifest.json'

function lengthPathname(revision: string, length: number): string {
  return `word-lists/${revision}/words_length_${length}.json`
}

/**
 * Vercel Blob–backed word-list store.
 *
 * Server-only. Never import from client code — `@vercel/blob` requires
 * `BLOB_READ_WRITE_TOKEN` and is intended exclusively for serverless / API
 * routes.
 *
 * Atomic-swap discipline:
 *   1. Every length file is uploaded under the revision-prefixed pathname
 *      `word-lists/<revision>/words_length_<n>.json` first. Each upload is
 *      independent; if any one fails the swap aborts with
 *      `previousServedSetIntact: true` because the manifest pointer has not
 *      been touched yet.
 *   2. Only after every length upload succeeds is the manifest pointer
 *      written to `word-lists/manifest.json` with `allowOverwrite: true`.
 *      Vercel Blob's `put` either succeeds atomically or fails; readers
 *      cannot observe a half-written manifest blob.
 *
 * Public read access is intentional so the public `GET /api/word-lists/manifest`
 * endpoint (and clients) can fetch the live manifest without coordinating
 * tokens. Per-length blobs are equally public; the dictionaries themselves
 * are derived from a public Hugging Face dataset and contain no secrets.
 */
export class VercelBlobWordListStore implements WordListStore {
  readonly name = 'vercel-blob'
  private readonly token: string

  constructor(token: string) {
    this.token = token
  }

  async loadManifest(): Promise<ServedManifest | null> {
    const listed = await list({ prefix: MANIFEST_PATHNAME, token: this.token })
    const match = listed.blobs.find((blob) => blob.pathname === MANIFEST_PATHNAME)
    if (!match) {
      return null
    }
    const response = await fetch(match.url, { cache: 'no-store' })
    if (!response.ok) {
      return null
    }
    return await response.json() as ServedManifest
  }

  async atomicSwap(input: AtomicSwapInput): Promise<AtomicSwapResult> {
    const { refresh } = input

    // Read the prior manifest revision purely for reporting. A failure here
    // is non-fatal — we still want to attempt the swap because the most
    // common cause is "no manifest yet."
    let previousRevision: string | undefined
    try {
      const prior = await this.loadManifest()
      previousRevision = prior?.revision
    } catch {
      previousRevision = undefined
    }

    // 1. Upload every length file under a revision-prefixed pathname. Bail
    //    on the first failure without touching the manifest pointer.
    const uploadedUrls = new Map<number, string>()
    for (const file of refresh.files) {
      const pathname = lengthPathname(refresh.source.revision, file.length)
      try {
        const result = await put(pathname, JSON.stringify(file.file), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          allowOverwrite: true,
          token: this.token,
        })
        uploadedUrls.set(file.length, result.url)
      } catch (error) {
        return {
          status: 'failed',
          stage: 'upload-length',
          failedLength: file.length,
          message: error instanceof Error
            ? `Length ${file.length} upload failed: ${error.message}`
            : `Length ${file.length} upload failed.`,
          previousServedSetIntact: true,
        }
      }
    }

    // 2. Build the manifest using the uploaded URLs.
    const manifest = projectManifest(refresh, (length) => {
      const url = uploadedUrls.get(length)
      if (!url) {
        // Defensive: this would mean a logic bug, since every length must
        // have been uploaded above before we reach this point.
        throw new Error(`Internal error: missing upload URL for length ${length}.`)
      }
      return url
    })

    // 3. Atomically swap the manifest pointer. `put` either succeeds and the
    //    new manifest becomes visible, or it fails and the previously served
    //    manifest is left in place.
    try {
      await put(MANIFEST_PATHNAME, JSON.stringify(manifest), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        token: this.token,
      })
    } catch (error) {
      return {
        status: 'failed',
        stage: 'upload-manifest',
        message: error instanceof Error
          ? `Manifest pointer swap failed: ${error.message}`
          : 'Manifest pointer swap failed.',
        previousServedSetIntact: true,
      }
    }

    return {
      status: 'swapped',
      manifest,
      previousRevision,
    }
  }
}
