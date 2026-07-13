import { describe, expect, it } from 'vitest'
import { createDefaultGuestProgress, type ActiveProgressScope } from '../account'
import { createMultiplayerGame, type MultiplayerState } from '../multiplayer'
import { selectScopedProgressMultiplayerState } from './scopedProgressMultiplayerState'

const accountScope: ActiveProgressScope = { kind: 'authenticated', userId: 'account-a' }
const rivalAccountScope: ActiveProgressScope = { kind: 'authenticated', userId: 'account-b' }
const guestScope: ActiveProgressScope = { kind: 'guest' }

function createState(gameId: string): MultiplayerState {
  return {
    games: [
      createMultiplayerGame({
        id: gameId,
        mode: 'og',
        playerUserIds: { 'player-one': 'account-a' },
        scope: 'practice',
        wordLength: 5,
      }),
    ],
  }
}

function createStateForUser(gameId: string, userId: string): MultiplayerState {
  return {
    games: [
      createMultiplayerGame({
        id: gameId,
        mode: 'og',
        playerUserIds: { 'player-one': userId },
        scope: 'practice',
        wordLength: 5,
      }),
    ],
  }
}

describe('selectScopedProgressMultiplayerState', () => {
  it('preserves visible async multiplayer rows during same-account progress hydration', () => {
    const currentMultiplayerState = createState('visible-game')
    const nextProgress = {
      ...createDefaultGuestProgress(),
      multiplayer: createState('stale-progress-cache-game'),
    }

    const input = {
      currentAuthorityUserId: accountScope.userId,
      currentMultiplayerState,
      nextProgress,
      nextScope: accountScope,
    }

    expect(selectScopedProgressMultiplayerState(input)).toBe(currentMultiplayerState)
  })

  it('uses target-account progress provisionally when switching accounts and uses progress for guest scopes', () => {
    const currentMultiplayerState = createState('previous-account-game')
    const nextMultiplayerState = createState('next-scope-game')
    const nextProgress = {
      ...createDefaultGuestProgress(),
      multiplayer: nextMultiplayerState,
    }

    expect(selectScopedProgressMultiplayerState({
      currentMultiplayerState,
      nextProgress,
      nextScope: rivalAccountScope,
    })).toBe(nextMultiplayerState)

    expect(selectScopedProgressMultiplayerState({
      currentMultiplayerState,
      nextProgress,
      nextScope: guestScope,
    })).toBe(nextMultiplayerState)
  })

  it('preserves the complete same-account repository snapshot during guest-to-account hydration', () => {
    const freshTargetState = createStateForUser('fresh-server-game', accountScope.userId)
    const unrelatedState = createStateForUser('unrelated-public-lobby', rivalAccountScope.userId)
    const currentMultiplayerState = { games: [...freshTargetState.games, ...unrelatedState.games] }
    const nextProgress = {
      ...createDefaultGuestProgress(),
      multiplayer: createStateForUser('stale-progress-cache-game', accountScope.userId),
    }

    const input = {
      currentAuthorityUserId: accountScope.userId,
      currentMultiplayerState,
      nextProgress,
      nextScope: accountScope,
    }

    expect(selectScopedProgressMultiplayerState(input)).toBe(currentMultiplayerState)
  })

  it('uses cached target-account rows before its repository becomes authoritative', () => {
    const currentMultiplayerState = createStateForUser('previous-account-game', rivalAccountScope.userId)
    const nextMultiplayerState = createStateForUser('target-account-game', accountScope.userId)
    const nextProgress = {
      ...createDefaultGuestProgress(),
      multiplayer: nextMultiplayerState,
    }

    expect(selectScopedProgressMultiplayerState({
      currentMultiplayerState,
      nextProgress,
      nextScope: accountScope,
    })).toBe(nextMultiplayerState)
  })

  it('uses authenticated progress only as the provisional multiplayer projection before repository readiness', () => {
    const currentMultiplayerState = createStateForUser('visible-but-not-authoritative', accountScope.userId)
    const nextProgress = {
      ...createDefaultGuestProgress(),
      multiplayer: createStateForUser('stale-progress-cache-game', accountScope.userId),
    }

    expect(selectScopedProgressMultiplayerState({
      currentMultiplayerState,
      nextProgress,
      nextScope: accountScope,
    })).toBe(nextProgress.multiplayer)
  })

  it('preserves an explicitly authoritative same-account snapshot without relying on row identity fields', () => {
    const currentMultiplayerState: MultiplayerState = {
      games: [createMultiplayerGame({
        id: 'authority-owned-game',
        mode: 'go',
        scope: 'practice',
        wordLength: 5,
      })],
    }
    const nextProgress = {
      ...createDefaultGuestProgress(),
      multiplayer: createStateForUser('stale-progress-cache-game', accountScope.userId),
    }
    const input = {
      currentAuthorityUserId: accountScope.userId,
      currentMultiplayerState,
      nextProgress,
      nextScope: accountScope,
    }

    expect(selectScopedProgressMultiplayerState(input)).toBe(currentMultiplayerState)
  })
})
