import type { GameMode, GameStatus, PlayScope } from '../game/types'

export interface CoinAwardInput {
  readonly attemptsUsed: number
  readonly maxAttempts: number
  readonly mode: GameMode
  readonly puzzleCount?: number
  readonly scope: PlayScope
  readonly status: Exclude<GameStatus, 'playing'>
  readonly wordLength: number
}

export function calculateCoinAward(input: CoinAwardInput): number {
  const puzzleCount = input.puzzleCount ?? 1
  if (input.status === 'lost') {
    return input.scope === 'daily' ? 2 : 1
  }

  const base = input.wordLength * puzzleCount
  const efficiencyBonus = Math.max(0, input.maxAttempts - input.attemptsUsed) * 2
  const dailyBonus = input.scope === 'daily' ? 5 : 0
  const modeBonus = input.mode === 'go' ? 5 : 0
  return base + efficiencyBonus + dailyBonus + modeBonus
}
