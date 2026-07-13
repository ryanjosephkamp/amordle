import { GAMEPLAY_AUTOCENTER_TARGETS, scheduleGameplayAutoCenter } from '../gameplayAutoCenter'

export function shouldAutoCenterFreshSoloKeyboard(submittedGuessCount: number, isPlaying: boolean): boolean {
  return isPlaying && submittedGuessCount === 0
}

export function shouldAutoCenterSoloKeyboardEntry(isPlaying: boolean): boolean {
  return isPlaying
}

export function shouldAutoCenterSoloKeyboard(previousSubmittedGuessCount: number | undefined, submittedGuessCount: number): boolean {
  return previousSubmittedGuessCount !== undefined && submittedGuessCount > previousSubmittedGuessCount
}

export function scheduleFreshSoloKeyboardAutoCenter(submittedGuessCount: number, isPlaying: boolean): boolean {
  if (!shouldAutoCenterFreshSoloKeyboard(submittedGuessCount, isPlaying)) {
    return false
  }

  return scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard, { mobileOnly: true })
}

export function scheduleSoloKeyboardEntryAutoCenter(isPlaying: boolean): boolean {
  if (!shouldAutoCenterSoloKeyboardEntry(isPlaying)) {
    return false
  }

  return scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard, { mobileOnly: true })
}

export function scheduleSoloKeyboardAutoCenter(previousSubmittedGuessCount: number | undefined, submittedGuessCount: number): boolean {
  if (!shouldAutoCenterSoloKeyboard(previousSubmittedGuessCount, submittedGuessCount)) {
    return false
  }

  return scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard)
}
