/**
 * @module refreshStore
 *
 * @deprecated as the default gameplay loading path since Phase 17
 * (LOCAL-WORD-LISTS-SPEC-2026-05-28). The in-memory refresh store that holds
 * the most recent Hugging Face snapshot is no longer consulted by gameplay
 * by default; gameplay reads the local source at `src/latest/` via
 * `localWordLists.ts`. The refresh store remains compiled, tested, and
 * available as an **optional override** when triggered by `/api/admin-refresh`.
 * No logic was changed in Phase 17.3.
 */
import type { WordListFile } from './types.js'
import type { RefreshSuccess } from './refresh.js'

/**
 * Per-length entry in the served word-list manifest. The manifest is the
 * single source of truth that the client-side update-check helper consults to
 * learn what revision the server is currently serving and which lengths are
 * available.
 */
export interface ManifestEntry {
  readonly length: number
  /** Absolute URL or storage-relative key the runtime can fetch this length from. */
  readonly url: string
  /** Number of answer entries persisted for this length. */
  readonly answers: number
  /** Number of valid-guess entries persisted for this length. */
  readonly validGuesses: number
  /** Per-length status. `served` means the length is live on the production read path. */
  readonly status: 'served'
}

/**
 * Served word-list manifest. The manifest is updated atomically: callers must
 * write all length objects first and only then update the pointer to this
 * manifest, so partial writes cannot corrupt the live read path.
 */
export interface ServedManifest {
  readonly revision: string
  readonly generatedAt: string
  readonly fetchedAt: string
  readonly source: {
    readonly datasetId: string
  }
  readonly entries: readonly ManifestEntry[]
}

export interface AtomicSwapInput {
  readonly refresh: RefreshSuccess
}

export interface AtomicSwapSkipped {
  readonly status: 'skipped'
  readonly reason: string
}

export interface AtomicSwapSuccess {
  readonly status: 'swapped'
  readonly manifest: ServedManifest
  /** Manifest revision that was previously served, if any. */
  readonly previousRevision?: string
}

export interface AtomicSwapFailed {
  readonly status: 'failed'
  readonly stage: 'upload-length' | 'upload-manifest'
  readonly failedLength?: number
  readonly message: string
  /** Whether the previously served set is intact. The store guarantees `true` for upload-length failures because the manifest pointer is only updated after every length succeeds. */
  readonly previousServedSetIntact: boolean
}

export type AtomicSwapResult = AtomicSwapSkipped | AtomicSwapSuccess | AtomicSwapFailed

/**
 * Server-side word-list persistence store.
 *
 * Drivers implement `atomicSwap` so that:
 *   1. Each length file is uploaded under a revision-prefixed key first.
 *   2. The shared manifest pointer is only updated *after* every length
 *      upload succeeds.
 *   3. If any length upload fails, the previously-served manifest pointer is
 *      left untouched and the live read path continues to serve the prior
 *      revision.
 *
 * Drivers should be safe to import from a Vercel function/edge route. They
 * must never be imported by client code.
 */
export interface WordListStore {
  readonly name: string
  loadManifest(): Promise<ServedManifest | null>
  atomicSwap(input: AtomicSwapInput): Promise<AtomicSwapResult>
}

/**
 * Build a `ServedManifest` from a successful refresh and a per-length URL
 * resolver. Extracted so the same projection is used by every driver.
 */
export function projectManifest(
  refresh: RefreshSuccess,
  resolveUrl: (length: number, file: WordListFile) => string,
): ServedManifest {
  return {
    revision: refresh.source.revision,
    generatedAt: refresh.source.generatedAt,
    fetchedAt: refresh.fetchedAt,
    source: { datasetId: refresh.source.datasetId },
    entries: refresh.files.map((file) => ({
      length: file.length,
      url: resolveUrl(file.length, file.file),
      answers: file.file.answers.length,
      validGuesses: file.file.validGuesses.length,
      status: 'served',
    })),
  }
}

/**
 * In-memory store used for tests and for safely no-op'ing when no production
 * storage is configured. Production drivers (Vercel Blob, Supabase Storage,
 * S3, etc.) implement the same `WordListStore` interface.
 */
export class InMemoryWordListStore implements WordListStore {
  readonly name = 'memory'
  private manifest: ServedManifest | null = null
  private readonly lengths = new Map<string, WordListFile>()

  loadManifest(): Promise<ServedManifest | null> {
    return Promise.resolve(this.manifest)
  }

  async atomicSwap(input: AtomicSwapInput): Promise<AtomicSwapResult> {
    const { refresh } = input
    const previousRevision = this.manifest?.revision

    // 1. Stage every length upload first. A simulated failure could be
    //    injected by a subclass; here uploads always succeed.
    const staged = new Map<string, WordListFile>()
    for (const file of refresh.files) {
      const key = `${refresh.source.revision}/words_length_${file.length}.json`
      staged.set(key, file.file)
    }

    // 2. Only after every length upload succeeds do we move the pointer.
    for (const [key, value] of staged) {
      this.lengths.set(key, value)
    }
    const manifest = projectManifest(
      refresh,
      (length) => `memory:${refresh.source.revision}/words_length_${length}.json`,
    )
    this.manifest = manifest

    return {
      status: 'swapped',
      manifest,
      previousRevision,
    }
  }

  /** Test/inspection helper — returns the keys persisted so far. */
  listKeys(): readonly string[] {
    return Array.from(this.lengths.keys())
  }
}

/**
 * Wraps a `WordListStore` to simulate a per-length upload failure on the
 * provided length. Used exclusively by tests to assert atomic-rollback
 * behavior of drivers that follow the upload-then-swap discipline.
 */
export class FailingInMemoryWordListStore implements WordListStore {
  readonly name = 'memory-failing'
  private readonly delegate = new InMemoryWordListStore()
  private readonly failOnLength: number
  constructor(failOnLength: number) {
    this.failOnLength = failOnLength
  }

  loadManifest(): Promise<ServedManifest | null> {
    return this.delegate.loadManifest()
  }

  async atomicSwap(input: AtomicSwapInput): Promise<AtomicSwapResult> {
    const failingFile = input.refresh.files.find((file) => file.length === this.failOnLength)
    if (failingFile) {
      // Intentionally short-circuit before any internal upload would happen,
      // so the manifest pointer is not moved.
      return {
        status: 'failed',
        stage: 'upload-length',
        failedLength: this.failOnLength,
        message: `Simulated upload failure for length ${this.failOnLength}.`,
        previousServedSetIntact: true,
      }
    }
    return this.delegate.atomicSwap(input)
  }
}
