import { fetchJson, getErrorMessage } from './fetchUtils'
import type { DefinitionEntry, DefinitionProviderOptions } from './types'

interface WiktionaryDefinition {
  readonly definition?: unknown
}

interface WiktionaryEntry {
  readonly partOfSpeech?: unknown
  readonly definitions?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stripMarkup(value: string): string {
  let text = ''
  let insideTag = false
  let previousWasWhitespace = false

  for (const character of value) {
    if (character === '<') {
      insideTag = true
      continue
    }

    if (character === '>') {
      insideTag = false
      continue
    }

    if (insideTag) {
      continue
    }

    if (/\s/.test(character)) {
      if (!previousWasWhitespace) {
        text += ' '
        previousWasWhitespace = true
      }
      continue
    }

    text += character
    previousWasWhitespace = false
  }

  return text.trim()
}

function parseWiktionaryDefinitions(payload: unknown): readonly DefinitionEntry[] {
  if (!isRecord(payload)) {
    return []
  }

  const englishEntries = payload.en
  if (!Array.isArray(englishEntries)) {
    return []
  }

  const definitions: DefinitionEntry[] = []
  for (const entry of englishEntries as readonly WiktionaryEntry[]) {
    if (!isRecord(entry) || !Array.isArray(entry.definitions)) {
      continue
    }

    const partOfSpeech = typeof entry.partOfSpeech === 'string' ? entry.partOfSpeech : undefined
    for (const item of entry.definitions as readonly WiktionaryDefinition[]) {
      if (isRecord(item) && typeof item.definition === 'string') {
        const definition = stripMarkup(item.definition)
        if (definition) {
          definitions.push({ definition, partOfSpeech, source: 'wiktionary' })
        }
      }
    }
  }

  return definitions
}

export async function lookupWiktionaryDefinitions(
  word: string,
  options: DefinitionProviderOptions = {},
): Promise<readonly DefinitionEntry[]> {
  try {
    const payload = await fetchJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`, options)
    return parseWiktionaryDefinitions(payload)
  } catch (error) {
    throw new Error(`Wiktionary lookup failed: ${getErrorMessage(error)}`, { cause: error })
  }
}
