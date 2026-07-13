import { getDailyAnswerIndex, getDailyDateKey, getDailyGoSeedIndex, getWordRepository } from '../data'
import { DEFAULT_DIFFICULTY_TIER, type DifficultyTier } from '../data/difficulty'
import { DAILY_WORD_LENGTH, DEFAULT_GO_PUZZLE_COUNT, type GoPuzzleCount } from '../game/constants'
import type { GoSessionSetup } from '../game/go/session'
import {
  getGoAnswerGenerationVersionForDateKey,
  selectDeterministicGoAnswerSequence,
} from '../game/go/chainSelector'
import type { OgPuzzleSetup } from '../game/og/session'

export interface MultiplayerProfileSummary {
  readonly accentColor?: string
  readonly avatarUrl?: string
  readonly displayName?: string
  readonly gradient?: string
  readonly initials?: string
  readonly label: string
}

interface PublicProfileInput {
  readonly accentColor?: string
  readonly avatarUrl?: string
  readonly displayName?: string
  readonly gradient?: string
  readonly initials?: string
  readonly label?: string
}

function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  if (!cleaned) {
    return undefined
  }
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned
}

function isPrivateLabel(value: string | undefined): boolean {
  return Boolean(value && value.includes('@'))
}

function initialsFromLabel(label: string): string {
  const parts = label.split(/[\s._-]+/u).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toLocaleUpperCase('en-US')
  }
  return label.charAt(0).toLocaleUpperCase('en-US')
}

export function createMultiplayerProfileSummary(
  profile: PublicProfileInput | undefined,
  fallbackLabel = 'Player',
): MultiplayerProfileSummary {
  const displayName = cleanText(profile?.displayName, 50)
  const labelCandidate = cleanText(profile?.label, 50)
  const safeFallback = cleanText(fallbackLabel, 50) ?? 'Player'
  const label = displayName ?? (isPrivateLabel(labelCandidate) ? undefined : labelCandidate) ?? safeFallback
  const initials = cleanText(profile?.initials, 4) ?? initialsFromLabel(label)
  return {
    accentColor: cleanText(profile?.accentColor, 24),
    avatarUrl: cleanText(profile?.avatarUrl, 512),
    displayName,
    gradient: cleanText(profile?.gradient, 80),
    initials,
    label,
  }
}

export function normalizeMultiplayerProfileSummary(value: unknown): MultiplayerProfileSummary | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const label = cleanText(record.label, 50)
  if (!label || isPrivateLabel(label)) {
    return undefined
  }
  return {
    accentColor: cleanText(record.accentColor, 24),
    avatarUrl: cleanText(record.avatarUrl, 512),
    displayName: cleanText(record.displayName, 50),
    gradient: cleanText(record.gradient, 80),
    initials: cleanText(record.initials, 4) ?? initialsFromLabel(label),
    label,
  }
}

export function normalizeMultiplayerProfileMap<PlayerId extends string>(
  value: unknown,
  playerIds: readonly PlayerId[],
): Partial<Record<PlayerId, MultiplayerProfileSummary>> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const entries = playerIds.flatMap((playerId) => {
    const summary = normalizeMultiplayerProfileSummary(record[playerId])
    return summary ? [[playerId, summary] as const] : []
  })
  return entries.length > 0 ? Object.fromEntries(entries) as Partial<Record<PlayerId, MultiplayerProfileSummary>> : undefined
}

function multiplayerAnswerIndex(dateKey: string, answerCount: number, family: 'go' | 'og'): number {
  if (answerCount < 1) {
    throw new Error('At least one answer candidate is required for daily multiplayer.')
  }
  if (answerCount === 1) {
    return 0
  }

  const baseIndex = family === 'go'
    ? getDailyGoSeedIndex(dateKey, answerCount)
    : getDailyAnswerIndex(dateKey, answerCount)
  const offset = 1 + (hashString(`${dateKey}:${family}:multiplayer`) % (answerCount - 1))
  return (baseIndex + offset) % answerCount
}

