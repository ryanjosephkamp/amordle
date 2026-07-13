import { describe, expect, it, vi } from 'vitest'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'
import type { MultiplayerGame } from './multiplayer'
import {
  cancelMultiplayerGame,
  createMultiplayerGame,
  expireTimedOutPracticeMultiplayerGames,
  forfeitMultiplayerGame,
  getMultiplayerAnswerWords,
  joinMultiplayerGame,
  submitMultiplayerGuess,
} from './multiplayer'
import {
  MULTIPLAYER_STORAGE_KEY,
  createLocalStorageMultiplayerRepository,
  createSupabaseMultiplayerRepository,
  isTrustedRankedSettlementCandidate,
  isTrustedRankedPracticeSettlementCandidate,
  loadAuthenticatedLiveSpectatorRows,
  loadPublicLiveSpectatorRows,
  loadMultiplayerState,
  normalizeAuthenticatedLiveSpectatorRows,
  normalizeParticipantIdentitySummaryRows,
  normalizePracticeRematchRequestRows,
  normalizePrivateMatchRequestRows,
  normalizePublicLiveSpectatorRows,
  normalizeTrustedRankedSettlementRows,
} from './multiplayerRepository'

function createStorage(initial: Record<string, string> = {}) {
  const values = { ...initial }
  return {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value
    },
    values,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

function createFilteredReadQuery<T>(order: () => T) {
  const query = {
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(order),
  }
  return query
}

function createGameRow(id: string, status: 'playing' | 'waiting') {
  const base = createMultiplayerGame({ mode: 'og', scope: 'practice', wordLength: 5 })
  return {
    created_at: '2026-07-12T12:00:00.000Z',
    projection: {
      ...base,
      id,
      playerUserIds: status === 'playing'
        ? { 'player-one': 'user-1', 'player-two': 'user-2' }
        : { 'player-one': 'lobby-host' },
      status,
      updatedAt: status === 'playing' ? '2026-07-12T12:02:00.000Z' : '2026-07-12T12:01:00.000Z',
    },
    updated_at: status === 'playing' ? '2026-07-12T12:02:00.000Z' : '2026-07-12T12:01:00.000Z',
  }
}

function createSanitizedSpectatorRow(overrides: Record<string, unknown> = {}) {
  return {
    created_at: '2026-06-15T23:50:00.000Z',
    current_turn_seat: 'player-two',
    daily_date_key: null,
    deadline_at: null,
    difficulty: 'expert',
    go_puzzle_count: null,
    hard_mode: true,
    id: 'spectator-game-1',
    mode: 'og',
    moves: [
      {
        createdAt: '2026-06-15T23:51:00.000Z',
        guess: 'ROBOT',
        puzzleIndex: 0,
        seat: 'player-one',
        tiles: [
          { letter: 'R', state: 'absent' },
          { letter: 'O', state: 'present' },
          { letter: 'B', state: 'absent' },
          { letter: 'O', state: 'correct' },
          { letter: 'T', state: 'correct' },
        ],
      },
    ],
    outcome: {
      label: 'In progress',
      status: 'playing',
      terminal: false,
    },
    players: [
      { label: 'Host', profile: { displayName: 'Host player', initials: 'H' }, seat: 'player-one' },
      { label: 'Rival', profile: { displayName: 'Rival player', initials: 'R' }, seat: 'player-two' },
    ],
    progress: {
      currentPuzzleIndex: 0,
      latestMoveAt: '2026-06-15T23:51:00.000Z',
      moveCount: 1,
      solvedPuzzleCount: 0,
    },
    ranked: false,
    rating_bucket: null,
    scope: 'practice',
    spectator_capabilities: {
      canCancel: false,
      canForfeit: false,
      canJoin: false,
      canMutate: false,
      canSubmitGuess: false,
    },
    status: 'playing',
    ended_at: null,
    terminal_at: null,
    terminal_hold_until: null,
    time_limit_ms: 300000,
    updated_at: '2026-06-15T23:52:00.000Z',
    word_length: 5,
    ...overrides,
  }
}

function createPublicSpectatorRow(overrides: Record<string, unknown> = {}) {
  return {
    created_at: '2026-06-30T21:50:00.000Z',
    current_turn_seat: 'player-two',
    go_puzzle_count: null,
    hard_mode: true,
    id: 'public-spectator-game-1',
    mode: 'og',
    moves: [
      {
        createdAt: '2026-06-30T21:51:00.000Z',
        guess: 'ROBOT',
        puzzleIndex: 0,
        seat: 'player-one',
        tiles: [
          { letter: 'R', state: 'absent' },
          { letter: 'O', state: 'present' },
          { letter: 'B', state: 'absent' },
          { letter: 'O', state: 'correct' },
          { letter: 'T', state: 'correct' },
        ],
      },
    ],
    outcome: {
      label: 'In progress',
      status: 'playing',
      terminal: false,
    },
    players: [
      { label: 'claudine', profile: { accentColor: 'aurora', avatarUrl: 'https://example.test/claudine.webp', displayName: 'claudine', initials: 'C' }, seat: 'player-one' },
      { label: 'kiki', profile: { accentColor: 'ice', avatarUrl: 'https://example.test/kiki.webp', displayName: 'kiki', initials: 'K' }, seat: 'player-two' },
    ],
    progress: {
      currentPuzzleIndex: 0,
      latestMoveAt: '2026-06-30T21:51:00.000Z',
      moveCount: 1,
      solvedPuzzleCount: 0,
    },
    ranked: false,
    scope: 'practice',
    spectator_capabilities: {
      canCancel: false,
      canClaimDaily: false,
      canForfeit: false,
      canJoin: false,
      canMutate: false,
      canNotify: false,
      canQueue: false,
      canSettleRating: false,
      canSubmitGuess: false,
    },
    status: 'playing',
    terminal_at: null,
    updated_at: '2026-06-30T21:52:00.000Z',
    word_length: 5,
    ...overrides,
  }
}

function createTrustedSettlementRow(overrides: Record<string, unknown> = {}) {
  return {
    bucket: 'async:og',
    expected_score: '0.5',
    idempotent: false,
    match_result_id: 'phase27-result-game-1',
    new_rating: 1220,
    old_rating: 1200,
    opponent_user_id: 'user-2',
    outcome: 'win',
    rating_delta: 20,
    user_id: 'user-1',
    ...overrides,
  }
}

function createRankedQueueRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    expires_at: null,
    hard_mode: false,
    queued_at: '2026-06-16T16:50:00.000Z',
    rating_bucket: 'async:og',
    rating_snapshot: 1200,
    request_id: 'queue-request-1',
    request_status: 'queued',
    word_length: 5,
    ...overrides,
  }
}

function createRankedQueueClaimRow(overrides: Record<string, unknown> = {}) {
  return {
    matched_game_id: null,
    opponent_request_id: null,
    request_id: 'queue-request-1',
    request_status: 'queued',
    ...overrides,
  }
}

function createRankedQueueStatusRow(overrides: Record<string, unknown> = {}) {
  return {
    hard_mode: true,
    matched_at: '2026-06-16T16:52:00.000Z',
    matched_game_id: 'ranked-game-1',
    mode: 'og',
    opponent_request_id: 'queue-request-2',
    player_one_user_id: 'user-1',
    player_two_user_id: 'user-2',
    queued_at: '2026-06-16T16:50:00.000Z',
    rating_bucket: 'async:og',
    request_id: 'queue-request-1',
    request_status: 'matched',
    scope: 'practice',
    time_limit_ms: null,
    viewer_seat: 'player-one',
    word_length: 5,
    ...overrides,
  }
}

function createRankedQueueFinalizationRow(overrides: Record<string, unknown> = {}) {
  return {
    created: true,
    game_id: 'ranked-game-1',
    idempotent: false,
    opponent_request_id: 'queue-request-2',
    request_id: 'queue-request-1',
    request_status: 'matched',
    ...overrides,
  }
}

function createPracticeRematchRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    created: false,
    created_at: '2026-06-24T00:10:00.000Z',
    created_game_id: null,
    expires_at: '2099-06-24T01:20:00.000Z',
    go_puzzle_count: null,
    hard_mode: false,
    idempotent: false,
    mode: 'og',
    opponent_seat: 'player-two',
    request_id: 'rematch-request-1',
    request_status: 'requested',
    requester_seat: 'player-one',
    responded_at: null,
    source_game_id: 'source-game-1',
    time_limit_ms: null,
    updated_at: '2026-06-24T00:10:00.000Z',
    viewer_can_accept: false,
    viewer_can_cancel: true,
    viewer_role: 'requester',
    word_length: 5,
    ...overrides,
  }
}

function createPrivateMatchRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    created: false,
    created_at: '2026-07-01T23:45:00.000Z',
    created_game_id: null,
    expires_at: '2099-07-02T00:00:00.000Z',
    go_puzzle_count: null,
    hard_mode: false,
    idempotent: false,
    mode: 'og',
    opponent_accent_color: 'ice',
    opponent_avatar_url: 'https://example.test/opponent.png',
    opponent_display_name: 'Kiki',
    opponent_flair_key: 'none',
    opponent_identity_available: true,
    opponent_profile_updated_at: '2026-07-01T23:40:00.000Z',
    opponent_public_profile_id: '22222222-2222-4222-8222-222222222222',
    request_id: 'private-request-1',
    request_status: 'requested',
    requester_accent_color: 'aurora',
    requester_avatar_url: 'https://example.test/requester.png',
    requester_display_name: 'Claudine',
    requester_flair_key: 'none',
    requester_identity_available: true,
    requester_profile_updated_at: '2026-07-01T23:39:00.000Z',
    requester_public_profile_id: '11111111-1111-4111-8111-111111111111',
    responded_at: null,
    time_limit_ms: null,
    updated_at: '2026-07-01T23:45:00.000Z',
    viewer_can_accept: true,
    viewer_can_cancel: false,
    viewer_can_decline: true,
    viewer_role: 'opponent',
    word_length: 5,
    ...overrides,
  }
}

function createParticipantIdentitySummaryRow(overrides: Record<string, unknown> = {}) {
  return {
    accent_color: 'rose',
    avatar_url: 'https://example.test/avatar.png',
    display_name: 'kiki',
    flair_key: 'spark',
    identity_available: true,
    is_viewer: false,
    public_profile_id: '11111111-1111-4111-8111-111111111111',
    seat: 'player-two',
    updated_at: '2026-06-24T23:50:00.000Z',
    ...overrides,
  }
}

