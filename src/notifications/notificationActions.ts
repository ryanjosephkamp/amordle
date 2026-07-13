import {
  dispatchDashboardAction,
  type DashboardActionHandlers,
} from '../dashboard'
import {
  markNotificationDismissed,
  markNotificationRead,
  type NotificationMetadataState,
} from './notificationStorage'
import type { NotificationItemViewModel } from './notificationViewModels'

export type NotificationMetadataUpdater = (
  updater: (current: NotificationMetadataState) => NotificationMetadataState,
) => void

function getTimestamp(now?: () => string): string {
  return now?.() ?? new Date().toISOString()
}

export function markNotificationItemRead(
  item: NotificationItemViewModel,
  updateMetadata: NotificationMetadataUpdater,
  now?: () => string,
): void {
  updateMetadata((current) =>
    markNotificationRead(current, {
      fingerprint: item.fingerprint,
      id: item.id,
      readAt: getTimestamp(now),
    }),
  )
}

export function markVisibleNotificationItemsRead(
  items: readonly NotificationItemViewModel[],
  updateMetadata: NotificationMetadataUpdater,
  now?: () => string,
): void {
  const visibleUnreadItems = items.filter((item) => !item.dismissed && !item.read)
  if (visibleUnreadItems.length === 0) {
    return
  }

  const readAt = getTimestamp(now)
  updateMetadata((current) =>
    visibleUnreadItems.reduce((next, item) => markNotificationRead(next, {
      fingerprint: item.fingerprint,
      id: item.id,
      readAt,
    }), current),
  )
}

export function dismissNotificationItem(
  item: NotificationItemViewModel,
  updateMetadata: NotificationMetadataUpdater,
  now?: () => string,
): void {
  updateMetadata((current) =>
    markNotificationDismissed(current, {
      dismissedAt: getTimestamp(now),
      fingerprint: item.fingerprint,
      id: item.id,
    }),
  )
}

export function activateNotificationItem(
  item: NotificationItemViewModel,
  options: {
    readonly dashboardHandlers: DashboardActionHandlers
    readonly now?: () => string
    readonly updateMetadata: NotificationMetadataUpdater
  },
): void {
  markNotificationItemRead(item, options.updateMetadata, options.now)
  dispatchDashboardAction(item.actionTarget, options.dashboardHandlers, { autoCenterSoloGame: true })
}
