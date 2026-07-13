import { getLevelForXp } from '../progression'
import type { GameStatsBucket, StatisticsState } from '../stats/types'
import { mergeMultiplayerStates, mergeCompetitiveMultiplayerStates } from '../multiplayer'
import { normalizeGuestSettings, type GuestProgressState } from './storageSchema'
import { getLatestResumeSlot, mergeResumeSlots } from './resumeSlot'
import { mergePracticeSeedStates } from './practiceSeeds'

function mergeStatsBucket(local: GameStatsBucket, cloud: GameStatsBucket): GameStatsBucket {
  const lengthKeys = new Set([...Object.keys(local.byLength), ...Object.keys(cloud.byLength)].map(Number))
  const byLength = Object.fromEntries(Array.from(lengthKeys).map((length) => {
    const localLength = local.byLength[length] ?? { played: 0, won: 0 }
    const cloudLength = cloud.byLength[length] ?? { played: 0, won: 0 }
    return [length, {
      played: Math.max(localLength.played, cloudLength.played),
      won: Math.max(localLength.won, cloudLength.won),
    }]
  }))

  return {
    bestAttempts: local.bestAttempts && cloud.bestAttempts ? Math.min(local.bestAttempts, cloud.bestAttempts) : local.bestAttempts ?? cloud.bestAttempts,
    byLength,
    currentStreak: Math.max(local.currentStreak, cloud.currentStreak),
    lost: Math.max(local.lost, cloud.lost),
    maxStreak: Math.max(local.maxStreak, cloud.maxStreak),
    played: Math.max(local.played, cloud.played),
    totalAttempts: Math.max(local.totalAttempts, cloud.totalAttempts),
    won: Math.max(local.won, cloud.won),
  }
}

function mergeStats(local: StatisticsState, cloud: StatisticsState): StatisticsState {
  return {
    go: {
      daily: mergeStatsBucket(local.go.daily, cloud.go.daily),
      practice: mergeStatsBucket(local.go.practice, cloud.go.practice),
    },
    og: {
      daily: mergeStatsBucket(local.og.daily, cloud.og.daily),
      practice: mergeStatsBucket(local.og.practice, cloud.og.practice),
    },
  }
}

export function mergeGuestProgressIntoCloud(local: GuestProgressState, cloud: GuestProgressState): GuestProgressState {
  const historyById = new Map(cloud.history.map((entry) => [entry.gameId, entry]))
  for (const entry of local.history) {
    historyById.set(entry.gameId, entry)
  }
  const history = Array.from(historyById.values())
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, 200)
  const xp = Math.max(local.progression.xp, cloud.progression.xp)
  // Preferences sync as a whole object; the side with more history wins as a
  // recency proxy. Normalize the winner so a tier (or any newer field) is always
  // present and migration-safe through cloud round-trips (Phase 18.8).
  const settings = normalizeGuestSettings(local.history.length >= cloud.history.length ? local.settings : cloud.settings)
  const resumeSlots = mergeResumeSlots(local.resumeSlots, cloud.resumeSlots)
  const resumeSlot = getLatestResumeSlot(resumeSlots ?? {}) ?? local.resumeSlot ?? cloud.resumeSlot
  const localEconomyRevision = local.progression.economyRevision ?? 0
  const cloudEconomyRevision = cloud.progression.economyRevision ?? 0
  const economy = localEconomyRevision === cloudEconomyRevision
    ? {
        coins: Math.max(local.progression.coins, cloud.progression.coins),
        consumables: {
          removeIncorrectLetters: Math.max(local.progression.consumables.removeIncorrectLetters, cloud.progression.consumables.removeIncorrectLetters),
          revealOneLetter: Math.max(local.progression.consumables.revealOneLetter, cloud.progression.consumables.revealOneLetter),
        },
        economyOperationIds: Array.from(new Set([...(cloud.progression.economyOperationIds ?? []), ...(local.progression.economyOperationIds ?? [])])).slice(-500),
        economyRevision: localEconomyRevision,
      }
    : localEconomyRevision > cloudEconomyRevision ? local.progression : cloud.progression

  return {
    ...cloud,
    completedGameIds: Array.from(new Set([...cloud.completedGameIds, ...local.completedGameIds])),
    history,
    progression: {
      coins: economy.coins,
      consumables: economy.consumables,
      economyOperationIds: economy.economyOperationIds,
      economyRevision: economy.economyRevision,
      level: getLevelForXp(xp),
      xp,
    },
    multiplayer: mergeMultiplayerStates(local.multiplayer, cloud.multiplayer),
    competitiveMultiplayer: mergeCompetitiveMultiplayerStates(local.competitiveMultiplayer, cloud.competitiveMultiplayer),
    practiceSeeds: mergePracticeSeedStates(local.practiceSeeds, cloud.practiceSeeds),
    resumeSlot,
    resumeSlots,
    settings,
    stats: mergeStats(local.stats, cloud.stats),
    unlockedDailies: Array.from(new Set([...(cloud.unlockedDailies ?? []), ...(local.unlockedDailies ?? [])])),
  }
}