describe('multiplayer repository seam', () => {
  it('normalizes corrupted local storage to an empty multiplayer state', () => {
    const storage = createStorage({ [MULTIPLAYER_STORAGE_KEY]: '{bad-json' })

    expect(loadMultiplayerState(storage).games).toEqual([])
  })

  it('saves and reloads multiplayer state through the local storage repository', async () => {
    const storage = createStorage()
    const repository = createLocalStorageMultiplayerRepository(storage)
    const game = createMultiplayerGame({ mode: 'og', scope: 'practice', wordLength: 5 })

    await repository.save({ games: [game] }, 0)

    expect(loadMultiplayerState(storage).games[0].id).toBe(game.id)
  })

  it('seeds the local repository from legacy guest-progress multiplayer state when no multiplayer key exists', async () => {
    const storage = createStorage()
    const game = createMultiplayerGame({ mode: 'og', scope: 'practice', wordLength: 5 })
    const repository = createLocalStorageMultiplayerRepository(storage, { games: [game] })

    expect((await repository.load()).state.games[0].id).toBe(game.id)
  })

  it('does not publish an empty authenticated bootstrap before the first server read settles', async () => {
    let resolveGames: ((value: { data: readonly unknown[], error: null }) => void) | undefined
    const games = new Promise<{ data: readonly unknown[], error: null }>((resolve) => {
      resolveGames = resolve
    })
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
    const client = {
      channel: vi.fn(() => channel),
      from: vi.fn(() => ({
        select: vi.fn(() => createFilteredReadQuery(() => games)),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-07-11T12:00:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })
    const listener = vi.fn()

    const unsubscribe = repository.subscribe(listener)
    expect(listener).not.toHaveBeenCalled()

    const load = repository.load()
    resolveGames?.({ data: [], error: null })
    await load

    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('publishes explicitly filtered participant games before waiting-lobby discovery settles', async () => {
    const participant = deferred<{ data: readonly unknown[], error: null }>()
    const waiting = deferred<{ data: readonly unknown[], error: null }>()
    const queryCalls: { filter?: string; status?: string }[] = []
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
    const client = {
      channel: vi.fn(() => channel),
      from: vi.fn(() => ({
        select: vi.fn(() => {
          const call: { filter?: string; status?: string } = {}
          queryCalls.push(call)
          const builder = {
            eq: vi.fn((column: string, value: string) => {
              if (column === 'status') call.status = value
              return builder
            }),
            or: vi.fn((filter: string) => {
              call.filter = filter
              return builder
            }),
            order: vi.fn(() => call.filter ? participant.promise : waiting.promise),
          }
          return builder
        }),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-07-12T12:03:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })
    const listener = vi.fn()
    repository.subscribe(listener)

    const load = repository.load()
    participant.resolve({ data: [createGameRow('participant-game', 'playing')], error: null })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())

    expect(listener.mock.calls[0]?.[0].state.games.map((game: { id: string }) => game.id)).toEqual(['participant-game'])
    expect(queryCalls.some((call) => call.filter === 'player_one_user_id.eq.user-1,player_two_user_id.eq.user-1')).toBe(true)
    expect(queryCalls.some((call) => call.status === 'waiting')).toBe(true)

    waiting.resolve({ data: [createGameRow('waiting-lobby', 'waiting')], error: null })
    await load
    expect(listener.mock.calls.at(-1)?.[0].state.games.map((game: { id: string }) => game.id)).toEqual([
      'participant-game',
      'waiting-lobby',
    ])
  })

  it('prepares the canonical Daily word bank before hydrating an answerless ranked Daily row', async () => {
    const game = createMultiplayerGame({
      createdAt: '2026-07-12T12:00:00.000Z',
      dailyDateKey: '2026-07-12',
      id: 'ranked-daily-game',
      matchmakingRequestId: 'phase55-ranked-daily-v1:finalize:ranked-daily-game',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      ratingBucket: 'multiplayer:og:daily:v1',
      scope: 'daily',
    })
    const {
      playerSessions: omittedPlayerSessions,
      serializedSession: omittedSerializedSession,
      ...answerlessProjection
    } = game
    void omittedPlayerSessions
    void omittedSerializedSession
    const prepareRankedDailyHydration = vi.fn(async () => undefined)
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
    const client = {
      channel: vi.fn(() => channel),
      from: vi.fn(() => ({
        select: vi.fn(() => createFilteredReadQuery(async () => ({
          data: [{
            created_at: game.createdAt,
            projection: answerlessProjection,
            updated_at: game.updatedAt,
          }],
          error: null,
        }))),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-07-12T12:03:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({
      client,
      prepareRankedDailyHydration,
      userId: 'user-1',
    })

    const snapshot = await repository.load()

    expect(prepareRankedDailyHydration).toHaveBeenCalledOnce()
    expect(snapshot.state.games.map((candidate) => candidate.id)).toContain(game.id)
  })

  it('deduplicates overlapping bootstrap and route loads into one participant read', async () => {
    const participant = deferred<{ data: readonly unknown[], error: null }>()
    const waiting = deferred<{ data: readonly unknown[], error: null }>()
    let participantQueries = 0
    let waitingQueries = 0
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
    const client = {
      channel: vi.fn(() => channel),
      from: vi.fn(() => ({
        select: vi.fn(() => {
          let participantQuery = false
          const builder = {
            eq: vi.fn(() => builder),
            or: vi.fn(() => {
              participantQuery = true
              return builder
            }),
            order: vi.fn(() => {
              if (participantQuery) {
                participantQueries += 1
                return participant.promise
              }
              waitingQueries += 1
              return waiting.promise
            }),
          }
          return builder
        }),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-07-12T12:03:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })
    const listener = vi.fn()
    repository.subscribe(listener)

    const bootstrapLoad = repository.load()
    const routeLoad = repository.load()
    expect(participantQueries).toBe(1)
    expect(waitingQueries).toBe(1)
    participant.resolve({ data: [createGameRow('participant-game', 'playing')], error: null })
    waiting.resolve({ data: [], error: null })
    const [bootstrapSnapshot, routeSnapshot] = await Promise.all([bootstrapLoad, routeLoad])

    expect(bootstrapSnapshot.state.games.map((game) => game.id)).toEqual(['participant-game'])
    expect(routeSnapshot.state.games.map((game) => game.id)).toEqual(['participant-game'])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('coalesces realtime bursts during a read into one trailing refresh', async () => {
    const participants = Array.from({ length: 3 }, () => deferred<{ data: readonly unknown[], error: null }>())
    const waiting = Array.from({ length: 3 }, () => deferred<{ data: readonly unknown[], error: null }>())
    let participantQueries = 0
    let waitingQueries = 0
    let realtimeHandler: (() => void) | undefined
    const channel = {
      on: vi.fn((_event: string, _filter: unknown, handler: () => void) => {
        realtimeHandler = handler
        return channel
      }),
      subscribe: vi.fn(() => channel),
    }
    const client = {
      channel: vi.fn(() => channel),
      from: vi.fn(() => ({
        select: vi.fn(() => {
          let participantQuery = false
          const builder = {
            eq: vi.fn(() => builder),
            or: vi.fn(() => {
              participantQuery = true
              return builder
            }),
            order: vi.fn(() => {
              if (participantQuery) {
                return participants[participantQueries++]!.promise
              }
              return waiting[waitingQueries++]!.promise
            }),
          }
          return builder
        }),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-07-12T12:03:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })
    const listener = vi.fn()
    repository.subscribe(listener)

    const load = repository.load()
    realtimeHandler?.()
    realtimeHandler?.()
    expect(participantQueries).toBe(1)
    expect(waitingQueries).toBe(1)

    participants[0]!.resolve({ data: [createGameRow('first-game', 'playing')], error: null })
    waiting[0]!.resolve({ data: [], error: null })
    await load
    await vi.waitFor(() => expect(participantQueries).toBe(2))
    expect(waitingQueries).toBe(2)

    participants[1]!.resolve({ data: [createGameRow('fresh-game', 'playing')], error: null })
    waiting[1]!.resolve({ data: [], error: null })
    await vi.waitFor(() => {
      expect(listener.mock.calls.at(-1)?.[0].state.games.map((game: { id: string }) => game.id)).toEqual(['fresh-game'])
    })
    expect(participantQueries).toBe(2)
    expect(waitingQueries).toBe(2)
  })

  it('reports non-secret participant and waiting-lane readiness timings', async () => {
    const events: unknown[] = []
    let now = 100
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
    const client = {
      channel: vi.fn(() => channel),
      from: vi.fn(() => ({
        select: vi.fn(() => createFilteredReadQuery(async () => ({ data: [], error: null }))),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-07-12T12:03:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({
      client,
      now: () => ++now,
      onReadinessEvent: (event) => events.push(event),
      userId: 'user-1',
    })

    await repository.load()

    expect(events).toEqual([
      { durationMs: 1, generation: 1, kind: 'participant-published', rowCount: 0 },
      { durationMs: 2, generation: 1, kind: 'waiting-published', rowCount: 0 },
    ])
  })

  it('surfaces authenticated game-read failures without publishing an empty snapshot', async () => {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
    const client = {
      channel: vi.fn(() => channel),
      from: vi.fn(() => ({
        select: vi.fn(() => createFilteredReadQuery(async () => ({ data: null, error: { message: 'read failed' } }))),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-07-11T12:00:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })
    const listener = vi.fn()
    repository.subscribe(listener)

    await expect(repository.load()).rejects.toThrow('Unable to load multiplayer games: read failed')
    expect(listener).not.toHaveBeenCalled()
  })

  it('normalizes sanitized authenticated Live spectator RPC rows', () => {
    const rows = normalizeAuthenticatedLiveSpectatorRows([createSanitizedSpectatorRow()])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      currentTurnSeat: 'player-two',
      hardMode: true,
      id: 'spectator-game-1',
      mode: 'og',
      scope: 'practice',
      spectatorCapabilities: {
        canCancel: false,
        canForfeit: false,
        canJoin: false,
        canMutate: false,
        canSubmitGuess: false,
      },
      timeLimitMs: 300000,
      wordLength: 5,
    })
    expect(rows[0].players.map((player) => player.label)).toEqual(['Host', 'Rival'])
    expect(rows[0].moves[0].tiles.map((tile) => tile.state)).toEqual(['absent', 'present', 'absent', 'correct', 'correct'])
  })

  it('normalizes sanitized terminal Live spectator rows during the bounded hold window', () => {
    const rows = normalizeAuthenticatedLiveSpectatorRows([
      createSanitizedSpectatorRow({
        current_turn_seat: null,
        ended_at: '2026-06-15T23:55:00.000Z',
        outcome: {
          label: 'Player one won',
          status: 'won',
          terminal: true,
          terminalAt: '2026-06-15T23:55:00.000Z',
          winnerSeat: 'player-one',
        },
        status: 'won',
        terminal_at: '2026-06-15T23:55:00.000Z',
        terminal_hold_until: '2026-06-15T23:55:15.000Z',
      }),
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      currentTurnSeat: undefined,
      endedAt: '2026-06-15T23:55:00.000Z',
      outcome: {
        label: 'Player one won',
        status: 'won',
        terminal: true,
        terminalAt: '2026-06-15T23:55:00.000Z',
        winnerSeat: 'player-one',
      },
      status: 'won',
      terminalAt: '2026-06-15T23:55:00.000Z',
      terminalHoldUntil: '2026-06-15T23:55:15.000Z',
    })
  })

  it('normalizes privacy-safe spectator cancellation and forfeit reasons', () => {
    const cancelled = normalizeAuthenticatedLiveSpectatorRows([
      createSanitizedSpectatorRow({
        current_turn_seat: null,
        ended_at: '2026-06-15T23:55:00.000Z',
        moves: [],
        outcome: {
          label: 'Match cancelled',
          status: 'cancelled',
          terminal: true,
          terminalAt: '2026-06-15T23:55:00.000Z',
          terminationReason: 'cancelled',
        },
        progress: {
          currentPuzzleIndex: 0,
          latestMoveAt: null,
          moveCount: 0,
          solvedPuzzleCount: 0,
        },
        status: 'cancelled',
        terminal_at: '2026-06-15T23:55:00.000Z',
        terminal_hold_until: '2026-06-15T23:55:15.000Z',
      }),
    ])
    const forfeited = normalizePublicLiveSpectatorRows([
      createPublicSpectatorRow({
        current_turn_seat: null,
        outcome: {
          forfeitedSeat: 'player-two',
          label: 'Player one won',
          status: 'won',
          terminal: true,
          terminalAt: '2026-06-30T21:55:00.000Z',
          terminationReason: 'forfeit',
          winnerSeat: 'player-one',
        },
        status: 'won',
        terminal_at: '2026-06-30T21:55:00.000Z',
      }),
    ])

    expect(cancelled[0]?.outcome).toMatchObject({ terminationReason: 'cancelled' })
    expect(forfeited[0]?.outcome).toMatchObject({
      forfeitedSeat: 'player-two',
      terminationReason: 'forfeit',
      winnerSeat: 'player-one',
    })
  })

  it('rejects inconsistent spectator termination metadata', () => {
    const playingForfeit = createSanitizedSpectatorRow({
      outcome: {
        forfeitedSeat: 'player-two',
        label: 'In progress',
        status: 'playing',
        terminal: false,
        terminationReason: 'forfeit',
      },
    })

    expect(normalizeAuthenticatedLiveSpectatorRows([playingForfeit])).toEqual([])
  })

  it('filters current Daily spectator rows as an app-side defense in depth', () => {
    const rows = normalizeAuthenticatedLiveSpectatorRows([
      createSanitizedSpectatorRow({
        daily_date_key: '2026-06-18',
        id: 'current-daily-game',
        scope: 'daily',
      }),
      createSanitizedSpectatorRow({
        daily_date_key: '2026-06-17',
        id: 'past-daily-game',
        scope: 'daily',
      }),
    ], new Date('2026-06-18T12:00:00.000Z'))

    expect(rows.map((row) => row.id)).toEqual(['past-daily-game'])
  })

  it('rejects Live spectator rows that contain forbidden raw projection or identity fields', () => {
    const rawProjection = createSanitizedSpectatorRow({
      projection: {
        serializedSession: { answer: 'crane' },
      },
    })
    const rawIdentity = createSanitizedSpectatorRow({
      players: [
        { label: 'Host', seat: 'player-one', userId: 'raw-auth-id' },
        { label: 'Rival', seat: 'player-two' },
      ],
    })

    expect(normalizeAuthenticatedLiveSpectatorRows([rawProjection, rawIdentity])).toEqual([])
  })

  it('loads authenticated Live spectator rows from the sanitized RPC only', async () => {
    const rpc = vi.fn(async () => ({ data: [createSanitizedSpectatorRow()], error: null }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient

    const rows = await loadAuthenticatedLiveSpectatorRows(client, 25)

    expect(rpc).toHaveBeenCalledWith('get_authenticated_live_v1_spectator_games_v2', {
      p_limit: 25,
      p_terminal_window_seconds: 15,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('spectator-game-1')
  })

  it('normalizes public Live spectator RPC rows with strict read-only public boundaries', () => {
    const rows = normalizePublicLiveSpectatorRows([createPublicSpectatorRow()])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      currentTurnSeat: 'player-two',
      difficulty: 'standard',
      hardMode: true,
      id: 'public-spectator-game-1',
      mode: 'og',
      scope: 'practice',
      spectatorCapabilities: {
        canCancel: false,
        canForfeit: false,
        canJoin: false,
        canMutate: false,
        canSubmitGuess: false,
      },
      wordLength: 5,
    })
    expect(rows[0].players.map((player) => player.profile?.displayName)).toEqual(['claudine', 'kiki'])
    expect(JSON.stringify(rows[0])).not.toContain('publicProfileId')
    expect(JSON.stringify(rows[0])).not.toContain('userId')
    expect(JSON.stringify(rows[0])).not.toContain('email')
  })

  it('rejects public Live spectator rows with Daily scope, broad keys, or mutation capabilities', () => {
    const daily = createPublicSpectatorRow({ id: 'daily-game', scope: 'daily' })
    const rawIdentity = createPublicSpectatorRow({
      players: [
        { label: 'Host', publicProfileId: 'profile-1', seat: 'player-one' },
        { label: 'Rival', seat: 'player-two' },
      ],
    })
    const broadProjection = createPublicSpectatorRow({
      projection: {
        serializedSession: { answer: 'crane' },
      },
    })
    const mutable = createPublicSpectatorRow({
      spectator_capabilities: {
        canCancel: false,
        canClaimDaily: false,
        canForfeit: false,
        canJoin: true,
        canMutate: false,
        canNotify: false,
        canQueue: false,
        canSettleRating: false,
        canSubmitGuess: false,
      },
    })

    expect(normalizePublicLiveSpectatorRows([daily, rawIdentity, broadProjection, mutable])).toEqual([])
  })

  it('loads public Live spectator rows from the dedicated public projection RPC only', async () => {
    const rpc = vi.fn(async () => ({ data: [createPublicSpectatorRow()], error: null }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient

    const rows = await loadPublicLiveSpectatorRows(client, 99, 99, ' public-spectator-game-1 ')

    expect(rpc).toHaveBeenCalledWith('get_public_live_v1_spectator_games_v1', {
      p_game_id: 'public-spectator-game-1',
      p_limit: 50,
      p_terminal_window_seconds: 30,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('public-spectator-game-1')
  })

  it('normalizes trusted ranked settlement RPC rows without raw game projections', () => {
    const transactions = normalizeTrustedRankedSettlementRows([
      createTrustedSettlementRow(),
      createTrustedSettlementRow({
        bucket: 'async:go',
        expected_score: 0.49,
        match_result_id: 'phase27-result-game-2',
        new_rating: 1180,
        old_rating: 1200,
        opponent_user_id: 'user-1',
        outcome: 'loss',
        rating_delta: -20,
        user_id: 'user-2',
      }),
      createTrustedSettlementRow({
        bucket: 'async:og:timed:v1',
        match_result_id: 'phase33-result-game-1',
      }),
    ], '2026-06-16T06:10:00.000Z')

    expect(transactions).toHaveLength(3)
    expect(transactions[0]).toMatchObject({
      bucket: 'multiplayer:og',
      createdAt: '2026-06-16T06:10:00.000Z',
      expectedScore: 0.5,
      id: 'trusted-phase27-result-game-1-multiplayer:og-user-1',
      idempotent: false,
      matchId: 'phase27-result-game-1',
      newRating: 1220,
      oldRating: 1200,
      opponentUserId: 'user-2',
      outcome: 'win',
      ratingDelta: 20,
      userId: 'user-1',
    })
    expect(transactions[1].bucket).toBe('multiplayer:go')
    expect(transactions[2].bucket).toBe('multiplayer:og:timed:v1')
  })

  it('rejects trusted ranked settlement rows that contain raw projection fields', () => {
    const transactions = normalizeTrustedRankedSettlementRows([
      createTrustedSettlementRow({
        projection: {
          serializedSession: { answer: 'crane' },
        },
      }),
    ])

    expect(transactions).toEqual([])
  })

  it('identifies only queue-backed terminal Practice ranked games as trusted settlement candidates', () => {
    const game = createMultiplayerGame({
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    })
    const terminal = submitted.game!

    const terminalTimed = {
      ...terminal,
      ratingBucket: 'multiplayer:og:timed:v1' as const,
      timeLimitMs: 300_000 as const,
    }

    expect(isTrustedRankedPracticeSettlementCandidate(terminal)).toBe(true)
    expect(isTrustedRankedPracticeSettlementCandidate(terminalTimed)).toBe(true)
    expect(isTrustedRankedPracticeSettlementCandidate({ ...terminal, matchmakingRequestId: undefined })).toBe(false)
    expect(isTrustedRankedPracticeSettlementCandidate({ ...terminal, scope: 'daily' })).toBe(false)
    expect(isTrustedRankedPracticeSettlementCandidate({ ...terminal, timeLimitMs: 30_000 })).toBe(false)
    expect(isTrustedRankedPracticeSettlementCandidate({ ...terminalTimed, ratingBucket: 'multiplayer:og' })).toBe(false)
    expect(isTrustedRankedPracticeSettlementCandidate({ ...terminal, customGameCode: 'abc123' })).toBe(false)
    expect(isTrustedRankedPracticeSettlementCandidate({ ...terminal, status: 'playing' })).toBe(false)
  })

  it('settles queue-backed terminal Practice ranked games through the trusted Supabase RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        createTrustedSettlementRow(),
        createTrustedSettlementRow({
          match_result_id: 'phase27-result-game-1',
          new_rating: 1180,
          old_rating: 1200,
          opponent_user_id: 'user-1',
          outcome: 'loss',
          rating_delta: -20,
          user_id: 'user-2',
        }),
      ],
      error: null,
    }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const game = createMultiplayerGame({
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    })
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    const settlement = await repository.settleRankedGame(submitted.game!)

    expect(rpc).toHaveBeenCalledWith('settle_ranked_async_multiplayer_match_v2', {
      p_game_id: game.id,
      p_idempotency_key: `phase27-ranked-v1:async:${game.id}:async:og`,
    })
    expect(settlement?.transactions).toHaveLength(2)
    expect(settlement?.transactions[0].bucket).toBe('multiplayer:og')
  })

  it('settles canonical timed Practice ranked games through the timed trusted settlement namespace', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        createTrustedSettlementRow({
          bucket: 'async:og:timed:v1',
          match_result_id: 'phase33-result-game-1',
        }),
        createTrustedSettlementRow({
          bucket: 'async:og:timed:v1',
          match_result_id: 'phase33-result-game-1',
          new_rating: 1180,
          old_rating: 1200,
          opponent_user_id: 'user-1',
          outcome: 'loss',
          rating_delta: -20,
          user_id: 'user-2',
        }),
      ],
      error: null,
    }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const game = createMultiplayerGame({
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      ratingBucket: 'multiplayer:og:timed:v1',
      scope: 'practice',
      seed: 1,
      timeLimitMs: 300_000,
      wordLength: 5,
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    })
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    const settlement = await repository.settleRankedGame(submitted.game!)

    expect(rpc).toHaveBeenCalledWith('settle_ranked_async_multiplayer_match_v2', {
      p_game_id: game.id,
      p_idempotency_key: `phase33-ranked-timed-v1:async:${game.id}:async:og:timed:v1`,
    })
    expect(settlement?.transactions).toHaveLength(2)
    expect(settlement?.transactions[0].bucket).toBe('multiplayer:og:timed:v1')
  })

  it('settles queue-backed terminal ranked Daily games in their separate rating bucket', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        createTrustedSettlementRow({
          bucket: 'async:og:daily:v1',
          match_result_id: 'phase55-result-game-1',
        }),
        createTrustedSettlementRow({
          bucket: 'async:og:daily:v1',
          match_result_id: 'phase55-result-game-1',
          new_rating: 1180,
          old_rating: 1200,
          opponent_user_id: 'user-1',
          outcome: 'loss',
          rating_delta: -20,
          user_id: 'user-2',
        }),
      ],
      error: null,
    }))
    const game = createMultiplayerGame({
      dailyDateKey: '2026-07-10',
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      ratingBucket: 'multiplayer:og:daily:v1',
      scope: 'daily',
      seed: 1,
      wordLength: 5,
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    })
    const terminal = submitted.game!
    const repository = createSupabaseMultiplayerRepository({
      client: { rpc } as unknown as BrrrdleSupabaseClient,
      userId: 'user-1',
    })

    expect(isTrustedRankedSettlementCandidate(terminal)).toBe(true)
    expect(isTrustedRankedPracticeSettlementCandidate(terminal)).toBe(false)
    const settlement = await repository.settleRankedGame(terminal)

    expect(rpc).toHaveBeenCalledWith('settle_ranked_async_multiplayer_match_v2', {
      p_game_id: game.id,
      p_idempotency_key: `phase55-ranked-daily-v1:async:${game.id}:async:og:daily:v1`,
    })
    expect(settlement?.transactions).toHaveLength(2)
    expect(settlement?.transactions[0].bucket).toBe('multiplayer:og:daily:v1')
  })

  it('does not call the trusted settlement RPC for ineligible games', async () => {
    const rpc = vi.fn(async () => ({ data: [createTrustedSettlementRow()], error: null }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })
    const game = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    })

    await expect(repository.settleRankedGame(submitted.game!)).resolves.toBeUndefined()

    expect(rpc).not.toHaveBeenCalled()
  })

  it('throws when the trusted settlement RPC returns no parseable transactions', async () => {
    const rpc = vi.fn(async () => ({
      data: [createTrustedSettlementRow({ projection: { serializedSession: { answer: 'crane' } } })],
      error: null,
    }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const game = createMultiplayerGame({
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    })
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    await expect(repository.settleRankedGame(submitted.game!)).rejects.toThrow('Unable to parse ranked multiplayer settlement result.')
  })

  it('creates ranked Practice queue requests through the trusted RPC', async () => {
    const rpc = vi.fn(async () => ({ data: [createRankedQueueRequestRow()], error: null }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    const request = await repository.createRankedQueueRequest({
      hardMode: false,
      idempotencyKey: 'phase27-ranked-v1:queue:user-1:og:5:false',
      mode: 'og',
      wordLength: 5,
    })

    expect(rpc).toHaveBeenCalledWith('create_ranked_async_matchmaking_request', {
      p_expires_at: null,
      p_hard_mode: false,
      p_idempotency_key: 'phase27-ranked-v1:queue:user-1:og:5:false',
      p_mode: 'og',
      p_scope: 'practice',
      p_time_limit_ms: null,
      p_word_length: 5,
    })
    expect(request).toMatchObject({
      ratingBucket: 'multiplayer:og',
      requestId: 'queue-request-1',
      requestStatus: 'queued',
      wordLength: 5,
    })
  })

  it('creates canonical timed ranked Practice queue requests and rejects unsupported timers before RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [createRankedQueueRequestRow({
        rating_bucket: 'async:go:timed:v1',
        time_limit_ms: 300_000,
      })],
      error: null,
    }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    const request = await repository.createRankedQueueRequest({
      hardMode: false,
      mode: 'go',
      timeLimitMs: 300_000,
      wordLength: 5,
    })

    expect(rpc).toHaveBeenCalledWith('create_ranked_async_matchmaking_request', {
      p_expires_at: null,
      p_hard_mode: false,
      p_idempotency_key: null,
      p_mode: 'go',
      p_scope: 'practice',
      p_time_limit_ms: 300_000,
      p_word_length: 5,
    })
    expect(request).toMatchObject({
      ratingBucket: 'multiplayer:go:timed:v1',
      timeLimitMs: 300_000,
    })

    await expect(repository.createRankedQueueRequest({
      mode: 'go',
      timeLimitMs: 30_000,
      wordLength: 5,
    })).rejects.toThrow('Timed Practice ranked supports only the canonical five-minute clock.')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('creates fixed-settings ranked Daily queue requests through the trusted RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [createRankedQueueRequestRow({
        daily_date_key: '2026-07-10',
        mode: 'go',
        rating_bucket: 'async:go:daily:v1',
        scope: 'daily',
      })],
      error: null,
    }))
    const repository = createSupabaseMultiplayerRepository({
      client: { rpc } as unknown as BrrrdleSupabaseClient,
      userId: 'user-1',
    })

    const request = await repository.createRankedQueueRequest({
      dailyDateKey: '2026-07-10',
      hardMode: true,
      idempotencyKey: 'phase55-ranked-daily-v1:queue:user-1:2026-07-10:go:true',
      mode: 'go',
      scope: 'daily',
      wordLength: 5,
    })

    expect(rpc).toHaveBeenCalledWith('create_ranked_async_matchmaking_request_v2', {
      p_daily_date_key: '2026-07-10',
      p_expires_at: null,
      p_hard_mode: true,
      p_idempotency_key: 'phase55-ranked-daily-v1:queue:user-1:2026-07-10:go:true',
      p_mode: 'go',
      p_scope: 'daily',
      p_time_limit_ms: null,
      p_word_length: 5,
    })
    expect(request).toMatchObject({
      dailyDateKey: '2026-07-10',
      ratingBucket: 'multiplayer:go:daily:v1',
      requestStatus: 'queued',
      scope: 'daily',
      wordLength: 5,
    })
  })

  it('rejects malformed ranked Daily queue settings before RPC', async () => {
    const rpc = vi.fn()
    const repository = createSupabaseMultiplayerRepository({
      client: { rpc } as unknown as BrrrdleSupabaseClient,
      userId: 'user-1',
    })

    for (const input of [
      { dailyDateKey: '', mode: 'og' as const, scope: 'daily' as const, wordLength: 5 },
      { dailyDateKey: '2026-07-10', mode: 'og' as const, scope: 'daily' as const, timeLimitMs: 300_000, wordLength: 5 },
      { dailyDateKey: '2026-07-10', mode: 'og' as const, scope: 'daily' as const, wordLength: 6 },
    ]) {
      await expect(repository.createRankedQueueRequest(input)).rejects.toThrow('Ranked Daily requires a valid UTC date, five letters, and no clock.')
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it('claims, reads status, and finalizes ranked Practice queue games through trusted RPCs', async () => {
    const game = createMultiplayerGame({
      hardMode: true,
      id: 'ranked-game-1',
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      ratingBucket: 'multiplayer:og',
      scope: 'practice',
      wordLength: 5,
    })
    const rpc = vi.fn(async (name: string) => {
      if (name === 'claim_ranked_async_matchmaking_pair') {
        return {
          data: [createRankedQueueClaimRow({
            matched_game_id: 'ranked-game-1',
            opponent_request_id: 'queue-request-2',
            request_status: 'matched',
          })],
          error: null,
        }
      }
      if (name === 'get_ranked_async_matchmaking_status_v2') {
        return { data: [createRankedQueueStatusRow()], error: null }
      }
      if (name === 'finalize_ranked_async_matchmaking_game_v2') {
        return { data: [createRankedQueueFinalizationRow()], error: null }
      }
      return { data: null, error: { message: `Unexpected RPC ${name}` } }
    })
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    const claim = await repository.claimRankedQueuePair({ requestId: 'queue-request-1' })
    const status = await repository.getRankedQueueStatus('queue-request-1')
    const finalization = await repository.finalizeRankedQueueGame({
      game,
      idempotencyKey: 'phase27-ranked-v1:finalize:ranked-game-1',
      matchedGameId: 'ranked-game-1',
      requestId: 'queue-request-1',
    })

    expect(claim).toMatchObject({ matchedGameId: 'ranked-game-1', requestStatus: 'matched' })
    expect(status).toMatchObject({
      matchedGameId: 'ranked-game-1',
      playerOneUserId: 'user-1',
      playerTwoUserId: 'user-2',
      ratingBucket: 'multiplayer:og',
      viewerSeat: 'player-one',
    })
    expect(finalization).toMatchObject({ created: true, gameId: 'ranked-game-1', idempotent: false })
    expect(rpc).toHaveBeenCalledWith('claim_ranked_async_matchmaking_pair', {
      p_matched_game_id: null,
      p_request_id: 'queue-request-1',
    })
    expect(rpc).toHaveBeenCalledWith('get_ranked_async_matchmaking_status_v2', {
      p_request_id: 'queue-request-1',
    })
    expect(rpc).toHaveBeenCalledWith('finalize_ranked_async_matchmaking_game_v2', {
      p_game_projection: game,
      p_idempotency_key: 'phase27-ranked-v1:finalize:ranked-game-1',
      p_matched_game_id: 'ranked-game-1',
      p_request_id: 'queue-request-1',
    })
  })

  it('parses only canonical timed ranked queue status rows with matching buckets', async () => {
    const timedRpc = vi.fn(async () => ({
      data: [createRankedQueueStatusRow({
        mode: 'go',
        rating_bucket: 'async:go:timed:v1',
        time_limit_ms: 300_000,
      })],
      error: null,
    }))
    const timedRepository = createSupabaseMultiplayerRepository({
      client: { rpc: timedRpc } as unknown as BrrrdleSupabaseClient,
      userId: 'user-1',
    })

    await expect(timedRepository.getRankedQueueStatus('queue-request-1')).resolves.toMatchObject({
      mode: 'go',
      ratingBucket: 'multiplayer:go:timed:v1',
      timeLimitMs: 300_000,
    })

    for (const row of [
      createRankedQueueStatusRow({ rating_bucket: 'async:og:timed:v1', time_limit_ms: null }),
      createRankedQueueStatusRow({ rating_bucket: 'async:og', time_limit_ms: 300_000 }),
      createRankedQueueStatusRow({ rating_bucket: 'async:og:timed:v1', time_limit_ms: 30_000 }),
    ]) {
      const repository = createSupabaseMultiplayerRepository({
        client: { rpc: vi.fn(async () => ({ data: [row], error: null })) } as unknown as BrrrdleSupabaseClient,
        userId: 'user-1',
      })

      await expect(repository.getRankedQueueStatus('queue-request-1')).rejects.toThrow('Unable to parse ranked queue status result.')
    }
  })

  it('parses only fixed-settings ranked Daily queue status rows with matching date and buckets', async () => {
    const validRow = createRankedQueueStatusRow({
      daily_date_key: '2026-07-10',
      mode: 'go',
      rating_bucket: 'async:go:daily:v1',
      scope: 'daily',
      time_limit_ms: null,
      word_length: 5,
    })
    const repository = createSupabaseMultiplayerRepository({
      client: { rpc: vi.fn(async () => ({ data: [validRow], error: null })) } as unknown as BrrrdleSupabaseClient,
      userId: 'user-1',
    })

    await expect(repository.getRankedQueueStatus('queue-request-1')).resolves.toMatchObject({
      dailyDateKey: '2026-07-10',
      mode: 'go',
      ratingBucket: 'multiplayer:go:daily:v1',
      scope: 'daily',
      wordLength: 5,
    })

    for (const row of [
      createRankedQueueStatusRow({ daily_date_key: null, rating_bucket: 'async:og:daily:v1', scope: 'daily' }),
      createRankedQueueStatusRow({ daily_date_key: '2026-07-10', mode: null, rating_bucket: 'async:og:daily:v1', scope: 'daily' }),
      createRankedQueueStatusRow({ daily_date_key: '2026-07-10', rating_bucket: 'async:og', scope: 'daily' }),
      createRankedQueueStatusRow({ daily_date_key: '2026-07-10', rating_bucket: 'async:og:daily:v1', scope: 'daily', time_limit_ms: 300_000 }),
      createRankedQueueStatusRow({ daily_date_key: '2026-07-10', rating_bucket: 'async:og:daily:v1', scope: 'daily', word_length: 6 }),
    ]) {
      const invalidRepository = createSupabaseMultiplayerRepository({
        client: { rpc: vi.fn(async () => ({ data: [row], error: null })) } as unknown as BrrrdleSupabaseClient,
        userId: 'user-1',
      })
      await expect(invalidRepository.getRankedQueueStatus('queue-request-1')).rejects.toThrow('Unable to parse ranked queue status result.')
    }
  })

  it('rejects ranked queue RPC rows that contain raw projection fields', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        createRankedQueueStatusRow({
          projection: {
            serializedSession: { answer: 'crane' },
          },
        }),
      ],
      error: null,
    }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    await expect(repository.getRankedQueueStatus('queue-request-1')).rejects.toThrow('Unable to parse ranked queue status result.')
  })

  it('cancels ranked queue requests through the trusted RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{ request_id: 'queue-request-1', request_status: 'cancelled' }],
      error: null,
    }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    const cancellation = await repository.cancelRankedQueueRequest('queue-request-1')

    expect(rpc).toHaveBeenCalledWith('cancel_ranked_async_matchmaking_request', {
      p_request_id: 'queue-request-1',
    })
    expect(cancellation).toEqual({ requestId: 'queue-request-1', requestStatus: 'cancelled' })
  })

  it('normalizes Stage 31.3 Practice rematch RPC rows and stale request state', () => {
    const rows = normalizePracticeRematchRequestRows([
      createPracticeRematchRequestRow(),
      createPracticeRematchRequestRow({
        created: true,
        created_game_id: 'rematch-game-1',
        idempotent: true,
        request_id: 'rematch-request-2',
        request_status: 'created',
        responded_at: '2026-06-24T00:12:00.000Z',
        viewer_can_cancel: false,
        viewer_role: 'opponent',
      }),
      createPracticeRematchRequestRow({
        created: false,
        created_game_id: 'rematch-game-2',
        request_id: 'rematch-request-4',
        request_status: 'created',
        responded_at: '2026-06-24T00:13:00.000Z',
        viewer_can_cancel: false,
        viewer_role: 'requester',
      }),
      createPracticeRematchRequestRow({
        expires_at: '2026-06-23T23:59:00.000Z',
        request_id: 'rematch-request-3',
      }),
    ], new Date('2026-06-24T00:00:00.000Z'))

    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({
      created: false,
      expired: false,
      mode: 'og',
      requestId: 'rematch-request-1',
      requestStatus: 'requested',
      sourceGameId: 'source-game-1',
      viewerCanAccept: false,
      viewerCanCancel: true,
      viewerRole: 'requester',
      wordLength: 5,
    })
    expect(rows[1]).toMatchObject({
      created: true,
      createdGameId: 'rematch-game-1',
      idempotent: true,
      requestStatus: 'created',
      respondedAt: '2026-06-24T00:12:00.000Z',
    })
    expect(rows[2]).toMatchObject({
      created: true,
      createdGameId: 'rematch-game-2',
      requestStatus: 'created',
      respondedAt: '2026-06-24T00:13:00.000Z',
      viewerCanCancel: false,
    })
    expect(rows[3]).toMatchObject({
      expired: true,
      viewerCanAccept: false,
    })
  })

  it('rejects Practice rematch RPC rows that include private or unknown fields', () => {
    expect(normalizePracticeRematchRequestRows([
      createPracticeRematchRequestRow({ requester_user_id: 'raw-user-id' }),
      createPracticeRematchRequestRow({ projection: { serializedSession: { answer: 'crane' } } }),
      createPracticeRematchRequestRow({ unknown_field: 'surprise' }),
    ])).toEqual([])
  })

  it('requests, lists, cancels, declines, and accepts Practice rematches through Stage 31.3 RPCs', async () => {
    const acceptedGame = createMultiplayerGame({
      id: 'rematch-game-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      scope: 'practice',
      seed: 2,
      wordLength: 5,
    })
    const rpc = vi.fn(async (name: string) => {
      if (name === 'request_practice_multiplayer_rematch') {
        return { data: [createPracticeRematchRequestRow()], error: null }
      }
      if (name === 'get_practice_multiplayer_rematch_requests') {
        return { data: [createPracticeRematchRequestRow({ viewer_can_accept: true, viewer_can_cancel: false, viewer_role: 'opponent' })], error: null }
      }
      if (name === 'cancel_practice_multiplayer_rematch') {
        return { data: [createPracticeRematchRequestRow({ request_status: 'cancelled', viewer_can_cancel: false })], error: null }
      }
      if (name === 'decline_practice_multiplayer_rematch') {
        return { data: [createPracticeRematchRequestRow({ request_status: 'declined', viewer_can_accept: false, viewer_role: 'opponent' })], error: null }
      }
      if (name === 'accept_practice_multiplayer_rematch') {
        return {
          data: [createPracticeRematchRequestRow({
            created: true,
            created_game_id: 'rematch-game-1',
            idempotent: false,
            request_status: 'created',
            responded_at: '2026-06-24T00:15:00.000Z',
            viewer_can_accept: false,
            viewer_can_cancel: false,
            viewer_role: 'opponent',
          })],
          error: null,
        }
      }
      return { data: null, error: { message: `Unexpected RPC ${name}` } }
    })
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    const requested = await repository.requestPracticeRematch({
      expiresAt: '2026-06-24T00:20:00.000Z',
      idempotencyKey: 'phase31-rematch:request:source-game-1:user-1',
      sourceGameId: 'source-game-1',
    })
    const listed = await repository.listPracticeRematchRequests({ limit: 10, sourceGameId: 'source-game-1' })
    const cancelled = await repository.cancelPracticeRematch('rematch-request-1')
    const declined = await repository.declinePracticeRematch('rematch-request-1')
    const accepted = await repository.acceptPracticeRematch({
      game: acceptedGame,
      idempotencyKey: 'phase31-rematch:accept:rematch-request-1:rematch-game-1',
      requestId: 'rematch-request-1',
    })

    expect(requested.requestId).toBe('rematch-request-1')
    expect(listed[0]).toMatchObject({ viewerCanAccept: true, viewerRole: 'opponent' })
    expect(cancelled.requestStatus).toBe('cancelled')
    expect(declined.requestStatus).toBe('declined')
    expect(accepted).toMatchObject({
      created: true,
      createdGameId: 'rematch-game-1',
      requestStatus: 'created',
    })
    expect(rpc).toHaveBeenCalledWith('request_practice_multiplayer_rematch', {
      p_expires_at: '2026-06-24T00:20:00.000Z',
      p_idempotency_key: 'phase31-rematch:request:source-game-1:user-1',
      p_source_game_id: 'source-game-1',
    })
    expect(rpc).toHaveBeenCalledWith('get_practice_multiplayer_rematch_requests', {
      p_limit: 10,
      p_source_game_id: 'source-game-1',
    })
    expect(rpc).toHaveBeenCalledWith('accept_practice_multiplayer_rematch', {
      p_game_projection: acceptedGame,
      p_idempotency_key: 'phase31-rematch:accept:rematch-request-1:rematch-game-1',
      p_request_id: 'rematch-request-1',
    })
  })

  it('normalizes Phase 40 private match request rows and safe profile summaries', () => {
    const rows = normalizePrivateMatchRequestRows([
      createPrivateMatchRequestRow(),
      createPrivateMatchRequestRow({
        go_puzzle_count: 5,
        hard_mode: true,
        mode: 'go',
        request_id: 'private-request-go',
        time_limit_ms: 300_000,
        word_length: 7,
      }),
      createPrivateMatchRequestRow({
        created: true,
        created_game_id: 'private-game-1',
        idempotent: true,
        request_id: 'private-request-2',
        request_status: 'created',
        responded_at: '2026-07-01T23:50:00.000Z',
        viewer_can_accept: false,
        viewer_can_decline: false,
      }),
      createPrivateMatchRequestRow({
        expires_at: '2026-07-01T23:30:00.000Z',
        request_id: 'private-request-3',
      }),
    ], new Date('2026-07-01T23:40:00.000Z'))

    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({
      created: false,
      expired: false,
      mode: 'og',
      opponent: {
        displayName: 'Kiki',
        identityAvailable: true,
        publicProfileId: '22222222-2222-4222-8222-222222222222',
      },
      requestId: 'private-request-1',
      requester: {
        displayName: 'Claudine',
        identityAvailable: true,
        publicProfileId: '11111111-1111-4111-8111-111111111111',
      },
      requestStatus: 'requested',
      viewerCanAccept: true,
      viewerCanCancel: false,
      viewerCanDecline: true,
      viewerRole: 'opponent',
      wordLength: 5,
    })
    expect(rows[1]).toMatchObject({
      goPuzzleCount: 5,
      hardMode: true,
      mode: 'go',
      requestId: 'private-request-go',
      timeLimitMs: 300_000,
      wordLength: 7,
    })
    expect(rows[2]).toMatchObject({
      created: true,
      createdGameId: 'private-game-1',
      idempotent: true,
      requestStatus: 'created',
      respondedAt: '2026-07-01T23:50:00.000Z',
    })
    expect(rows[3]).toMatchObject({
      expired: true,
      viewerCanAccept: false,
      viewerCanCancel: false,
      viewerCanDecline: false,
    })
  })

  it('rejects Phase 40 private match rows that include private, projection, or unknown fields', () => {
    expect(normalizePrivateMatchRequestRows([
      createPrivateMatchRequestRow({ requester_user_id: 'raw-user-id' }),
      createPrivateMatchRequestRow({ projection: { serializedSession: { answer: 'crane' } } }),
      createPrivateMatchRequestRow({ playerUserIds: { 'player-one': 'raw-user-id' } }),
      createPrivateMatchRequestRow({ unknown_field: 'surprise' }),
    ])).toEqual([])
  })

  it('uses Phase 40 private match RPCs and omits playerUserIds from v2 accept payloads', async () => {
    const acceptedGame = createMultiplayerGame({
      id: 'private-game-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'requester-user', 'player-two': 'opponent-user' },
      scope: 'practice',
      seed: 40,
      wordLength: 5,
    })
    const rpc = vi.fn(async (name: string, params?: Record<string, unknown>) => {
        if (name === 'create_private_multiplayer_match_request_v2') {
        return {
          data: [createPrivateMatchRequestRow({
            go_puzzle_count: params?.p_mode === 'go' ? params.p_go_puzzle_count : null,
            hard_mode: params?.p_hard_mode,
            mode: params?.p_mode,
            time_limit_ms: params?.p_time_limit_ms,
            viewer_can_accept: false,
            viewer_can_cancel: true,
            viewer_can_decline: false,
            viewer_role: 'requester',
            word_length: params?.p_word_length,
          })],
          error: null,
        }
      }
      if (name === 'get_private_multiplayer_match_requests') {
        return { data: [createPrivateMatchRequestRow()], error: null }
      }
      if (name === 'cancel_private_multiplayer_match_request') {
        return { data: [createPrivateMatchRequestRow({ request_status: 'cancelled', viewer_can_cancel: false })], error: null }
      }
      if (name === 'decline_private_multiplayer_match_request') {
        return { data: [createPrivateMatchRequestRow({ request_status: 'declined', viewer_can_accept: false, viewer_can_decline: false })], error: null }
      }
      if (name === 'accept_private_multiplayer_match_request_v2') {
        return {
          data: [createPrivateMatchRequestRow({
            created: true,
            created_game_id: 'private-game-1',
            idempotent: false,
            request_status: 'created',
            responded_at: '2026-07-01T23:55:00.000Z',
            viewer_can_accept: false,
            viewer_can_decline: false,
          })],
          error: null,
        }
      }
      return { data: null, error: { message: `Unexpected RPC ${name}` } }
    })
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'opponent-user' })

    const requested = await repository.createPrivateMatchRequest({
      hardMode: false,
      idempotencyKey: 'phase40-private-request:create:test',
      mode: 'og',
      targetPublicProfileId: '22222222-2222-4222-8222-222222222222',
      timeLimitMs: null,
      wordLength: 5,
    })
    const goRequested = await repository.createPrivateMatchRequest({
      goPuzzleCount: 5,
      hardMode: true,
      idempotencyKey: 'phase52-private-request:create:test',
      mode: 'go',
      targetPublicProfileId: '22222222-2222-4222-8222-222222222222',
      timeLimitMs: 300_000,
      wordLength: 7,
    })
    const listed = await repository.listPrivateMatchRequests({ limit: 10 })
    const cancelled = await repository.cancelPrivateMatchRequest('private-request-1')
    const declined = await repository.declinePrivateMatchRequest('private-request-1')
    const accepted = await repository.acceptPrivateMatchRequest({
      game: acceptedGame,
      idempotencyKey: 'phase40-private-request:accept:v2:private-request-1:private-game-1',
      requestId: 'private-request-1',
    })

    expect(requested.viewerRole).toBe('requester')
    expect(goRequested).toMatchObject({
      goPuzzleCount: 5,
      hardMode: true,
      mode: 'go',
      timeLimitMs: 300_000,
      wordLength: 7,
    })
    expect(listed[0]).toMatchObject({ viewerCanAccept: true, viewerRole: 'opponent' })
    expect(cancelled.requestStatus).toBe('cancelled')
    expect(declined.requestStatus).toBe('declined')
    expect(accepted).toMatchObject({
      created: true,
      createdGameId: 'private-game-1',
      requestStatus: 'created',
    })
    expect(rpc).toHaveBeenCalledWith('create_private_multiplayer_match_request_v2', {
      p_expires_at: null,
      p_go_puzzle_count: null,
      p_hard_mode: false,
      p_idempotency_key: 'phase40-private-request:create:test',
      p_mode: 'og',
      p_target_public_profile_id: '22222222-2222-4222-8222-222222222222',
      p_time_limit_ms: null,
      p_word_length: 5,
    })
    expect(rpc).toHaveBeenCalledWith('create_private_multiplayer_match_request_v2', {
      p_expires_at: null,
      p_go_puzzle_count: 5,
      p_hard_mode: true,
      p_idempotency_key: 'phase52-private-request:create:test',
      p_mode: 'go',
      p_target_public_profile_id: '22222222-2222-4222-8222-222222222222',
      p_time_limit_ms: 300_000,
      p_word_length: 7,
    })
    expect(rpc).toHaveBeenCalledWith('get_private_multiplayer_match_requests', {
      p_limit: 10,
      p_status: null,
    })
    const acceptCall = rpc.mock.calls.find(([name]) => name === 'accept_private_multiplayer_match_request_v2')
    expect(acceptCall).toBeDefined()
    expect(acceptCall?.[1]).toMatchObject({
      p_idempotency_key: 'phase40-private-request:accept:v2:private-request-1:private-game-1',
      p_request_id: 'private-request-1',
    })
    expect((acceptCall?.[1] as { readonly p_game_projection?: Record<string, unknown> }).p_game_projection?.playerUserIds).toBeUndefined()
  })

  it('normalizes Stage 32.3 participant identity summary rows and rejects private fields', () => {
    expect(normalizeParticipantIdentitySummaryRows([
      createParticipantIdentitySummaryRow(),
      createParticipantIdentitySummaryRow({
        accent_color: null,
        avatar_url: null,
        display_name: null,
        flair_key: null,
        identity_available: false,
        is_viewer: true,
        public_profile_id: null,
        seat: 'player-one',
      }),
      createParticipantIdentitySummaryRow({ user_id: 'raw-auth-id' }),
      createParticipantIdentitySummaryRow({ email: 'private@example.test' }),
      createParticipantIdentitySummaryRow({ projection: { serializedSession: { answer: 'crane' } } }),
      createParticipantIdentitySummaryRow({ unknown_field: 'surprise' }),
    ])).toEqual([
      {
        accentColor: 'rose',
        avatarUrl: 'https://example.test/avatar.png',
        displayName: 'kiki',
        flairKey: 'spark',
        identityAvailable: true,
        isViewer: false,
        publicProfileId: '11111111-1111-4111-8111-111111111111',
        seat: 'player-two',
        updatedAt: '2026-06-24T23:50:00.000Z',
      },
      {
        identityAvailable: false,
        isViewer: true,
        seat: 'player-one',
      },
    ])
  })

  it('loads participant identity summaries through the Stage 32.3 RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [createParticipantIdentitySummaryRow()],
      error: null,
    }))
    const client = { rpc } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    const rows = await repository.getParticipantIdentitySummaries({ gameId: 'game-1' })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      displayName: 'kiki',
      identityAvailable: true,
      seat: 'player-two',
    })
    expect(rpc).toHaveBeenCalledWith('get_multiplayer_participant_identity_summaries', {
      p_game_id: 'game-1',
      p_ranked_request_id: null,
    })
  })

  it('throws for mutating Practice rematch RPC errors and unparsable results', async () => {
    const authErrorRpc = vi.fn(async () => ({ data: null, error: { message: 'Authentication required.' } }))
    const corruptRpc = vi.fn(async () => ({
      data: [createPracticeRematchRequestRow({ projection: { serializedSession: { answer: 'crane' } } })],
      error: null,
    }))

    await expect(
      createSupabaseMultiplayerRepository({
        client: { rpc: authErrorRpc } as unknown as BrrrdleSupabaseClient,
        userId: 'user-1',
      }).requestPracticeRematch({ sourceGameId: 'source-game-1' }),
    ).rejects.toThrow('Unable to request Practice rematch: Authentication required.')
    await expect(
      createSupabaseMultiplayerRepository({
        client: { rpc: corruptRpc } as unknown as BrrrdleSupabaseClient,
        userId: 'user-1',
      }).requestPracticeRematch({ sourceGameId: 'source-game-1' }),
    ).rejects.toThrow('Unable to parse Practice rematch request result.')
  })

  it('saves only the current user multiplayer games through the Supabase adapter', async () => {
    const inserts: Record<string, readonly unknown[]> = {}
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
    }
    const fromMock = vi.fn((table: string) => ({
      upsert: vi.fn(async (rows: readonly unknown[]) => {
        inserts[table] = rows
        return { error: null }
      }),
      select: vi.fn((columns: string) => {
        if (columns === 'id') {
          return {
            in: vi.fn(async () => ({ data: [], error: null })),
          }
        }
        if (columns === 'projection, updated_at') {
          return {
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          }
        }
        return {
          order: vi.fn(async () => ({ data: [], error: null })),
        }
      }),
      update: vi.fn((row: unknown) => ({
        match: vi.fn(async () => {
          inserts[`${table}:updated`] = [row]
          return { error: null }
        }),
      })),
    }))
    const client = {
      channel: vi.fn(() => channel),
      from: fromMock,
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-06-04T12:00:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const ownedGame = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1' },
      ranked: true,
      ratingBucket: 'multiplayer:og',
      scope: 'practice',
      wordLength: 5,
    })
    const visibleOtherGame = createMultiplayerGame({
      mode: 'go',
      playerUserIds: { 'player-one': 'other-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    await repository.save({ games: [visibleOtherGame, ownedGame] })

    expect(inserts.async_multiplayer_games).toHaveLength(1)
    expect((inserts.async_multiplayer_games[0] as { readonly id: string }).id).toBe(ownedGame.id)
    expect((inserts.async_multiplayer_games[0] as { readonly rating_bucket: string }).rating_bucket).toBe('async:og')
    expect((inserts.async_multiplayer_games[0] as { readonly projection: typeof ownedGame }).projection.ratingBucket).toBe('multiplayer:og')
    expect(new Set(fromMock.mock.calls.map(([table]) => table))).toEqual(new Set(['async_multiplayer_games']))
  })

  it('routes ranked Daily mutations through server authority instead of table updates', async () => {
    const serverProjection: { current?: unknown } = {}
    const rpc = vi.fn(async (name: string) => {
      if (name === 'save_ranked_daily_async_multiplayer_action') {
        return { data: [{ game_projection: serverProjection.current }], error: null }
      }
      return { data: null, error: { message: `Unexpected RPC ${name}` } }
    })
    const from = vi.fn(() => ({
      select: vi.fn(() => createFilteredReadQuery(async () => ({ data: [], error: null }))),
      update: vi.fn(() => ({ match: vi.fn(async () => ({ error: null })) })),
      upsert: vi.fn(async () => ({ error: null })),
    }))
    const game = createMultiplayerGame({
      dailyDateKey: '2026-07-10',
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      ratingBucket: 'multiplayer:og:daily:v1',
      scope: 'daily',
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    }).game!
    serverProjection.current = submitted
    const repository = createSupabaseMultiplayerRepository({
      client: { from, rpc } as unknown as BrrrdleSupabaseClient,
      userId: 'user-1',
    })

    await repository.save({ games: [game] })
    await repository.save({ games: [submitted] })

    expect(rpc).toHaveBeenCalledWith('save_ranked_daily_async_multiplayer_action', {
      p_action_id: submitted.moves[0].id,
      p_expected_move_count: 0,
      p_expected_version: 0,
      p_forfeit: false,
      p_game_id: submitted.id,
      p_guess: submitted.moves[0].guess,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('rehydrates answerless ranked Daily server projections from canonical date settings', async () => {
    const game = createMultiplayerGame({
      createdAt: '2026-07-10T12:00:00.000Z',
      dailyDateKey: '2026-07-10',
      matchmakingRequestId: 'phase55-ranked-daily-v1:finalize:game-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      ratingBucket: 'multiplayer:og:daily:v1',
      scope: 'daily',
      id: 'game-1',
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      now: '2026-07-10T12:01:00.000Z',
      playerId: 'player-one',
    }).game!
    const {
      playerSessions: omittedPlayerSessions,
      serializedSession: omittedSerializedSession,
      ...answerlessProjection
    } = submitted
    void omittedPlayerSessions
    void omittedSerializedSession
    const from = vi.fn(() => ({
      select: vi.fn(() => createFilteredReadQuery(async () => ({
          data: [{
            created_at: submitted.createdAt,
            projection: { ...answerlessProjection, authorityVersion: 1 },
            updated_at: submitted.updatedAt,
          }],
          error: null,
        }))),
    }))
    const repository = createSupabaseMultiplayerRepository({
      client: {
        from,
        rpc: vi.fn(async () => ({ data: '2026-07-10T12:01:00.000Z', error: null })),
      } as unknown as BrrrdleSupabaseClient,
      userId: 'user-1',
    })

    const snapshot = await repository.load()
    const restored = snapshot.state.games[0]

    expect(restored?.authorityVersion).toBe(1)
    expect(restored?.moves).toEqual(submitted.moves)
    expect(restored?.status).toBe('won')
    expect(getMultiplayerAnswerWords(restored!)).toEqual(getMultiplayerAnswerWords(game))
  })

  it('hydrates answerless ranked Daily GO with its persisted generation version', async () => {
    const game = createMultiplayerGame({
      createdAt: '2026-07-14T12:00:00.000Z',
      dailyDateKey: '2026-07-14',
      matchmakingRequestId: 'phase55-ranked-daily-v1:finalize:go-game-1',
      mode: 'go',
      playerUserIds: { 'player-one': 'user-1', 'player-two': 'user-2' },
      ranked: true,
      ratingBucket: 'multiplayer:go:daily:v1',
      scope: 'daily',
      id: 'go-game-1',
    })
    const {
      playerSessions: omittedPlayerSessions,
      serializedSession: omittedSerializedSession,
      ...answerlessProjection
    } = game
    void omittedPlayerSessions
    void omittedSerializedSession

    async function hydrate(answerGenerationVersion?: 'v1' | 'v2') {
      const from = vi.fn(() => ({
        select: vi.fn(() => createFilteredReadQuery(async () => ({
          data: [{
            created_at: game.createdAt,
            projection: { ...answerlessProjection, answerGenerationVersion },
            updated_at: game.updatedAt,
          }],
          error: null,
        }))),
      }))
      const repository = createSupabaseMultiplayerRepository({
        client: {
          from,
          rpc: vi.fn(async () => ({ data: '2026-07-14T12:01:00.000Z', error: null })),
        } as unknown as BrrrdleSupabaseClient,
        userId: 'user-1',
      })
      return (await repository.load()).state.games[0]
    }

    const legacy = await hydrate()
    const v2 = await hydrate('v2')

    expect(legacy?.answerGenerationVersion).toBe('v1')
    expect(legacy?.serializedSession.mode === 'go' ? legacy.serializedSession.session.answerGenerationVersion : undefined).toBe('v1')
    expect(v2?.answerGenerationVersion).toBe('v2')
    expect(v2?.serializedSession.mode === 'go' ? v2.serializedSession.session.answerGenerationVersion : undefined).toBe('v2')
  })

  it('saves canonical timed ranked games with the timed storage rating bucket', async () => {
    const inserts: Record<string, readonly unknown[]> = {}
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
    }
    const client = {
      channel: vi.fn(() => channel),
      from: vi.fn((table: string) => ({
        upsert: vi.fn(async (rows: readonly unknown[]) => {
          inserts[table] = rows
          return { error: null }
        }),
        select: vi.fn((columns: string) => {
          if (columns === 'id') {
            return {
              in: vi.fn(async () => ({ data: [], error: null })),
            }
          }
          if (columns === 'projection, updated_at') {
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            }
          }
          return createFilteredReadQuery(async () => ({ data: [], error: null }))
        }),
        update: vi.fn(() => ({
          match: vi.fn(async () => ({ error: null })),
        })),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-06-04T12:00:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const game = createMultiplayerGame({
      mode: 'go',
      playerUserIds: { 'player-one': 'user-1' },
      ranked: true,
      ratingBucket: 'multiplayer:go:timed:v1',
      scope: 'practice',
      timeLimitMs: 300_000,
      wordLength: 5,
    })
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    await repository.save({ games: [game] })

    expect(inserts.async_multiplayer_games).toHaveLength(1)
    expect((inserts.async_multiplayer_games[0] as { readonly rating_bucket: string }).rating_bucket).toBe('async:go:timed:v1')
    expect((inserts.async_multiplayer_games[0] as { readonly projection: typeof game }).projection.ratingBucket).toBe('multiplayer:go:timed:v1')
  })

  it('skips unchanged Supabase multiplayer rows on follow-up saves', async () => {
    const tables: Record<string, unknown[]> = { async_multiplayer_games: [] }
    const upsertBatches: unknown[][] = []
    const updatedRows: unknown[] = []
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(() => channel),
    }
    const client = {
      channel: vi.fn(() => channel),
      from: vi.fn((table: string) => ({
        upsert: vi.fn(async (rows: readonly { readonly id?: string }[]) => {
          upsertBatches.push([...rows])
          const existing = new Map((tables[table] ?? []).map((row) => [(row as { readonly id?: string }).id, row]))
          for (const row of rows) {
            if (!existing.has(row.id)) {
              existing.set(row.id, row)
            }
          }
          tables[table] = Array.from(existing.values())
          return { error: null }
        }),
        select: vi.fn((columns: string) => {
          if (columns === 'id') {
            return {
              in: vi.fn(async (_column: string, ids: readonly string[]) => ({
                data: (tables[table] ?? []).filter((row) => ids.includes(String((row as { readonly id?: string }).id))).map((row) => ({ id: (row as { readonly id?: string }).id })),
                error: null,
              })),
            }
          }
          if (columns === 'projection, updated_at') {
            return {
              eq: vi.fn((_column: string, id: string) => ({
                maybeSingle: vi.fn(async () => ({
                  data: (tables[table] ?? []).find((row) => (row as { readonly id?: string }).id === id) ?? null,
                  error: null,
                })),
              })),
            }
          }
          return createFilteredReadQuery(async () => ({ data: tables[table] ?? [], error: null }))
        }),
        update: vi.fn((row: { readonly id?: string }) => ({
          match: vi.fn(async ({ id, updated_at: updatedAt }: { readonly id: string, readonly updated_at: string }) => {
            updatedRows.push(row)
            tables[table] = (tables[table] ?? []).map((entry) => {
              const stored = entry as { readonly id?: string, readonly updated_at?: string }
              return stored.id === id && stored.updated_at === updatedAt ? row : entry
            })
            return { error: null }
          }),
        })),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-06-04T12:00:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const gameA = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1' },
      scope: 'practice',
      wordLength: 5,
    })
    const gameB = createMultiplayerGame({
      mode: 'go',
      playerUserIds: { 'player-one': 'user-1' },
      scope: 'practice',
      wordLength: 5,
    })
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'user-1' })

    await repository.save({ games: [gameA, gameB] })
    await repository.save({ games: [{ ...gameA, updatedAt: '2026-06-04T12:00:05.000Z' }, gameB] })

    expect(upsertBatches[0]).toHaveLength(2)
    expect(updatedRows).toHaveLength(1)
    expect((updatedRows[0] as { readonly id: string }).id).toBe(gameA.id)
  })

  it('persists multiplayer turns across two Supabase-backed repository clients', async () => {
    const tables: Record<string, unknown[]> = { async_multiplayer_games: [] }
    const createChannel = () => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
      }
      return channel
    }
    const createClient = () => ({
      channel: vi.fn(createChannel),
      from: vi.fn((table: string) => ({
        upsert: vi.fn(async (rows: readonly { readonly id?: string }[]) => {
          const existing = new Map((tables[table] ?? []).map((row) => [(row as { readonly id?: string }).id, row]))
          for (const row of rows) {
            if (!existing.has(row.id)) {
              existing.set(row.id, row)
            }
          }
          tables[table] = Array.from(existing.values())
          return { error: null }
        }),
        select: vi.fn((columns: string) => {
          if (columns === 'id') {
            return {
              in: vi.fn(async (_column: string, ids: readonly string[]) => ({
                data: (tables[table] ?? []).filter((row) => ids.includes(String((row as { readonly id?: string }).id))).map((row) => ({ id: (row as { readonly id?: string }).id })),
                error: null,
              })),
            }
          }
          if (columns === 'projection, updated_at') {
            return {
              eq: vi.fn((_column: string, id: string) => ({
                maybeSingle: vi.fn(async () => ({
                  data: (tables[table] ?? []).find((row) => (row as { readonly id?: string }).id === id) ?? null,
                  error: null,
                })),
              })),
            }
          }
          return createFilteredReadQuery(async () => ({ data: tables[table] ?? [], error: null }))
        }),
        update: vi.fn((row: { readonly id?: string }) => ({
          match: vi.fn(async ({ id, updated_at: updatedAt }: { readonly id: string, readonly updated_at: string }) => {
            tables[table] = (tables[table] ?? []).map((entry) => {
              const stored = entry as { readonly id?: string, readonly updated_at?: string }
              return stored.id === id && stored.updated_at === updatedAt ? row : entry
            })
            return { error: null }
          }),
        })),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-06-04T12:00:00.000Z', error: null })),
    }) as unknown as BrrrdleSupabaseClient
    const hostRepository = createSupabaseMultiplayerRepository({ client: createClient(), userId: 'host-user' })
    const rivalRepository = createSupabaseMultiplayerRepository({ client: createClient(), userId: 'rival-user' })
    const game = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      wordLength: 5,
    })

    await hostRepository.save({ games: [game] })
    const rivalLoaded = await rivalRepository.load()
    const joined = joinMultiplayerGame(rivalLoaded.state, { gameId: game.id, userId: 'rival-user' })
    await rivalRepository.save(joined.state)
    const hostLoaded = await hostRepository.load()
    const submitted = submitMultiplayerGuess(hostLoaded.state, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    })
    await hostRepository.save(submitted.state)
    const rivalReloaded = await rivalRepository.load()

    expect(rivalLoaded.state.games[0].status).toBe('waiting')
    expect(hostLoaded.state.games[0].playerUserIds?.['player-two']).toBe('rival-user')
    expect(rivalReloaded.state.games[0].moves).toHaveLength(1)
    expect(rivalReloaded.state.games[0].moves[0].playerId).toBe('player-one')
  })

  it('does not let a stale creator cancellation overwrite a newer rival join', async () => {
    const tables: Record<string, unknown[]> = { async_multiplayer_games: [] }
    const createChannel = () => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
      }
      return channel
    }
    const createClient = () => ({
      channel: vi.fn(createChannel),
      from: vi.fn((table: string) => ({
        upsert: vi.fn(async (rows: readonly { readonly id?: string }[]) => {
          const existing = new Map((tables[table] ?? []).map((row) => [(row as { readonly id?: string }).id, row]))
          for (const row of rows) {
            if (!existing.has(row.id)) {
              existing.set(row.id, row)
            }
          }
          tables[table] = Array.from(existing.values())
          return { error: null }
        }),
        select: vi.fn((columns: string) => {
          if (columns === 'id') {
            return {
              in: vi.fn(async (_column: string, ids: readonly string[]) => ({
                data: (tables[table] ?? []).filter((row) => ids.includes(String((row as { readonly id?: string }).id))).map((row) => ({ id: (row as { readonly id?: string }).id })),
                error: null,
              })),
            }
          }
          if (columns === 'projection, updated_at') {
            return {
              eq: vi.fn((_column: string, id: string) => ({
                maybeSingle: vi.fn(async () => ({
                  data: (tables[table] ?? []).find((row) => (row as { readonly id?: string }).id === id) ?? null,
                  error: null,
                })),
              })),
            }
          }
          return createFilteredReadQuery(async () => ({ data: tables[table] ?? [], error: null }))
        }),
        update: vi.fn((row: { readonly id?: string }) => ({
          match: vi.fn(async ({ id, updated_at: updatedAt }: { readonly id: string, readonly updated_at: string }) => {
            tables[table] = (tables[table] ?? []).map((entry) => {
              const stored = entry as { readonly id?: string, readonly updated_at?: string }
              return stored.id === id && stored.updated_at === updatedAt ? row : entry
            })
            return { error: null }
          }),
        })),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-06-04T12:00:00.000Z', error: null })),
    }) as unknown as BrrrdleSupabaseClient
    const hostRepository = createSupabaseMultiplayerRepository({ client: createClient(), userId: 'host-user' })
    const rivalRepository = createSupabaseMultiplayerRepository({ client: createClient(), userId: 'rival-user' })
    const game = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      wordLength: 5,
    })

    await hostRepository.save({ games: [game] })
    const rivalLoaded = await rivalRepository.load()
    const joined = joinMultiplayerGame(rivalLoaded.state, { gameId: game.id, userId: 'rival-user' })
    await rivalRepository.save(joined.state)
    const staleCancel = cancelMultiplayerGame({ games: [game] }, { gameId: game.id, userId: 'host-user' })
    await hostRepository.save(staleCancel.state)
    const reloaded = await rivalRepository.load()

    expect(reloaded.state.games[0].status).toBe('playing')
    expect(reloaded.state.games[0].playerUserIds?.['player-two']).toBe('rival-user')
  })

  it('guards ordinary multiplayer updates with the durable updated-at value observed before writing', async () => {
    const waitingGame = createMultiplayerGame({
      createdAt: '2026-07-10T22:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const game = joinMultiplayerGame({ games: [waitingGame] }, {
      gameId: waitingGame.id,
      userId: 'rival-user',
    }).game!
    const storedRow = { id: game.id, projection: game, updated_at: game.updatedAt }
    const match = vi.fn(async () => ({ error: null }))
    const client = {
      channel: vi.fn(() => {
        const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
        return channel
      }),
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          if (columns === 'id') return { in: vi.fn(async () => ({ data: [{ id: game.id }], error: null })) }
          if (columns === 'projection, updated_at') return { eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: storedRow, error: null })) })) }
          return createFilteredReadQuery(async () => ({ data: [storedRow], error: null }))
        }),
        update: vi.fn(() => ({ match })),
        upsert: vi.fn(async () => ({ error: null })),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-07-10T22:00:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'host-user' })
    const loaded = await repository.load()
    const submitted = submitMultiplayerGuess(loaded.state, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    })

    await repository.save(submitted.state)

    expect(match).toHaveBeenCalledWith({ id: game.id, updated_at: storedRow.updated_at })
  })

  it('re-reads and retries an owned forfeit once when the first ordinary update affects zero rows', async () => {
    const waitingGame = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const joinedGame = joinMultiplayerGame({ games: [waitingGame] }, {
      gameId: waitingGame.id,
      now: '2026-06-04T12:01:00.000Z',
      userId: 'rival-user',
    }).game!
    const legacyGame: MultiplayerGame = {
      ...joinedGame,
      moves: [{
        createdAt: '2026-06-04T12:02:00.000Z',
        guess: 'ROBOT',
        id: 'legacy-move-1',
        playerId: 'player-one' as const,
        puzzleIndex: 0,
        tiles: [
          { letter: 'R', state: 'absent' as const },
          { letter: 'O', state: 'present' as const },
          { letter: 'B', state: 'absent' as const },
          { letter: 'O', state: 'correct' as const },
          { letter: 'T', state: 'correct' as const },
        ],
      }],
      updatedAt: '2026-06-04T12:02:00.000Z',
    }
    let durableRow = {
      id: legacyGame.id,
      projection: legacyGame,
      updated_at: legacyGame.updatedAt,
    }
    const match = vi.fn(async () => {
      if (match.mock.calls.length === 1) {
        return { count: 0, error: null }
      }
      const forfeited = forfeitMultiplayerGame({ games: [legacyGame] }, {
        gameId: legacyGame.id,
        now: '2026-06-04T12:03:00.000Z',
        playerId: 'player-two',
      }).game!
      durableRow = { id: forfeited.id, projection: forfeited, updated_at: forfeited.updatedAt }
      return { count: 1, error: null }
    })
    const client = {
      channel: vi.fn(() => {
        const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
        return channel
      }),
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          if (columns === 'id') return { in: vi.fn(async () => ({ data: [{ id: legacyGame.id }], error: null })) }
          if (columns === 'projection, updated_at') return { eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: durableRow, error: null })) })) }
          return createFilteredReadQuery(async () => ({ data: [durableRow], error: null }))
        }),
        update: vi.fn(() => ({ match })),
        upsert: vi.fn(async () => ({ error: null })),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-06-04T12:02:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'rival-user' })
    const loaded = await repository.load()
    const forfeited = forfeitMultiplayerGame(loaded.state, {
      gameId: legacyGame.id,
      now: '2026-06-04T12:03:00.000Z',
      playerId: 'player-two',
    })

    const saved = await repository.save(forfeited.state)

    expect(match).toHaveBeenCalledTimes(2)
    expect(saved.state.games[0]).toMatchObject({
      forfeitedPlayerId: 'player-two',
      status: 'lost',
      winnerId: 'player-one',
    })
  })

  it('rejects an owned forfeit when both acknowledgment attempts affect zero rows', async () => {
    const waitingGame = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'go',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const playingGame = joinMultiplayerGame({ games: [waitingGame] }, {
      gameId: waitingGame.id,
      now: '2026-06-04T12:01:00.000Z',
      userId: 'rival-user',
    }).game!
    const storedRow = { id: playingGame.id, projection: playingGame, updated_at: playingGame.updatedAt }
    const match = vi.fn(async () => ({ count: 0, error: null }))
    const client = {
      channel: vi.fn(() => {
        const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) }
        return channel
      }),
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          if (columns === 'id') return { in: vi.fn(async () => ({ data: [{ id: playingGame.id }], error: null })) }
          if (columns === 'projection, updated_at') return { eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: storedRow, error: null })) })) }
          return createFilteredReadQuery(async () => ({ data: [storedRow], error: null }))
        }),
        update: vi.fn(() => ({ match })),
        upsert: vi.fn(async () => ({ error: null })),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-06-04T12:01:00.000Z', error: null })),
    } as unknown as BrrrdleSupabaseClient
    const repository = createSupabaseMultiplayerRepository({ client, userId: 'host-user' })
    const loaded = await repository.load()
    const cancelled = forfeitMultiplayerGame(loaded.state, {
      gameId: playingGame.id,
      now: '2026-06-04T12:02:00.000Z',
      playerId: 'player-one',
    })

    await expect(repository.save(cancelled.state)).rejects.toThrow('Unable to confirm multiplayer forfeit')
    expect(match).toHaveBeenCalledTimes(2)
  })

  it('does not let a stale timed timeout overwrite a newer submitted turn', async () => {
    const tables: Record<string, unknown[]> = { async_multiplayer_games: [] }
    const createChannel = () => {
      const channel = {
        on: vi.fn(() => channel),
        subscribe: vi.fn(() => channel),
      }
      return channel
    }
    const createClient = () => ({
      channel: vi.fn(createChannel),
      from: vi.fn((table: string) => ({
        upsert: vi.fn(async (rows: readonly { readonly id?: string }[]) => {
          const existing = new Map((tables[table] ?? []).map((row) => [(row as { readonly id?: string }).id, row]))
          for (const row of rows) {
            if (!existing.has(row.id)) {
              existing.set(row.id, row)
            }
          }
          tables[table] = Array.from(existing.values())
          return { error: null }
        }),
        select: vi.fn((columns: string) => {
          if (columns === 'id') {
            return {
              in: vi.fn(async (_column: string, ids: readonly string[]) => ({
                data: (tables[table] ?? []).filter((row) => ids.includes(String((row as { readonly id?: string }).id))).map((row) => ({ id: (row as { readonly id?: string }).id })),
                error: null,
              })),
            }
          }
          if (columns === 'projection, updated_at') {
            return {
              eq: vi.fn((_column: string, id: string) => ({
                maybeSingle: vi.fn(async () => ({
                  data: (tables[table] ?? []).find((row) => (row as { readonly id?: string }).id === id) ?? null,
                  error: null,
                })),
              })),
            }
          }
          return createFilteredReadQuery(async () => ({ data: tables[table] ?? [], error: null }))
        }),
        update: vi.fn((row: { readonly id?: string }) => ({
          match: vi.fn(async ({ id, updated_at: updatedAt }: { readonly id: string, readonly updated_at: string }) => {
            tables[table] = (tables[table] ?? []).map((entry) => {
              const stored = entry as { readonly id?: string, readonly updated_at?: string }
              return stored.id === id && stored.updated_at === updatedAt ? row : entry
            })
            return { error: null }
          }),
        })),
      })),
      removeChannel: vi.fn(async () => ({ error: null })),
      rpc: vi.fn(async () => ({ data: '2026-06-04T12:00:00.000Z', error: null })),
    }) as unknown as BrrrdleSupabaseClient
    const hostRepository = createSupabaseMultiplayerRepository({ client: createClient(), userId: 'host-user' })
    const rivalRepository = createSupabaseMultiplayerRepository({ client: createClient(), userId: 'rival-user' })
    const game = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      timeLimitMs: 30_000,
      wordLength: 5,
    })

    await hostRepository.save({ games: [game] })
    const rivalLoaded = await rivalRepository.load()
    const joined = joinMultiplayerGame(rivalLoaded.state, {
      gameId: game.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })
    await rivalRepository.save(joined.state)
    const hostLoaded = await hostRepository.load()
    const submitted = submitMultiplayerGuess(hostLoaded.state, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      now: '2026-06-04T12:00:05.000Z',
      playerId: 'player-one',
    })
    await hostRepository.save(submitted.state)
    const staleTimeout = expireTimedOutPracticeMultiplayerGames(joined.state, new Date('2026-06-04T12:00:31.000Z'))
    await rivalRepository.save(staleTimeout)
    const hostReloaded = await hostRepository.load()

    expect(hostReloaded.state.games[0].moves).toHaveLength(1)
    expect(hostReloaded.state.games[0].moves[0].playerId).toBe('player-one')
    expect(hostReloaded.state.games[0].timedOutPlayerId).toBeUndefined()
  })
})
