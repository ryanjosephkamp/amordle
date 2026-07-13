import { describe, expect, it } from 'vitest'
import { createCustomGameCode, createCustomGameLobby, normalizeCustomGameLobby } from './customGames'

describe('custom game lobbies', () => {
  it('creates unranked invite lobbies by default', () => {
    const lobby = createCustomGameLobby({
      code: 'BRRRD1',
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      scope: 'practice',
      wordLength: 5,
    })

    expect(lobby.ranked).toBe(false)
    expect(lobby.code).toBe('BRRRD1')
    expect(lobby.expiresAt).toBe('2026-06-05T12:00:00.000Z')
  })

  it('normalizes saved lobby records defensively', () => {
    expect(normalizeCustomGameLobby({
      code: 'abc123',
      id: 'custom-1',
      mode: 'go',
      scope: 'daily',
    })?.code).toBe('ABC123')
    expect(normalizeCustomGameLobby({ mode: 'og' })).toBeUndefined()
  })

  it('generates compact deterministic codes from a seed', () => {
    expect(createCustomGameCode(12345)).toHaveLength(6)
  })
})
