import type { GameMode, PlayScope } from '../game/types'

export type DefinitionSource = 'bundled' | 'dictionary-api' | 'wiktionary'

export interface DefinitionEntry {
  readonly definition: string
  readonly partOfSpeech?: string
  readonly source: DefinitionSource | string
}

export interface DefinitionLookupRequest {
  readonly mode: GameMode
  readonly scope: PlayScope
  readonly word: string
  readonly wordLength: number
}

export interface DefinitionLookupFound {
  readonly ok: true
  readonly definitions: readonly DefinitionEntry[]
  readonly source: DefinitionSource
  readonly word: string
}

export interface DefinitionLookupNotFound {
  readonly ok: false
  readonly errors: readonly string[]
  readonly word: string
}

export type DefinitionLookupResult = DefinitionLookupFound | DefinitionLookupNotFound

export interface DefinitionProviderOptions {
  readonly fetcher?: typeof fetch
  readonly timeoutMs?: number
}
