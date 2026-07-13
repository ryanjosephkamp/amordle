import { DAILY_WORD_LENGTH } from '../game/constants.js'
import type { GameMode, PlayScope } from '../game/types.js'
import { DEFAULT_DIFFICULTY_TIER, getAnswerSubset, type DifficultyTier } from './difficulty/index.js'
import type { LoadWordListFailure } from './loadWordList.js'
import { isLoadWordListFailure, loadBundledWordList } from './loadWordList.js'
import type { NormalizedWordList, WordDefinitionEntry, WordEntry } from './types.js'

export interface WordRepositorySuccess {
  readonly ok: true
  readonly wordList: NormalizedWordList
  readonly answers: readonly WordEntry[]
  readonly validGuesses: ReadonlySet<string>
}

export type WordRepositoryFailure = LoadWordListFailure
export type WordRepositoryResult = WordRepositorySuccess | WordRepositoryFailure

export function isWordRepositorySuccess(
  result: WordRepositoryResult,
): result is WordRepositorySuccess {
  return result.ok === true
}

export function isWordRepositoryFailure(
  result: WordRepositoryResult,
): result is WordRepositoryFailure {
  return result.ok === false
}

export interface WordRepositoryRequest {
  readonly mode: GameMode
  readonly scope: PlayScope
  readonly length: number
  /**
   * Phase 18.2 — answer difficulty tier. Additive and optional; defaults to
   * Expert so every existing caller reproduces today's full-curated behaviour.
   * Tiers subset the `answers` pool only; `validGuesses` is always the full list.
   */
  readonly difficulty?: DifficultyTier
}

export function getRequestedWordLength(scope: PlayScope, length: number): number {
  return scope === 'daily' ? DAILY_WORD_LENGTH : length
}

export function getWordRepository(request: WordRepositoryRequest): WordRepositoryResult {
  const requestedLength = getRequestedWordLength(request.scope, request.length)
  const wordList = loadBundledWordList(request.scope, requestedLength)
  if (isLoadWordListFailure(wordList)) {
    return wordList
  }

  const tier = request.difficulty ?? DEFAULT_DIFFICULTY_TIER
  const answers = getAnswerSubset(wordList.wordList.answers, requestedLength, tier)

  return {
    ok: true,
    wordList: wordList.wordList,
    answers,
    validGuesses: wordList.wordList.validGuesses,
  }
}

export function getAnswerCandidates(request: WordRepositoryRequest): readonly WordEntry[] {
  const repository = getWordRepository(request)
  return isWordRepositorySuccess(repository) ? repository.answers : []
}

export function getValidGuesses(request: WordRepositoryRequest): ReadonlySet<string> {
  const repository = getWordRepository(request)
  return isWordRepositorySuccess(repository) ? repository.validGuesses : new Set()
}

export function getDefinitionsForWord(
  request: WordRepositoryRequest,
  word: string,
): readonly WordDefinitionEntry[] {
  const repository = getWordRepository(request)
  if (isWordRepositoryFailure(repository)) {
    return []
  }

  return repository.wordList.definitionsByWord.get(word.trim().toLocaleLowerCase('en-US')) ?? []
}
