import type { AppRouteId } from '../app/routes'
import type { MultiplayerSubtabId, SoloSubtabId } from '../app/navigationState'
import type { DashboardActionTarget } from '../dashboard'
import {
  normalizeNotificationPreferences,
  shouldIncludeInAppNotification,
} from './notificationPreferences'
import type { NotificationItemViewModel, NotificationKind } from './notificationViewModels'

export type BrowserNotificationPermissionState = 'default' | 'denied' | 'granted' | 'unsupported'

interface BrowserNotificationPermissionLike {
  readonly permission: NotificationPermission
  requestPermission(): Promise<NotificationPermission>
}

interface BrowserNotificationRuntime {
  readonly Notification?: BrowserNotificationPermissionLike
}

interface BrowserNotificationInstanceLike {
  close?: () => void
  onclick?: ((event: Event) => void) | null
}

interface BrowserNotificationConstructorLike extends BrowserNotificationPermissionLike {
  new(title: string, options?: NotificationOptions): BrowserNotificationInstanceLike
}

interface BrowserNotificationDispatchRuntime {
  focus?: () => void
  readonly Notification?: BrowserNotificationConstructorLike
}

export interface BrowserNotificationRouteContext {
  readonly activeRouteId: AppRouteId
  readonly multiplayerSubtab?: MultiplayerSubtabId
  readonly selectedMultiplayerGameId?: string
  readonly selectedSoloGameKey?: string
  readonly soloSubtab?: SoloSubtabId
}

export interface BrowserNotificationDispatchDecision {
  readonly fingerprint: string
  readonly item: NotificationItemViewModel
  readonly itemId: string
  readonly kind: NotificationKind
}

export interface SelectBrowserNotificationDispatchInput {
  readonly documentHidden?: boolean
  readonly items: readonly NotificationItemViewModel[]
  readonly permission: BrowserNotificationPermissionState
  readonly preferences?: unknown
  readonly previousFingerprints?: readonly string[]
  readonly routeContext?: BrowserNotificationRouteContext
  readonly suppressInitial?: boolean
}

export interface BrowserNotificationPayload {
  readonly title: string
  readonly options: NotificationOptions
}

function getDefaultRuntime(): BrowserNotificationRuntime {
  return typeof globalThis === 'undefined' ? {} : globalThis as unknown as BrowserNotificationRuntime
}

function normalizePermission(value: unknown): BrowserNotificationPermissionState {
  return value === 'default' || value === 'denied' || value === 'granted'
    ? value
    : 'unsupported'
}

export function getBrowserNotificationPermissionState(
  runtime: BrowserNotificationRuntime = getDefaultRuntime(),
): BrowserNotificationPermissionState {
  if (!runtime.Notification) {
    return 'unsupported'
  }

  return normalizePermission(runtime.Notification.permission)
}

export function getBrowserNotificationStatusLabel(state: BrowserNotificationPermissionState): string {
  switch (state) {
    case 'default':
      return 'Not requested'
    case 'denied':
      return 'Blocked'
    case 'granted':
      return 'Allowed'
    case 'unsupported':
      return 'Unavailable'
    default:
      return 'Unavailable'
  }
}

export function getBrowserNotificationFingerprint(item: Pick<NotificationItemViewModel, 'fingerprint' | 'id'>): string {
  return `${item.id}:${item.fingerprint}`
}

export function getBrowserNotificationFingerprints(
  items: readonly Pick<NotificationItemViewModel, 'fingerprint' | 'id'>[],
): readonly string[] {
  return items.map((item) => getBrowserNotificationFingerprint(item))
}

