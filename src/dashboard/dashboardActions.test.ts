import { describe, expect, it, vi } from 'vitest'
import type { DashboardActionHandlers } from './dashboardActions'
import { dispatchDashboardAction } from './dashboardActions'

function createHandlers() {
  const calls: string[] = []
  const handlers: DashboardActionHandlers = {
    onHistoryFiltersChange: vi.fn((filters) => calls.push(`history:${filters.player}:${filters.scope}:${filters.mode}`)),
    onMultiplayerSubtabChange: vi.fn((subtab) => calls.push(`multiplayer-subtab:${subtab}`)),
    onResumeMultiplayerGame: vi.fn((id) => {
      calls.push(`resume:${id}`)
      return false
    }),
    onSelectMultiplayerGame: vi.fn((id) => calls.push(`multiplayer-game:${id}`)),
    onSelectRoute: vi.fn((routeId) => calls.push(`route:${routeId}`)),
    onSelectSoloGame: vi.fn((key, options) => calls.push(`solo-game:${key}:${options?.autoCenter ? 'auto' : 'manual'}`)),
    onSoloSubtabChange: vi.fn((subtab) => calls.push(`solo-subtab:${subtab}`)),
  }

  return { calls, handlers }
}

describe('dispatchDashboardAction', () => {
  it('routes Solo dashboard actions through existing Solo navigation state handlers', () => {
    const { calls, handlers } = createHandlers()

    dispatchDashboardAction({
      routeId: 'solo',
      selectedSoloGameKey: 'practice-og',
      soloSubtab: 'active',
    }, handlers)

    expect(calls).toEqual([
      'route:solo',
      'solo-subtab:active',
      'solo-game:practice-og:manual',
    ])
  })

  it('can mark Solo dashboard actions as explicit auto-center targets', () => {
    const { calls, handlers } = createHandlers()

    dispatchDashboardAction({
      routeId: 'solo',
      selectedSoloGameKey: 'daily-go',
      soloSubtab: 'daily',
    }, handlers, { autoCenterSoloGame: true })

    expect(calls).toEqual([
      'route:solo',
      'solo-subtab:daily',
      'solo-game:daily-go:auto',
    ])
  })

  it('routes Multiplayer dashboard actions through existing Multiplayer navigation state handlers', () => {
    const { calls, handlers } = createHandlers()

    dispatchDashboardAction({
      multiplayerSubtab: 'lobby',
      routeId: 'multiplayer',
      selectedMultiplayerGameId: 'match-1',
    }, handlers)

    expect(calls).toEqual([
      'route:multiplayer',
      'multiplayer-subtab:lobby',
      'multiplayer-game:match-1',
    ])
  })

  it('uses the direct Multiplayer resume handler before generic fallback routing when available', () => {
    const { calls, handlers } = createHandlers()
    vi.mocked(handlers.onResumeMultiplayerGame!).mockImplementation((id) => {
      calls.push(`resume:${id}`)
      return true
    })

    dispatchDashboardAction({
      multiplayerSubtab: 'active',
      resumeMultiplayerGameId: 'match-1',
      routeId: 'multiplayer',
      selectedMultiplayerGameId: 'match-1',
    }, handlers)

    expect(calls).toEqual(['resume:match-1'])
  })

  it('falls back to the target Multiplayer tab when direct resume declines the id', () => {
    const { calls, handlers } = createHandlers()

    dispatchDashboardAction({
      multiplayerSubtab: 'active',
      resumeMultiplayerGameId: 'stale-match',
      routeId: 'multiplayer',
      selectedMultiplayerGameId: 'stale-match',
    }, handlers)

    expect(calls).toEqual([
      'resume:stale-match',
      'route:multiplayer',
      'multiplayer-subtab:active',
      'multiplayer-game:stale-match',
    ])
  })

  it('applies History filters before opening History', () => {
    const { calls, handlers } = createHandlers()

    dispatchDashboardAction({
      historyFilters: { mode: 'go', player: 'multiplayer', scope: 'daily' },
      routeId: 'history',
    }, handlers)

    expect(calls).toEqual([
      'history:multiplayer:daily:go',
      'route:history',
    ])
  })

  it('routes simple route targets without changing workspace state', () => {
    const { calls, handlers } = createHandlers()

    dispatchDashboardAction({ routeId: 'calendar' }, handlers)

    expect(calls).toEqual(['route:calendar'])
  })
})
