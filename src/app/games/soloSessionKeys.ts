import { isGoSessionComplete, isOgSessionComplete, type GoResumeSlot, type OgResumeSlot } from '../../account'
import type { DifficultyTier } from '../../data'
import type { GoPuzzleCount } from '../../game/constants'

type SoloGameScope = 'daily' | 'practice'

export function createOgGameSessionKey({
  activeResume,
  difficulty,
  practiceLength,
  practiceSeed,
  progressOwnerKey,
  scope,
  setupDateKey,
}: {
  readonly activeResume?: OgResumeSlot
  readonly difficulty: DifficultyTier
  readonly practiceLength: number
  readonly practiceSeed: number
  readonly progressOwnerKey?: string
  readonly scope: SoloGameScope
  readonly setupDateKey?: string
}): string {
  const ownerKey = progressOwnerKey ?? 'local'
  if (scope === 'daily') {
    const completedResumeSegment = activeResume && isOgSessionComplete(activeResume.serializedSession)
      ? `-completed-${activeResume.updatedAt}`
      : ''
    return `${scope}-${ownerKey}-${difficulty}-${setupDateKey ?? 'daily'}${completedResumeSegment}`
  }

  return `${scope}-${ownerKey}-${difficulty}-${practiceLength}-${practiceSeed}${activeResume ? `-resume-${activeResume.updatedAt}` : ''}`
}

export function createGoGameSessionKey({
  activeResume,
  difficulty,
  goPuzzleCount,
  practiceLength,
  practiceSeed,
  progressOwnerKey,
  scope,
  setupDateKey,
}: {
  readonly activeResume?: GoResumeSlot
  readonly difficulty: DifficultyTier
  readonly goPuzzleCount: GoPuzzleCount
  readonly practiceLength: number
  readonly practiceSeed: number
  readonly progressOwnerKey?: string
  readonly scope: SoloGameScope
  readonly setupDateKey?: string
}): string {
  const ownerKey = progressOwnerKey ?? 'local'
  if (scope === 'daily') {
    const completedResumeSegment = activeResume && isGoSessionComplete(activeResume.serializedSession)
      ? `-completed-${activeResume.updatedAt}`
      : ''
    return `${scope}-${ownerKey}-${difficulty}-${goPuzzleCount}-${setupDateKey ?? 'daily'}${completedResumeSegment}`
  }

  return `${scope}-${ownerKey}-${difficulty}-${goPuzzleCount}-${practiceLength}-${practiceSeed}${activeResume ? `-resume-${activeResume.updatedAt}` : ''}`
}
