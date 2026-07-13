import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CalendarPanel } from './CalendarPanel'
import { createDefaultGuestProgress } from '../account/storageSchema'
import { createEmptyMultiplayerState } from '../multiplayer'

function noop() {}

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPanel(overrides: Partial<Parameters<typeof CalendarPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <CalendarPanel
      guestProgress={createDefaultGuestProgress()}
      keyboardDisabled
      multiplayer={createEmptyMultiplayerState()}
      multiplayerDailyDateKey="2025-06-15"
      onMultiplayerChange={noop}
      onGameComplete={noop}
      onMarkPastDailyUnlocked={noop}
      onResumeCapture={noop}
      onSpendCoins={() => true}
      onUpdateSettings={noop}
      todayDateKey="2025-06-15"
      {...overrides}
    />,
  )
}

describe('CalendarPanel', () => {
  it('renders the daily hub with today quick-play buttons and a month grid', () => {
    const html = renderPanel()
    expect(html).toContain('Calendar')
    expect(html).toContain('Play Today')
    expect(html).toContain('June 2025')
    // Quick-play buttons for both modes are present.
    expect(html).toContain('OG')
    expect(html).toContain('GO')
    expect(html).toContain('Daily Multiplayer')
    expect(html).toContain('S-OG')
    expect(html).toContain('M-GO')
    expect(html).not.toContain('L-OG')
  })

  it('shows the daily streak readouts from stats', () => {
    const html = renderPanel()
    expect(html).toContain('OG daily streak')
    expect(html).toContain('GO daily streak')
  })

  it('launches the requested daily when given an external launch request', () => {
    const html = renderPanel({ launchRequest: { mode: 'og', dateKey: '2025-06-15' } })
    // Once launched, the inline daily view shows the back-to-calendar control.
    expect(html).toContain('Back to Calendar')
  })

  it('launches Daily Multiplayer from an external countdown request', () => {
    const html = renderPanel({
      authStatus: 'authenticated',
      launchRequest: { dateKey: '2025-06-15', kind: 'multiplayer' },
      viewerUserId: 'user-1',
    })

    expect(html).toContain('Daily Multiplayer')
    expect(html).toContain('2025-06-15')
  })

  it('restores legacy split multiplayer surfaces from browser storage', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => key === 'brrrdle:calendar-surface:v1'
          ? JSON.stringify({ dateKey: '2025-06-15', kind: 'multiplayer', transport: 'live' })
          : null,
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    })

    const html = renderPanel({ authStatus: 'authenticated', viewerUserId: 'user-1' })

    expect(html).toContain('Daily Multiplayer')
    expect(html).toContain('2025-06-15')
  })
})
