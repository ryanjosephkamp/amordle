export const GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE = 'data-gameplay-autocenter-target'

export const GAMEPLAY_AUTOCENTER_TARGETS = {
  multiplayer: 'multiplayer',
  solo: 'solo',
  soloKeyboard: 'solo-keyboard',
} as const

export type GameplayAutoCenterTarget =
  (typeof GAMEPLAY_AUTOCENTER_TARGETS)[keyof typeof GAMEPLAY_AUTOCENTER_TARGETS]

interface GameplayAutoCenterOptions {
  readonly mobileOnly?: boolean
}

export const MOBILE_SOLO_KEYBOARD_BOTTOM_CLEARANCE_PX = 16
const MOBILE_SOLO_KEYBOARD_CORRECTION_DELAYS_MS = [90, 240, 420] as const

export function getGameplayAutoCenterSelector(target: GameplayAutoCenterTarget): string {
  return `[${GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE}="${target}"]`
}

function canFocusAutoCenterTarget(documentRef: Document): boolean {
  const activeElement = documentRef.activeElement
  return !activeElement || activeElement === documentRef.body || activeElement === documentRef.documentElement
}

function getGameplayAutoCenterBehavior(target: GameplayAutoCenterTarget, windowRef: Window): ScrollBehavior {
  if (target === GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard && isGameplayAutoCenterMobileViewport(windowRef)) {
    return 'auto'
  }

  return windowRef.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function isGameplayAutoCenterMobileViewport(windowRef: Window): boolean {
  return windowRef.matchMedia?.('(max-width: 640px)').matches ?? false
}

export function getGameplayAutoCenterBlock(target: GameplayAutoCenterTarget, windowRef: Window): ScrollLogicalPosition {
  return target === GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard && isGameplayAutoCenterMobileViewport(windowRef)
    ? 'end'
    : 'center'
}

export function getGameplayAutoCenterViewportHeight(windowRef: Window): number {
  return windowRef.visualViewport?.height ?? windowRef.innerHeight
}

export function getMobileSoloKeyboardBottomCorrection(
  keyboardBottom: number,
  viewportHeight: number,
  bottomClearance = MOBILE_SOLO_KEYBOARD_BOTTOM_CLEARANCE_PX,
): number {
  return Math.max(0, Math.ceil(keyboardBottom - viewportHeight + bottomClearance))
}

function correctMobileSoloKeyboardBottom(target: GameplayAutoCenterTarget, windowRef: Window, documentRef: Document): void {
  if (target !== GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard || !isGameplayAutoCenterMobileViewport(windowRef)) {
    return
  }

  const element = documentRef.querySelector<HTMLElement>(getGameplayAutoCenterSelector(target))
  if (!element) {
    return
  }

  const correction = getMobileSoloKeyboardBottomCorrection(
    element.getBoundingClientRect().bottom,
    getGameplayAutoCenterViewportHeight(windowRef),
  )
  if (correction <= 0) {
    return
  }

  windowRef.scrollBy({ behavior: 'auto', top: correction })
}

function scheduleMobileSoloKeyboardCorrections(target: GameplayAutoCenterTarget, windowRef: Window, documentRef: Document): void {
  if (target !== GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard || !isGameplayAutoCenterMobileViewport(windowRef)) {
    return
  }

  for (const delay of MOBILE_SOLO_KEYBOARD_CORRECTION_DELAYS_MS) {
    windowRef.setTimeout(() => correctMobileSoloKeyboardBottom(target, windowRef, documentRef), delay)
  }
}

export function scheduleGameplayAutoCenter(target: GameplayAutoCenterTarget, options: GameplayAutoCenterOptions = {}): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false
  }

  const windowRef = window
  if (options.mobileOnly && !isGameplayAutoCenterMobileViewport(windowRef)) {
    return false
  }

  const documentRef = document
  windowRef.setTimeout(() => {
    const element = documentRef.querySelector<HTMLElement>(getGameplayAutoCenterSelector(target))
    if (!element) {
      return
    }

    element.scrollIntoView({
      block: getGameplayAutoCenterBlock(target, windowRef),
      behavior: getGameplayAutoCenterBehavior(target, windowRef),
    })

    if (canFocusAutoCenterTarget(documentRef)) {
      element.focus({ preventScroll: true })
    }

    scheduleMobileSoloKeyboardCorrections(target, windowRef, documentRef)
  }, 0)

  return true
}
