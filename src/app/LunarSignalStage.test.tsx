import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SURFACE_THEME } from '../theme'
import { getRouteById, getPrimaryNavigationRoutes } from './routes'
import { LunarSignalStage } from './LunarSignalStage'

describe('LunarSignalStage', () => {
  it('mounts Home route children instead of leaving Home as a dormant selector only', () => {
    const html = renderToStaticMarkup(
      <LunarSignalStage
        accountControls={<button type="button">Guest</button>}
        activeRoute={getRouteById('home')}
        metrics={[]}
        onNavigate={() => undefined}
        routes={getPrimaryNavigationRoutes(false)}
        surfaceTheme={DEFAULT_SURFACE_THEME}
      >
        <section aria-label="Home dashboard test content">Dashboard child</section>
      </LunarSignalStage>,
    )

    expect(html).toContain('Dashboard child')
    expect(html).not.toContain('Pick a colored tab below')
    expect(html).not.toContain('Deck readout')
    expect(html).not.toContain('Mode deck')
  })

  it('renders route attention badges as descriptions without changing route button names', () => {
    const html = renderToStaticMarkup(
      <LunarSignalStage
        accountControls={<button type="button">Guest</button>}
        activeRoute={getRouteById('solo')}
        metrics={[]}
        onNavigate={() => undefined}
        routeAttention={{
          multiplayer: {
            ariaLabel: '2 Multiplayer games need your turn',
            label: '2',
            tone: 'urgent',
          },
        }}
        routes={getPrimaryNavigationRoutes(false)}
        surfaceTheme={DEFAULT_SURFACE_THEME}
      >
        <section aria-label="Solo content">Solo child</section>
      </LunarSignalStage>,
    )

    expect(html).toContain('aria-label="Multiplayer"')
    expect(html).toContain('2 Multiplayer games need your turn')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-tone="urgent"')
  })

  it('does not render global header status chips on ordinary pages', () => {
    const html = renderToStaticMarkup(
      <LunarSignalStage
        accountControls={<button type="button">Guest</button>}
        activeRoute={getRouteById('home')}
        metrics={[
          { label: 'Daily', value: '5 letters' },
          { label: 'Banks', value: 34 },
        ]}
        onNavigate={() => undefined}
        routes={getPrimaryNavigationRoutes(false)}
        surfaceTheme={DEFAULT_SURFACE_THEME}
      >
        <section aria-label="Home dashboard test content">Dashboard child</section>
      </LunarSignalStage>,
    )

    expect(html).not.toContain('Awordle route summary')
    expect(html).not.toContain('5 letters')
    expect(html).not.toContain('Banks')
    expect(html).not.toContain('Ready')
    expect(html).not.toContain('System readout')
  })

  it('renders the explicit progression HUD slot without reviving legacy metrics', () => {
    const html = renderToStaticMarkup(
      <LunarSignalStage
        accountControls={<button type="button">Guest</button>}
        activeRoute={getRouteById('solo')}
        metrics={[
          { label: 'Daily', value: '5 letters' },
        ]}
        onNavigate={() => undefined}
        progressionHud={<aside aria-label="Current progression">Level 2 / 42 coins</aside>}
        routes={getPrimaryNavigationRoutes(false)}
        surfaceTheme={DEFAULT_SURFACE_THEME}
      >
        <section aria-label="Solo content">Solo child</section>
      </LunarSignalStage>,
    )

    expect(html).toContain('aria-label="Current progression"')
    expect(html).toContain('Level 2')
    expect(html).toContain('42 coins')
    expect(html).not.toContain('Awordle route summary')
    expect(html).not.toContain('5 letters')
  })

  it('renders a reversible inactive Focus Mode control without changing route access', () => {
    const routes = getPrimaryNavigationRoutes(false)
    const html = renderToStaticMarkup(
      <LunarSignalStage
        accountControls={<button type="button">Account menu</button>}
        activeRoute={getRouteById('solo')}
        focusModeEnabled={false}
        metrics={[]}
        onFocusModeChange={() => undefined}
        onNavigate={() => undefined}
        progressionHud={<aside aria-label="Current progression">Level 2 / 42 coins</aside>}
        routes={routes}
        surfaceTheme={DEFAULT_SURFACE_THEME}
      >
        <section aria-label="Solo content">Solo child</section>
      </LunarSignalStage>,
    )

    expect(html).toContain('aria-label="Enter focus mode"')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('Focus')
    expect(html).not.toContain('is-focus-mode')
    expect(html).toContain('Account menu')
    expect(html).toContain('aria-label="Current progression"')
    routes.forEach((route) => {
      expect(html).toContain(`aria-label="${route.shortLabel}"`)
    })
  })

  it('keeps exit recovery account controls attention and routes visible in Focus Mode', () => {
    const routes = getPrimaryNavigationRoutes(false)
    const html = renderToStaticMarkup(
      <LunarSignalStage
        accountControls={<button type="button">Account menu</button>}
        activeRoute={getRouteById('multiplayer')}
        focusModeEnabled
        metrics={[]}
        onFocusModeChange={() => undefined}
        onNavigate={() => undefined}
        progressionHud={<aside aria-label="Current progression">Level 2 / 42 coins</aside>}
        routeAttention={{
          multiplayer: {
            ariaLabel: '2 Multiplayer games need your turn',
            label: '2',
            tone: 'urgent',
          },
          settings: {
            ariaLabel: 'Sync needs attention',
            label: '!',
            tone: 'attention',
          },
        }}
        routes={routes}
        surfaceTheme={DEFAULT_SURFACE_THEME}
      >
        <section aria-label="Multiplayer content">Multiplayer child</section>
      </LunarSignalStage>,
    )

    expect(html).toContain('is-focus-mode')
    expect(html).toContain('aria-label="Exit focus mode and restore the full shell"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Exit focus')
    expect(html).toContain('Account menu')
    expect(html).toContain('aria-label="Current progression"')
    expect(html).toContain('2 Multiplayer games need your turn')
    expect(html).toContain('Sync needs attention')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('aria-label="Settings"')
    expect(html).toContain('aria-label="Help"')
    routes.forEach((route) => {
      expect(html).toContain(`aria-label="${route.shortLabel}"`)
    })
  })

  it('does not need browser storage to render Focus Mode', () => {
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
      expect(() => renderToStaticMarkup(
        <LunarSignalStage
          accountControls={<button type="button">Account menu</button>}
          activeRoute={getRouteById('solo')}
          focusModeEnabled
          metrics={[]}
          onFocusModeChange={() => undefined}
          onNavigate={() => undefined}
          progressionHud={<aside aria-label="Current progression">Level 2 / 42 coins</aside>}
          routes={getPrimaryNavigationRoutes(false)}
          surfaceTheme={DEFAULT_SURFACE_THEME}
        >
          <section aria-label="Solo content">Solo child</section>
        </LunarSignalStage>,
      )).not.toThrow()
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage
      }
    }
  })
})
