import { getDefinitionsForWord } from '../data'
import type { DefinitionEntry, DefinitionLookupRequest } from './types'

export function lookupPreprocessedDefinitions(request: DefinitionLookupRequest): readonly DefinitionEntry[] {
  return getDefinitionsForWord(
    {
      length: request.wordLength,
      mode: request.mode,
      scope: request.scope,
    },
    request.word,
  ).map((entry) => ({
    definition: entry.definition,
    partOfSpeech: entry.partOfSpeech,
    source: entry.source ?? 'bundled',
  }))
}
