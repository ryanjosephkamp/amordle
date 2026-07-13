import { lookupDictionaryApiDefinitions } from './dictionaryApi'
import { lookupPreprocessedDefinitions } from './preprocessed'
import type { DefinitionLookupRequest, DefinitionLookupResult, DefinitionProviderOptions } from './types'
import { lookupWiktionaryDefinitions } from './wiktionary'

function normalizeWord(word: string): string {
  return word.trim().toLocaleLowerCase('en-US')
}

export async function lookupDefinitions(
  request: DefinitionLookupRequest,
  options: DefinitionProviderOptions = {},
): Promise<DefinitionLookupResult> {
  const word = normalizeWord(request.word)
  const bundledDefinitions = lookupPreprocessedDefinitions({ ...request, word })
  if (bundledDefinitions.length > 0) {
    return {
      definitions: bundledDefinitions,
      ok: true,
      source: 'bundled',
      word,
    }
  }

  const errors: string[] = []
  try {
    const wiktionaryDefinitions = await lookupWiktionaryDefinitions(word, options)
    if (wiktionaryDefinitions.length > 0) {
      return {
        definitions: wiktionaryDefinitions,
        ok: true,
        source: 'wiktionary',
        word,
      }
    }
    errors.push('Wiktionary returned no definitions.')
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Wiktionary lookup failed.')
  }

  try {
    const dictionaryDefinitions = await lookupDictionaryApiDefinitions(word, options)
    if (dictionaryDefinitions.length > 0) {
      return {
        definitions: dictionaryDefinitions,
        ok: true,
        source: 'dictionary-api',
        word,
      }
    }
    errors.push('Dictionary API returned no definitions.')
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Dictionary API lookup failed.')
  }

  return { errors, ok: false, word }
}