function rankedMultiplayerAnswerIndex(
  dateKey: string,
  answers: readonly { readonly word: string }[],
  family: 'go' | 'og',
  puzzleCount: number,
): number {
  if (answers.length < 2) {
    throw new Error('At least two answer candidates are required to separate ranked and unranked daily multiplayer.')
  }

  const unrankedIndex = multiplayerAnswerIndex(dateKey, answers.length, family)
  const initialDisplacement = 1 + (hashString(`${dateKey}:${family}:multiplayer:ranked`) % (answers.length - 1))
  for (let attempt = 0; attempt < answers.length - 1; attempt += 1) {
    const displacement = 1 + ((initialDisplacement - 1 + attempt) % (answers.length - 1))
    const candidateIndex = (unrankedIndex + displacement) % answers.length
    const avoidsEveryCollision = Array.from({ length: puzzleCount }, (_, offset) => (
      answers[(candidateIndex + offset) % answers.length]!.word
      !== answers[(unrankedIndex + offset) % answers.length]!.word
    )).every(Boolean)
    if (avoidsEveryCollision) {
      return candidateIndex
    }
  }

  throw new Error('Unable to select distinct ranked daily multiplayer answers.')
}

function answerSequence(answers: readonly { readonly word: string }[], seedIndex: number, puzzleCount: GoPuzzleCount): readonly string[] {
  if (answers.length < 1) {
    throw new Error('At least one answer candidate is required for daily multiplayer.')
  }
  return Array.from({ length: puzzleCount }, (_, offset) => answers[(seedIndex + offset) % answers.length].word)
}

export function createDailyMultiplayerOgSetup(
  date = new Date(),
  difficulty: DifficultyTier = DEFAULT_DIFFICULTY_TIER,
  ranked = false,
): OgPuzzleSetup {
  const repository = getWordRepository({ difficulty, length: DAILY_WORD_LENGTH, mode: 'og', scope: 'daily' })
  if (!repository.ok) {
    throw new Error(repository.message)
  }
  const dateKey = getDailyDateKey(date)
  const index = ranked
    ? rankedMultiplayerAnswerIndex(dateKey, repository.answers, 'og', 1)
    : multiplayerAnswerIndex(dateKey, repository.answers.length, 'og')
  return {
    answer: repository.answers[index]!.word,
    dateKey,
    validGuesses: repository.validGuesses,
    wordLength: DAILY_WORD_LENGTH,
  }
}

export function createDailyMultiplayerGoSetup(
  date = new Date(),
  difficulty: DifficultyTier = DEFAULT_DIFFICULTY_TIER,
  puzzleCount: GoPuzzleCount = DEFAULT_GO_PUZZLE_COUNT,
  ranked = false,
  versionOverride?: GoSessionSetup['answerGenerationVersion'],
): GoSessionSetup {
  const repository = getWordRepository({ difficulty, length: DAILY_WORD_LENGTH, mode: 'go', scope: 'daily' })
  if (!repository.ok) {
    throw new Error(repository.message)
  }
  const dateKey = getDailyDateKey(date)
  const answerGenerationVersion = versionOverride ?? getGoAnswerGenerationVersionForDateKey(dateKey)
  let answers: readonly string[]
  if (answerGenerationVersion === 'v1') {
    const seedIndex = ranked
      ? rankedMultiplayerAnswerIndex(dateKey, repository.answers, 'go', puzzleCount)
      : multiplayerAnswerIndex(dateKey, repository.answers.length, 'go')
    answers = answerSequence(repository.answers, seedIndex, puzzleCount)
  } else {
    const unrankedStreamKey = `go-chain-v2:multiplayer:daily:unranked:${dateKey}:${DAILY_WORD_LENGTH}:${difficulty}:${puzzleCount}`
    const unrankedAnswers = selectDeterministicGoAnswerSequence(repository.answers, {
      puzzleCount,
      streamKey: unrankedStreamKey,
    })
    answers = ranked
      ? selectDeterministicGoAnswerSequence(repository.answers, {
          excludedWords: new Set(unrankedAnswers),
          puzzleCount,
          streamKey: `go-chain-v2:multiplayer:daily:ranked:${dateKey}:${DAILY_WORD_LENGTH}:${difficulty}:${puzzleCount}`,
        })
      : unrankedAnswers
  }
  const priorAnswers: string[] = []
  const puzzles = answers.map((answer) => {
    const prefilledGuesses = [...priorAnswers]
    priorAnswers.push(answer)
    return { answer, prefilledGuesses }
  })
  return {
    answerGenerationVersion,
    dateKey,
    puzzles,
    validGuesses: repository.validGuesses,
    wordLength: DAILY_WORD_LENGTH,
  }
}
