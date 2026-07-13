import type { RemoteWordListMetadata, WordListMetadata } from './types.js'
import bundledSource from './bundled/source.json' with { type: 'json' }
import { LOCAL_WORD_LISTS_MANIFEST, LOCAL_WORD_LISTS_SOURCE_PATH, LOCAL_WORD_LIST_LENGTHS } from './localWordLists.js'

export interface BundledSourceInfo {
  readonly datasetUrl: string
  readonly datasetId: string
  readonly folder: string
  readonly revision: string
  readonly generatedAt: string
  readonly lengths: readonly number[]
  readonly note?: string
}

export const BUNDLED_SOURCE: BundledSourceInfo = bundledSource

export const BUNDLED_DATA_VERSION = BUNDLED_SOURCE.revision

export const BUNDLED_METADATA = LOCAL_WORD_LIST_LENGTHS.map((length): WordListMetadata => ({
  generatedAt: LOCAL_WORD_LISTS_MANIFEST.generatedAt,
  length,
  source: `${LOCAL_WORD_LISTS_SOURCE_PATH} (${LOCAL_WORD_LISTS_MANIFEST.dataset} ${LOCAL_WORD_LISTS_MANIFEST.releaseDate})`,
  version: LOCAL_WORD_LISTS_MANIFEST.releaseDate || LOCAL_WORD_LISTS_MANIFEST.schemaVersion,
}))

export const BUNDLED_REMOTE_METADATA: RemoteWordListMetadata = {
  version: BUNDLED_DATA_VERSION,
  generatedAt: BUNDLED_SOURCE.generatedAt,
  lengths: BUNDLED_METADATA.map((metadata) => metadata.length),
}