function isTargetSurfaceActive(
  target: DashboardActionTarget,
  context: BrowserNotificationRouteContext | undefined,
): boolean {
  if (!context || target.routeId !== context.activeRouteId) {
    return false
  }

  if (target.routeId === 'multiplayer') {
    if (target.resumeMultiplayerGameId) {
      const selectedGameMatches = target.resumeMultiplayerGameId === context.selectedMultiplayerGameId
      const activeResumeSurface = (
        context.multiplayerSubtab === 'active'
        || context.multiplayerSubtab === 'daily'
        || context.multiplayerSubtab === 'practice'
      )
      return selectedGameMatches && activeResumeSurface
    }
    if (target.multiplayerSubtab !== context.multiplayerSubtab) {
      return false
    }
    return !target.selectedMultiplayerGameId
      || target.selectedMultiplayerGameId === context.selectedMultiplayerGameId
  }

  if (target.routeId === 'solo') {
    if (target.soloSubtab !== context.soloSubtab) {
      return false
    }
    return !target.selectedSoloGameKey || target.selectedSoloGameKey === context.selectedSoloGameKey
  }

  return true
}

export function selectBrowserNotificationDispatches(
  input: SelectBrowserNotificationDispatchInput,
): readonly BrowserNotificationDispatchDecision[] {
  const preferences = normalizeNotificationPreferences(input.preferences)
  if (
    input.suppressInitial
    || input.permission !== 'granted'
    || !preferences.browserNotificationsEnabled
    || !preferences.inAppNotificationsEnabled
  ) {
    return []
  }

  const previous = new Set(input.previousFingerprints ?? [])
  const documentHidden = input.documentHidden === true

  return input.items
    .filter((item) => (
      !item.dismissed
      && !item.read
      && shouldIncludeInAppNotification(item, preferences)
      && !previous.has(getBrowserNotificationFingerprint(item))
      && (documentHidden || !isTargetSurfaceActive(item.actionTarget, input.routeContext))
    ))
    .map((item) => ({
      fingerprint: getBrowserNotificationFingerprint(item),
      item,
      itemId: item.id,
      kind: item.kind,
    }))
}

function normalizePayloadText(value: string, fallback: string, maxLength: number): string {
  const normalized = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[account]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/\s+/g, ' ')
    .trim()

  const safeText = normalized || fallback
  return safeText.length > maxLength ? `${safeText.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...` : safeText
}

export function createBrowserNotificationPayload(item: NotificationItemViewModel): BrowserNotificationPayload {
  return {
    options: {
      body: normalizePayloadText(item.detail, 'Open amordle for details.', 180),
      silent: true,
      tag: `brrrdle-${item.kind}`,
    },
    title: normalizePayloadText(item.title, 'amordle notification', 80),
  }
}

export function dispatchBrowserNotification(
  item: NotificationItemViewModel,
  runtime: BrowserNotificationDispatchRuntime = getDefaultRuntime() as BrowserNotificationDispatchRuntime,
  options: {
    readonly onClick?: (item: NotificationItemViewModel) => void
  } = {},
): boolean {
  if (!runtime.Notification || getBrowserNotificationPermissionState(runtime) !== 'granted') {
    return false
  }

  const payload = createBrowserNotificationPayload(item)
  try {
    const notification = new runtime.Notification(payload.title, payload.options)
    if (options.onClick) {
      notification.onclick = () => {
        try {
          runtime.focus?.()
        } catch {
          // Best-effort focus only; routing should still run when the page context is alive.
        }

        options.onClick?.(item)

        try {
          notification.close?.()
        } catch {
          // Best-effort local cleanup only.
        }
      }
    }
    return true
  } catch {
    return false
  }
}

export function getBrowserNotificationStatusDescription(state: BrowserNotificationPermissionState): string {
  switch (state) {
    case 'default':
      return 'Use the Settings button below to ask this browser for permission. amordle never asks automatically.'
    case 'denied':
      return 'This browser has blocked notification permission. Change the browser site setting to allow it again.'
    case 'granted':
      return 'This browser has granted notification permission. Browser notifications stay optional, local, and foreground-only.'
    case 'unsupported':
      return 'This browser session does not expose the Notification API. In-app notifications still work.'
    default:
      return 'Browser notification status could not be determined.'
  }
}

export async function requestBrowserNotificationPermission(
  runtime: BrowserNotificationRuntime = getDefaultRuntime(),
): Promise<BrowserNotificationPermissionState> {
  if (!runtime.Notification) {
    return 'unsupported'
  }

  try {
    const permission = await runtime.Notification.requestPermission()
    return normalizePermission(permission)
  } catch {
    return getBrowserNotificationPermissionState(runtime)
  }
}
