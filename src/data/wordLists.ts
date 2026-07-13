/**
 * Answer-free compatibility metadata for the local word-list source. Dictionary
 * payloads are prepared on demand through `loadWordList.ts`.
 *
 * Public surface preserved:
 *   - `BUNDLED_WORD_LIST_LENGTHS` — sorted `number[]` of available lengths.
 */
import { LOCAL_WORD_LIST_LENGTHS } from './localWordLists.js'

export const BUNDLED_WORD_LIST_LENGTHS: readonly number[] = LOCAL_WORD_LIST_LENGTHS
