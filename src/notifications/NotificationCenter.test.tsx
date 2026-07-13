import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NotificationCenter } from './NotificationCenter'
import type { NotificationCenterViewModel } from './notificationViewModels'

function createNotificationCenterFixture(
  overrides: Partial<NotificationCenterViewModel> = {},
): NotificationCenterViewModel {
  return {
    dismissedCount: 0,
    generatedAt: '2026-06-14T06:30:00.000Z',
    items: [
      {
        actionTarget: {
          multiplayerSubtab: 'active',
          routeId: 'multiplayer',
          selectedMultiplayerGameId: 'match-1',
        },
        detail: 'Daily Multiplayer OG is waiting for your guess.',
        dismissed: false,
        fingerprint: 'turn:match-1:2026-06-14T06:00:00.000Z',
        id: 'multiplayer:match-1:your-turn',
        kind: 'multiplayer-your-turn',
        priority: 'high',
        read: false,
        source: 'multiplayer',
        title: 'Your turn',
        updatedAt: '2026-06-14T06:00:00.000Z',
      },
      {
        actionTarget: {
          routeId: 'solo',
          soloSubtab: 'daily',
        },
        detail: 'Daily Solo has refreshed.',
        dismissed: false,
        fingerprint: 'daily:solo:2026-06-15T00:00:00.000Z',
        id: 'daily:solo:ready',
        kind: 'daily-solo-ready',
        priority: 'medium',
        read: false,
        source: 'daily',
        title: 'Daily Solo is ready',
        updatedAt: '2026-06-14T06:30:00.000Z',
      },
    ],
    readCount: 0,
    totalCandidateCount: 2,
    unreadCount: 2,
    ...overrides,
  }
}

describe('NotificationCenter', () => {
  it('renders a copy-light in-app notification panel with unread count and actions', () => {
    const html = renderToStaticMarkup(
      <NotificationCenter
        defaultOpen
        onActivate={() => undefined}
        onDismiss={() => undefined}
        onMarkAllRead={() => undefined}
        onMarkRead={() => undefined}
        viewModel={createNotificationCenterFixture()}
      />,
    )

    expect(html).toContain('Close in-app notifications. 2 unread notifications.')
    expect(html).toContain('data-open="true"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Notifications')
    expect(html).toContain('2 unread · 0 read')
    expect(html).toContain('Your turn')
    expect(html).toContain('Daily Multiplayer OG is waiting for your guess.')
    expect(html).toContain('Daily Solo is ready')
    expect(html).toContain('Mark all read')
    expect(html).toContain('Open')
    expect(html).toContain('Mark read')
    expect(html).toContain('Hide')
    expect(html).toContain('Hide this item locally until its source changes.')
    expect(html).not.toContain('Dismiss')
  })

  it('renders a quiet empty state without phantom notification items', () => {
    const html = renderToStaticMarkup(
      <NotificationCenter
        defaultOpen
        onActivate={() => undefined}
        onDismiss={() => undefined}
        onMarkAllRead={() => undefined}
        onMarkRead={() => undefined}
        viewModel={createNotificationCenterFixture({
          items: [],
          readCount: 2,
          totalCandidateCount: 2,
          unreadCount: 0,
        })}
      />,
    )

    expect(html).toContain('Close in-app notifications. 0 unread notifications.')
    expect(html).toContain('0 unread · 2 read')
    expect(html).toContain('No in-app notifications')
    expect(html).toContain('Read or dismissed items stay hidden until their source changes.')
    expect(html).not.toContain('Your turn')
  })
})
