import { GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE } from './gameplayAutoCenter'

export interface BackToTopSnapshot {
  readonly documentHeight: number
  readonly scrollY: number
  readonly viewportHeight: number
}

export interface RectLike {
  readonly bottom: number
  readonly left: number
  readonly right: number
  readonly top: number
}

export interface BackToTopState {
  readonly lifted: boolean
  readonly visible: boolean
}

const BACK_TO_TOP_MIN_SCROLL_Y = 320
const BACK_TO_TOP_MIN_SCROLLABLE_HEIGHT = 480
const BACK_TO_TOP_CONTROL_ZONE_PX = 96

export function shouldShowBackToTop(snapshot: BackToTopSnapshot): boolean {
  const scrollableHeight = Math.max(0, snapshot.documentHeight - snapshot.viewportHeight)
  return scrollableHeight >= BACK_TO_TOP_MIN_SCROLLABLE_HEIGHT && snapshot.scrollY >= BACK_TO_TOP_MIN_SCROLL_Y
}

export function shouldLiftBackToTopForGameplay(rect: RectLike | undefined, viewportWidth: number, viewportHeight: number): boolean {
  if (!rect || viewportWidth <= 0 || viewportHeight <= 0) {
    return false
  }

  const controlZoneLeft = viewportWidth - BACK_TO_TOP_CONTROL_ZONE_PX
  const controlZoneTop = viewportHeight - BACK_TO_TOP_CONTROL_ZONE_PX

  return rect.left < viewportWidth &&
    rect.right > controlZoneLeft &&
    rect.top < viewportHeight &&
    rect.bottom > controlZoneTop
}

export function getBackToTopScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'smooth'
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function readBackToTopState(): BackToTopState {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { lifted: false, visible: false }
  }

  const documentElement = document.documentElement
  const body = document.body
  const viewportHeight = window.innerHeight || documentElement.clientHeight || 0
  const viewportWidth = window.innerWidth || documentElement.clientWidth || 0
  const documentHeight = Math.max(documentElement.scrollHeight, body?.scrollHeight ?? 0)
  const scrollY = window.scrollY || documentElement.scrollTop || body?.scrollTop || 0
  const gameplayTarget = document.querySelector(`[${GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE}]`)
  const gameplayRect = gameplayTarget instanceof HTMLElement ? gameplayTarget.getBoundingClientRect() : undefined

  return {
    lifted: shouldLiftBackToTopForGameplay(gameplayRect, viewportWidth, viewportHeight),
    visible: shouldShowBackToTop({ documentHeight, scrollY, viewportHeight }),
  }
}
