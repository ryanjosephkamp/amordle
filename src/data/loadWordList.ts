import { DAILY_WORD_LENGTH, isSupportedDailyWordLength, isSupportedPracticeWordLength } from '../game/constants.js'
import type { PlayScope } from '../game/types.js'
import type { NormalizedWordList, WordDefinitionEntry, WordListFile } from './types.js'
import { isSchemaValidationFailure, validateWordListFile } from './wordListSchema.js'
import { importRawLocalWordListFile, normalizeLocalWordListFile } from './localWordLists.js'

export interface LoadWordListSuccess {
  readonly ok: true
  readonly wordList: NormalizedWordList
}

export interface LoadWordListFailure {
  readonly ok: false
  readonly reason: 'unsupported-length' | 'daily-length-locked' | 'missing-bundled-list' | 'invalid-bundled-list' | 'word-list-not-prepared' | 'word-list-load-failed'
  readonly message: string
}

export type LoadWordListResult = LoadWordListSuccess | LoadWordListFailure

export function isLoadWordListSuccess(
  result: LoadWordListResult,
): result is LoadWordListSuccess {
  return result.ok === true
}

export function isLoadWordListFailure(
  result: LoadWordListResult,
): result is LoadWordListFailure {
  return result.ok === false
}

interface ResolveWordListLengthSuccess {
  readonly ok: true
  readonly length: number
}

type ResolveWordListLengthResult = LoadWordListFailure | ResolveWordListLengthSuccess

function normalizeWordList(file: WordListFile): NormalizedWordList {
  const validGuesses = new Set(file.validGuesses)
  const definitionsByWord = new Map<string, readonly WordDefinitionEntry[]>()

  for (const answer of file.answers) {
    if (answer.definitions && answer.definitions.length > 0) {
      definitionsByWord.set(answer.word, answer.definitions)
    }
  }

  return {
    metadata: file.metadata,
    answers: file.answers,
    validGuesses,
    definitionsByWord,
  }
}

type WordListImporter = (length: number) => Promise<unknown>

const preparedWordLists = new Map<number, LoadWordListSuccess>()
const inFlightWordLists = new Map<number, Promise<LoadWordListResult>>()
let wordListImporter: WordListImporter = importRawLocalWordListFile

async function prepareResolvedWordList(length: number): Promise<LoadWordListResult> {
  const prepared = preparedWordLists.get(length)
  if (prepared) {
    return prepared
  }

  const activeRequest = inFlightWordLists.get(length)
  if (activeRequest) {
    return activeRequest
  }

  const request = wordListImporter(length)
    .then((raw) => {
      if (raw === undefined) {
        return {
          ok: false,
          reason: 'missing-bundled-list',
          message: `No bundled word list is available for length ${length}.`,
        } satisfies LoadWordListFailure
      }

      const validation = validateWordListFile(normalizeLocalWordListFile(raw, length))
      if (isSchemaValidationFailure(validation)) {
        return {
          ok: false,
          reason: 'invalid-bundled-list',
          message: validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '),
        } satisfies LoadWordListFailure
      }

      const success: LoadWordListSuccess = {
        ok: true,
        wordList: normalizeWordList(validation.value),
      }
      preparedWordLists.set(length, success)
      return success
    })
    .catch(() => ({
      ok: false,
      reason: 'word-list-load-failed',
      message: `Word data for length ${length} could not be prepared. Try again.`,
    } satisfies LoadWordListFailure))
    .finally(() => {
      inFlightWordLists.delete(length)
    })

  inFlightWordLists.set(length, request)
  return request
}

export function resolveWordListLength(scope: PlayScope, length: number): ResolveWordListLengthResult {
  if (scope === 'daily' && !isSupportedDailyWordLength(length)) {
    return {
      ok: false,
      reason: 'daily-length-locked',
      message: `Daily puzzles are locked to ${DAILY_WORD_LENGTH} letters at launch.`,
    }
  }

  if (!isSupportedPracticeWordLength(length)) {
    return {
      ok: false,
      reason: 'unsupported-length',
      message: `Practice length ${length} is outside the supported 2–35 range.`,
    }
  }

  return { ok: true, length }
}

export function loadBundledWordList(scope: PlayScope, length: number): LoadWordListResult {
  const resolvedLength = resolveWordListLength(scope, length)
  if (resolvedLength.ok === false) {
    return resolvedLength
  }

  const prepared = preparedWordLists.get(resolvedLength.length)
  if (!prepared) {
    return {
      ok: false,
      reason: 'word-list-not-prepared',
      message: `Word data for length ${resolvedLength.length} is still loading.`,
    }
  }
  return prepared
}

export async function prepareBundledWordList(scope: PlayScope, length: number): Promise<LoadWordListResult> {
  const resolvedLength = resolveWordListLength(scope, length)
  return resolvedLength.ok ? prepareResolvedWordList(resolvedLength.length) : resolvedLength
}

export async function prepareAllBundledWordLists(): Promise<readonly LoadWordListResult[]> {
  return Promise.all(Array.from({ length: 34 }, (_, index) => prepareBundledWordList('practice', index + 2)))
}

export function resetPreparedWordListsForTests(): void {
  preparedWordLists.clear()
  inFlightWordLists.clear()
}

export function setWordListImporterForTests(importer?: WordListImporter): void {
  wordListImporter = importer ?? importRawLocalWordListFile
  resetPreparedWordListsForTests()
}
