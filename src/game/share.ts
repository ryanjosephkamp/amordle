import type { GameMode, GuessResult, PlayScope, TileState } from './types'
import type { GoSessionState } from './go/session'
import type { PuzzleSessionState } from './session'

const tileEmojis: Record<TileState, string> = {
  absent: '⬛',
  correct: '🟩',
  present: '🟨',
}

export interface ShareHeaderInput {
  readonly dateKey?: string
  readonly mode: GameMode
  readonly scope: PlayScope
}

export interface OgShareInput extends ShareHeaderInput {
  readonly guesses: readonly GuessResult[]
  readonly maxAttempts: number
  readonly status: Exclude<PuzzleSessionState['status'], 'playing'>
}

export interface GoShareInput extends ShareHeaderInput {
  readonly currentPuzzleIndex: number
  readonly puzzles: GoSessionState['puzzles']
  readonly status: Exclude<GoSessionState['status'], 'playing'>
}

function formatHeader({ dateKey, mode, scope }: ShareHeaderInput): string {
  const scopeLabel = scope === 'daily' && dateKey ? `${scope} ${dateKey}` : scope
  return `Awordle ${mode} ${scopeLabel}`
}

function formatGuessRow(guess: GuessResult): string {
  return guess.tiles.map((tile) => tileEmojis[tile.state]).join('')
}

export function formatGuessRows(guesses: readonly GuessResult[]): string {
  return guesses.map(formatGuessRow).join('\n')
}

export function formatOgShare(input: OgShareInput): string {
  const score = input.status === 'won' ? `${input.guesses.length}/${input.maxAttempts}` : `X/${input.maxAttempts}`
  return [
    `${formatHeader(input)} ${score}`,
    formatGuessRows(input.guesses),
  ].filter(Boolean).join('\n')
}

export function formatGoShare(input: GoShareInput): string {
  const completedPuzzles = input.status === 'won' ? input.puzzles : input.puzzles.slice(0, input.currentPuzzleIndex + 1)
  const score = input.status === 'won' ? `${input.puzzles.length}/${input.puzzles.length}` : `${input.currentPuzzleIndex}/X`
  const puzzleRows = completedPuzzles
    .map((puzzle, index) => [`Puzzle ${index + 1}`, formatGuessRows(puzzle.guesses)].filter(Boolean).join('\n'))
    .join('\n\n')

  return [
    `${formatHeader(input)} ${score}`,
    puzzleRows,
  ].filter(Boolean).join('\n')
}

export async function shareText(text: string): Promise<'clipboard' | 'native' | 'unsupported'> {
  if (typeof navigator === 'undefined') {
    return 'unsupported'
  }

  if ('share' in navigator && typeof navigator.share === 'function') {
    await navigator.share({ text })
    return 'native'
  }

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return 'clipboard'
  }

  return 'unsupported'
}
