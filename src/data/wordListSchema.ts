import {
  MAX_PRACTICE_WORD_LENGTH,
  MIN_PRACTICE_WORD_LENGTH,
  isSupportedPracticeWordLength,
} from '../game/constants.js'
import type { WordDefinitionEntry, WordEntry, WordListFile } from './types.js'

const WORD_PATTERN = /^[a-z]+$/

export interface SchemaIssue {
  readonly path: string
  readonly message: string
}

export interface SchemaValidationSuccess {
  readonly ok: true
  readonly value: WordListFile
}

export interface SchemaValidationFailure {
  readonly ok: false
  readonly issues: readonly SchemaIssue[]
}

export type SchemaValidationResult = SchemaValidationSuccess | SchemaValidationFailure

export function isSchemaValidationSuccess(
  result: SchemaValidationResult,
): result is SchemaValidationSuccess {
  return result.ok === true
}

export function isSchemaValidationFailure(
  result: SchemaValidationResult,
): result is SchemaValidationFailure {
  return result.ok === false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateWord(word: unknown, length: number, path: string, issues: SchemaIssue[]): string | undefined {
  if (typeof word !== 'string') {
    issues.push({ path, message: 'Word must be a string.' })
    return undefined
  }

  const normalizedWord = word.trim().toLocaleLowerCase('en-US')
  if (normalizedWord.length !== length) {
    issues.push({ path, message: `Word must be ${length} letters long.` })
  }
  if (!WORD_PATTERN.test(normalizedWord)) {
    issues.push({ path, message: 'Word must contain lowercase letters only.' })
  }

  return normalizedWord
}

function validateDefinitions(value: unknown, path: string, issues: SchemaIssue[]): readonly WordDefinitionEntry[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'Definitions must be an array when present.' })
    return undefined
  }

  return value.flatMap((definition, index) => {
    const definitionPath = `${path}[${index}]`
    if (!isRecord(definition)) {
      issues.push({ path: definitionPath, message: 'Definition entry must be an object.' })
      return []
    }
    if (typeof definition.definition !== 'string' || definition.definition.trim().length === 0) {
      issues.push({ path: `${definitionPath}.definition`, message: 'Definition text is required.' })
      return []
    }
    if (definition.partOfSpeech !== undefined && typeof definition.partOfSpeech !== 'string') {
      issues.push({ path: `${definitionPath}.partOfSpeech`, message: 'Part of speech must be a string.' })
    }
    if (definition.source !== undefined && typeof definition.source !== 'string') {
      issues.push({ path: `${definitionPath}.source`, message: 'Source must be a string.' })
    }

    return [{
      definition: definition.definition.trim(),
      partOfSpeech: typeof definition.partOfSpeech === 'string' ? definition.partOfSpeech : undefined,
      source: typeof definition.source === 'string' ? definition.source : undefined,
    }]
  })
}

function validateWordEntry(value: unknown, length: number, path: string, issues: SchemaIssue[]): WordEntry | undefined {
  if (typeof value === 'string') {
    const word = validateWord(value, length, path, issues)
    return word ? { word } : undefined
  }

  if (!isRecord(value)) {
    issues.push({ path, message: 'Word entry must be a string or object.' })
    return undefined
  }

  const word = validateWord(value.word, length, `${path}.word`, issues)
  if (!word) {
    return undefined
  }

  const definitions = validateDefinitions(value.definitions, `${path}.definitions`, issues)
  return definitions ? { word, definitions } : { word }
}

export function validateWordListFile(value: unknown): SchemaValidationResult {
  const issues: SchemaIssue[] = []

  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: '$', message: 'Word list file must be an object.' }] }
  }

  const metadata = isRecord(value.metadata) ? value.metadata : undefined
  if (!metadata) {
    issues.push({ path: 'metadata', message: 'Metadata is required.' })
  }

  const length = typeof metadata?.length === 'number' ? metadata.length : Number.NaN
  if (!Number.isInteger(length) || !isSupportedPracticeWordLength(length)) {
    issues.push({
      path: 'metadata.length',
      message: `Length must be an integer from ${MIN_PRACTICE_WORD_LENGTH} through ${MAX_PRACTICE_WORD_LENGTH}.`,
    })
  }

  for (const key of ['source', 'version', 'generatedAt'] as const) {
    if (typeof metadata?.[key] !== 'string' || metadata[key].trim().length === 0) {
      issues.push({ path: `metadata.${key}`, message: `${key} is required.` })
    }
  }

  if (!Array.isArray(value.answers) || value.answers.length === 0) {
    issues.push({ path: 'answers', message: 'At least one answer is required.' })
  }
  if (!Array.isArray(value.validGuesses) || value.validGuesses.length === 0) {
    issues.push({ path: 'validGuesses', message: 'At least one valid guess is required.' })
  }

  const answers = Array.isArray(value.answers)
    ? value.answers.flatMap((entry, index) => validateWordEntry(entry, length, `answers[${index}]`, issues) ?? [])
    : []
  const validGuesses = Array.isArray(value.validGuesses)
    ? value.validGuesses.flatMap((word, index) => validateWord(word, length, `validGuesses[${index}]`, issues) ?? [])
    : []

  const answerWords = new Set(answers.map((entry) => entry.word))
  const validGuessWords = new Set(validGuesses)
  for (const answer of answerWords) {
    if (!validGuessWords.has(answer)) {
      issues.push({ path: 'validGuesses', message: `Answer ${answer} must also be a valid guess.` })
    }
  }

  if (issues.length > 0 || !metadata) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: {
      metadata: {
        length,
        source: metadata.source as string,
        version: metadata.version as string,
        generatedAt: metadata.generatedAt as string,
        ...(isRecord(metadata.curation) ? { curation: metadata.curation } : {}),
      },
      answers,
      validGuesses,
    },
  }
}
