import type { GameMode, GameStatus } from '../game/types'

export interface XpAwardInput {
  readonly attemptsUsed: number
  readonly maxAttempts: number
  readonly mode: GameMode
  readonly puzzleCount?: number
  readonly status: Exclude<GameStatus, 'playing'>
  readonly wordLength: number
}

export function calculateXpAward(input: XpAwardInput): number {
  const puzzleCount = input.puzzleCount ?? 1
  const completionBonus = input.status === 'won' ? input.wordLength * 10 * puzzleCount : Math.max(5, input.wordLength * puzzleCount)
  const efficiencyBonus = input.status === 'won' ? Math.max(0, input.maxAttempts - input.attemptsUsed) * 5 : 0
  const modeBonus = input.mode === 'go' && input.status === 'won' ? 25 : 0
  return completionBonus + efficiencyBonus + modeBonus
}

export function getLevelForXp(xp: number): number {
  let remaining = Math.max(0, Math.floor(xp))
  let level = 1
  while (remaining >= level * 100) {
    remaining -= level * 100
    level += 1
  }
  return level
}

export function getXpForNextLevel(level: number): number {
  return Math.max(1, Math.floor(level)) * 100
}
