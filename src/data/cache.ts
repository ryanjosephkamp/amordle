import type { PlayScope } from '../game/types.js'
import type { NormalizedWordList } from './types.js'
import { loadBundledWordList } from './loadWordList.js'
import { getDataStatus, type DataStatus } from './status.js'

export interface CachedWordListResult {
  readonly status: DataStatus
  readonly wordList?: NormalizedWordList
}

const cache = new Map<string, NormalizedWordList>()

function cacheKey(scope: PlayScope, length: number): string {
  return `${scope}:${length}`
}

export function clearWordListCache(): void {
  cache.clear()
}

export function getCachedWordList(scope: PlayScope, length: number): CachedWordListResult {
  const key = cacheKey(scope, length)
  const cached = cache.get(key)
  if (cached) {
    return {
      status: getDataStatus('ready'),
      wordList: cached,
    }
  }

  const bundled = loadBundledWordList(scope, length)
  if (!bundled.ok) {
    return {
      status: getDataStatus('failed'),
    }
  }

  cache.set(key, bundled.wordList)
  return {
    status: getDataStatus('fallback'),
    wordList: bundled.wordList,
  }
}
