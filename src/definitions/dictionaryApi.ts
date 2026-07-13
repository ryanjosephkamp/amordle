import { fetchJson, getErrorMessage } from './fetchUtils'
import type { DefinitionEntry, DefinitionProviderOptions } from './types'

interface DictionaryApiDefinition {
  readonly definition?: unknown
}

interface DictionaryApiMeaning {
  readonly partOfSpeech?: unknown
  readonly definitions?: unknown
}

interface DictionaryApiEntry {
  readonly meanings?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseDictionaryApiDefinitions(payload: unknown): readonly DefinitionEntry[] {
  if (!Array.isArray(payload)) {
    return []
  }

  const definitions: DefinitionEntry[] = []
  for (const entry of payload as readonly DictionaryApiEntry[]) {
    if (!isRecord(entry) || !Array.isArray(entry.meanings)) {
      continue
    }

    for (const meaning of entry.meanings as readonly DictionaryApiMeaning[]) {
      if (!isRecord(meaning) || !Array.isArray(meaning.definitions)) {
        continue
      }

      const partOfSpeech = typeof meaning.partOfSpeech === 'string' ? meaning.partOfSpeech : undefined
      for (const item of meaning.definitions as readonly DictionaryApiDefinition[]) {
        if (isRecord(item) && typeof item.definition === 'string' && item.definition.trim()) {
          definitions.push({
            definition: item.definition.trim(),
            partOfSpeech,
            source: 'dictionary-api',
          })
        }
      }
    }
  }

  return definitions
}

export async function lookupDictionaryApiDefinitions(
  word: string,
  options: DefinitionProviderOptions = {},
): Promise<readonly DefinitionEntry[]> {
  try {
    const payload = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, options)
    return parseDictionaryApiDefinitions(payload)
  } catch (error) {
    throw new Error(`Dictionary API lookup failed: ${getErrorMessage(error)}`, { cause: error })
  }
}
