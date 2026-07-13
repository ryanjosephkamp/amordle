import type { GuestProgressionState } from '../account/storageSchema'
import { selectXpProgress } from '../stats/statsSelectors'

export interface ProgressionHudViewModel {
  readonly coinBalance: number
  readonly coinLabel: string
  readonly level: number
  readonly levelLabel: string
  readonly progressPercent: number
  readonly xpAriaLabel: string
  readonly xpForLevel: number
  readonly xpIntoLevel: number
  readonly xpLabel: string
  readonly xpSummary: string
  readonly xpToNextLevelLabel: string
}

function formatHudNumber(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}

export function createProgressionHudViewModel(progression: GuestProgressionState): ProgressionHudViewModel {
  const xpProgress = selectXpProgress(progression)
  const coinBalance = Math.max(0, Math.floor(progression.coins))
  const level = xpProgress.level
  const xpIntoLevel = xpProgress.xpIntoLevel
  const xpForLevel = xpProgress.xpForLevel

  return {
    coinBalance,
    coinLabel: `${formatHudNumber(coinBalance)} coins`,
    level,
    levelLabel: `Level ${formatHudNumber(level)}`,
    progressPercent: xpProgress.progressPercent,
    xpAriaLabel: `Level ${level}: ${formatHudNumber(xpIntoLevel)} of ${formatHudNumber(xpForLevel)} XP toward the next level`,
    xpForLevel,
    xpIntoLevel,
    xpLabel: 'XP',
    xpSummary: `${formatHudNumber(xpIntoLevel)} / ${formatHudNumber(xpForLevel)} XP`,
    xpToNextLevelLabel: `${formatHudNumber(xpProgress.xpToNextLevel)} XP to level ${formatHudNumber(level + 1)}`,
  }
}
