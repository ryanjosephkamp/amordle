import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SURFACE_THEME } from '../theme'
import { getRouteById, getPrimaryNavigationRoutes } from './routes'
import { LunarSignalStage } from './LunarSignalStage'

function renderShell(options: {
  readonly activeRouteId?: Parameters<typeof getRouteById>[0]
  readonly children?: React.ReactNode
  readonly focusModeEnabled?: boolean
  readonly metrics?: readonly { readonly label: string; readonly value: React.ReactNode }[]
  readonly progressionHud?: React.ReactNode
  readonly routeAttention?: Parameters<typeof LunarSignalStage>[0]['routeAttention']
  readonly soloSubtab?: Parameters<typeof LunarSignalStage>[0]['soloSubtab']
} = {}) {
  return renderToStaticMarkup(
    <LunarSignalStage
      accountControls={<button type="button">Account menu</button>}
      activeRoute={getRouteById(options.activeRouteId ?? 'home')}
      focusModeEnabled={options.focusModeEnabled}
      metrics={options.metrics ?? []}
      onFocusModeChange={() => undefined}
      onNavigate={() => undefined}
      onShellNavigate={() => undefined}
      progressionHud={options.progressionHud}
      routeAttention={options.routeAttention}
      routes={getPrimaryNavigationRoutes(false)}
      soloSubtab={options.soloSubtab ?? 'overview'}
      surfaceTheme={DEFAULT_SURFACE_THEME}
    >
      {options.children ?? <section aria-label="Route content">Route child</section>}
    </LunarSignalStage>,
  )
}

describe('LunarSignalStage', () => {
  it('keeps route children mounted inside exactly one main landmark', () => {
    const html = renderShell({
      children: <section aria-label="Home dashboard test content">Dashboard child</section>,
    })

    expect(html).toContain('Dashboard child')
    expect(html.match(/<main/g)).toHaveLength(1)
    expect(html).not.toContain('Pick a colored tab below')
    expect(html).not.toContain('Deck readout')
  })

  it('renders the accepted desktop and mobile destination labels from one authority', () => {
    const html = renderShell()

    expect(html).toContain('aria-label="Primary destinations"')
    expect(html).toContain('aria-label="Mobile destinations"')
    expect(html).toContain('aria-label="PLAY"')
    expect(html).toContain('aria-label="DAILY"')
    expect(html).toContain('aria-label="COMBAT"')
    expect(html).toContain('aria-label="CALENDAR"')
    expect(html).toContain('aria-label="STATS"')
    expect(html).toContain('aria-label="MORE"')
    expect(html).not.toContain('aria-label="Multiplayer"')
    expect(html).not.toContain('amordle COMBAT')
  })

  it('uses destination-aware titles without changing the mounted route', () => {
    const dailyHtml = renderShell({ activeRouteId: 'solo', soloSubtab: 'daily' })
    const combatHtml = renderShell({ activeRouteId: 'multiplayer' })

    expect(dailyHtml).toContain('<h1 id="active-route-title">DAILY</h1>')
    expect(dailyHtml).toContain('aria-current="page"')
    expect(combatHtml).toContain('<h1 id="active-route-title">COMBAT</h1>')
    expect(combatHtml).toContain('Route child')
  })

  it('renders route attention as an accessible COMBAT destination description', () => {
    const html = renderShell({
      activeRouteId: 'solo',
      routeAttention: {
        multiplayer: {
          ariaLabel: '2 COMBAT games need your turn',
          label: '2',
          tone: 'urgent',
        },
      },
    })

    expect(html).toContain('aria-label="COMBAT"')
    expect(html).toContain('2 COMBAT games need your turn')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-tone="urgent"')
  })

  it('does not revive global metric chips and keeps the explicit progression slot', () => {
    const html = renderShell({
      metrics: [
        { label: 'Daily', value: '5 letters' },
        { label: 'Banks', value: 34 },
      ],
      progressionHud: <aside aria-label="Current progression">Level 2 / 42 coins</aside>,
    })

    expect(html).toContain('aria-label="Current progression"')
    expect(html).toContain('Level 2')
    expect(html).toContain('42 coins')
    expect(html).not.toContain('amordle route summary')
    expect(html).not.toContain('5 letters')
    expect(html).not.toContain('Banks')
  })

  it('renders reversible Focus Mode recovery without changing route children', () => {
    const inactiveHtml = renderShell({ activeRouteId: 'solo' })
    const activeHtml = renderShell({ activeRouteId: 'multiplayer', focusModeEnabled: true })

    expect(inactiveHtml).toContain('aria-label="Enter focus mode"')
    expect(inactiveHtml).toContain('aria-pressed="false"')
    expect(inactiveHtml).not.toContain('is-focus-mode')
    expect(activeHtml).toContain('is-focus-mode')
    expect(activeHtml).toContain('aria-label="Exit focus mode and restore the full shell"')
    expect(activeHtml).toContain('aria-pressed="true"')
    expect(activeHtml).toContain('Account menu')
    expect(activeHtml).toContain('Route child')
  })

  it('does not read or write browser storage to render Focus Mode', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const throwingStorage: Storage = {
      clear: () => {
        throw new Error('Focus Mode should not clear storage')
      },
      getItem: () => {
        throw new Error('Focus Mode should not read storage')
      },
      key: () => null,
      length: 0,
      removeItem: () => {
        throw new Error('Focus Mode should not remove storage')
      },
      setItem: () => {
        throw new Error('Focus Mode should not write storage')
      },
    }

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: throwingStorage,
    })

    try {
      expect(() => renderShell({ activeRouteId: 'solo', focusModeEnabled: true })).not.toThrow()
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage
      }
    }
  })
})
