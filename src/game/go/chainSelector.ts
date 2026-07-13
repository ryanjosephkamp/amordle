export const GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY = '2026-07-14'

export type GoAnswerGenerationVersion = 'v1' | 'v2'

export interface DeterministicGoAnswerSequenceOptions {
  readonly excludedWords?: ReadonlySet<string>
  readonly puzzleCount: number
  readonly streamKey: string
}

function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b) >>> 0
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0
  return (hash ^ (hash >>> 16)) >>> 0
}

function compareWords(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function getGoAnswerGenerationVersionForDateKey(dateKey: string): GoAnswerGenerationVersion {
  return dateKey >= GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY ? 'v2' : 'v1'
}

export function selectDeterministicGoAnswerSequence(
  answers: readonly { readonly word: string }[],
  options: DeterministicGoAnswerSequenceOptions,
): readonly string[] {
  if (!Number.isInteger(options.puzzleCount) || options.puzzleCount < 1) {
    throw new Error('GO puzzle count must be a positive integer.')
  }

  const excludedWords = new Set(
    [...(options.excludedWords ?? [])].map((word) => word.trim().toLocaleLowerCase('en-US')),
  )
  const uniqueWords = new Set<string>()
  for (const candidate of answers) {
    const word = candidate.word.trim().toLocaleLowerCase('en-US')
    if (word && !excludedWords.has(word)) {
      uniqueWords.add(word)
    }
  }
  if (uniqueWords.size < options.puzzleCount) {
    throw new Error('Not enough unique answer candidates are available for the GO chain.')
  }

  return [...uniqueWords]
    .map((word) => ({ rank: hashString(`${options.streamKey}:${word}`), word }))
    .sort((left, right) => left.rank - right.rank || compareWords(left.word, right.word))
    .slice(0, options.puzzleCount)
    .map(({ word }) => word)
}
