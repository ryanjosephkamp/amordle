import { useEffect, useRef, useState } from 'react'
import type { NotificationItemViewModel } from './notificationViewModels'
import type { NotificationCenterViewModel } from './notificationViewModels'

function formatNotificationTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  })
}

function sourceLabel(source: NotificationItemViewModel['source']): string {
  switch (source) {
    case 'daily':
      return 'Daily'
    case 'history':
      return 'History'
    case 'live':
      return 'Live'
    case 'lobby':
      return 'Lobby'
    case 'multiplayer':
      return 'Multiplayer'
    default:
      return 'Awordle'
  }
}

function priorityLabel(priority: NotificationItemViewModel['priority']): string {
  switch (priority) {
    case 'high':
      return 'High priority'
    case 'medium':
      return 'Medium priority'
    case 'low':
      return 'Low priority'
    default:
      return 'Notification'
  }
}

export interface NotificationCenterProps {
  readonly defaultOpen?: boolean
  readonly onActivate: (item: NotificationItemViewModel) => void
  readonly onDismiss: (item: NotificationItemViewModel) => void
  readonly onMarkAllRead: (items: readonly NotificationItemViewModel[]) => void
  readonly onMarkRead: (item: NotificationItemViewModel) => void
  readonly viewModel: NotificationCenterViewModel
}

export function NotificationCenter({
  defaultOpen = false,
  onActivate,
  onDismiss,
  onMarkAllRead,
  onMarkRead,
  viewModel,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(defaultOpen)
  const rootRef = useRef<HTMLDivElement>(null)
  const { items, readCount, unreadCount } = viewModel
  const unreadVisibleItems = items.filter((item) => !item.dismissed && !item.read)
  const panelId = 'brrrdle-notification-center-panel'
  const summaryText =
    unreadCount === 1 ? '1 unread notification' : `${unreadCount} unread notifications`
  const toggleAction = open ? 'Close' : 'Open'
  const handleActivate = (item: NotificationItemViewModel) => {
    setOpen(false)
    onActivate(item)
  }

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      const target = event.target
      if (!root || !(target instanceof Node) || root.contains(target)) {
        return
      }
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="brrrdle-notification-center" data-open={open ? 'true' : 'false'} ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={`${toggleAction} in-app notifications. ${summaryText}.`}
        className="brrrdle-notification-summary"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>Notifications</span>
        <span className="brrrdle-notification-count">{unreadCount}</span>
      </button>

      {open ? (
        <section
          aria-label="In-app notifications"
          aria-live="polite"
          className="brrrdle-notification-panel"
          id={panelId}
        >
          <div className="brrrdle-notification-header">
            <div>
              <h2>Notifications</h2>
              <p>
                {unreadCount} unread · {readCount} read
              </p>
            </div>
            {unreadVisibleItems.length > 0 ? (
              <button
                className="brrrdle-notification-mark-all"
                onClick={() => onMarkAllRead(unreadVisibleItems)}
                type="button"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length > 0 ? (
            <ul className="brrrdle-notification-list">
              {items.map((item) => (
                <li className="brrrdle-notification-item" key={item.id}>
                  <div className="brrrdle-notification-item-header">
                    <span>{sourceLabel(item.source)}</span>
                    <span>{priorityLabel(item.priority)}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                  <p className="brrrdle-notification-time">
                    Updated {formatNotificationTime(item.updatedAt)}
                  </p>
                  <div className="brrrdle-notification-actions">
                    <button onClick={() => handleActivate(item)} type="button">
                      Open
                    </button>
                    {!item.read ? (
                      <button onClick={() => onMarkRead(item)} type="button">
                        Mark read
                      </button>
                    ) : null}
                    <button
                      className="brrrdle-notification-hide-action"
                      onClick={() => onDismiss(item)}
                      title="Hide this item locally until its source changes."
                      type="button"
                    >
                      Hide
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="brrrdle-notification-empty">
              <h3>No in-app notifications</h3>
              <p>Read or dismissed items stay hidden until their source changes.</p>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
