import { describe, expect, it, vi } from 'vitest';
import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';
import {
  CombatPreviewConflictError,
  CombatPreviewRepository,
} from '../../src/services/combat-preview-repository';

const playerOne = '00000000-0000-4000-8000-000000000101';
const playerTwo = '00000000-0000-4000-8000-000000000202';
const createdAt = '2026-07-22T12:00:00.000Z';
const previousAt = '2026-07-22T12:01:00.000Z';
const nextAt = '2026-07-22T12:02:00.000Z';

function cooperativeProjection(updatedAt = nextAt) {
  return {
    id: 'practice-1',
    scope: 'practice',
    mode: 'og',
    ranked: false,
    ratingBucket: null,
    wordLength: 5,
    difficulty: 'medium',
    hardMode: false,
    timeLimitMs: null,
    customGameCode: null,
    dailyDateKey: null,
    goPuzzleCount: null,
    playerUserIds: { 'player-one': playerOne, 'player-two': playerTwo },
    matchmakingRequestId: null,
    status: 'playing',
    currentTurn: 'player-two',
    moves: [
      {
        id: 'move-1',
        createdAt: updatedAt,
        guess: 'crane',
        playerId: 'player-one',
        puzzleIndex: 0,
        tiles: [
          { letter: 'c', state: 'absent' },
          { letter: 'r', state: 'present' },
          { letter: 'a', state: 'absent' },
          { letter: 'n', state: 'correct' },
          { letter: 'e', state: 'correct' },
        ],
      },
    ],
    createdAt,
    updatedAt,
    deadlineAt: null,
  };
}

function returnedRow(projection = cooperativeProjection()) {
  return {
    id: projection.id,
    scope: projection.scope,
    mode: projection.mode,
    daily_date_key: projection.dailyDateKey,
    status: projection.status,
    current_turn: projection.currentTurn,
    word_length: projection.wordLength,
    difficulty: projection.difficulty,
    go_puzzle_count: projection.goPuzzleCount,
    ranked: projection.ranked,
    rating_bucket: projection.ratingBucket,
    custom_game_code: projection.customGameCode,
    deadline_at: projection.deadlineAt,
    ended_at: null,
    winner_player_id: null,
    created_at: projection.createdAt,
    updated_at: projection.updatedAt,
    projection,
  };
}

function updateClient(data: ReturnType<typeof returnedRow> | null) {
  const conditions: Array<[string, unknown]> = [];
  const maybeSingle = vi.fn(async () => ({ data, error: null }));
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      conditions.push([column, value]);
      return query;
    }),
    select: vi.fn(() => query),
    maybeSingle,
  };
  const update = vi.fn(() => query);
  const from = vi.fn(() => ({ update }));
  return {
    client: { from } as unknown as AmordleSupabaseClient,
    conditions,
    from,
    update,
  };
}

describe('COMBAT preview repository', () => {
  it('uses all existing optimistic-concurrency columns for cooperative Practice updates', async () => {
    const fixture = updateClient(returnedRow());
    const result = await new CombatPreviewRepository(fixture.client).updateCooperativeProjection({
      gameId: 'practice-1',
      viewerUserId: playerOne,
      expectedUpdatedAt: previousAt,
      expectedCurrentTurn: 'player-one',
      expectedStatus: 'playing',
      nextUpdatedAt: nextAt,
      projection: cooperativeProjection(),
    });

    expect(result).toMatchObject({
      id: 'practice-1',
      kind: 'participant',
      updatedAt: nextAt,
      currentTurn: 'player-two',
    });
    expect(fixture.conditions).toEqual([
      ['id', 'practice-1'],
      ['scope', 'practice'],
      ['ranked', false],
      ['updated_at', previousAt],
      ['current_turn', 'player-one'],
      ['status', 'playing'],
    ]);
    expect(fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'playing',
        current_turn: 'player-two',
        updated_at: nextAt,
      }),
    );
  });

  it('reports a retryable conflict when a conditional update matches no row', async () => {
    const fixture = updateClient(null);
    await expect(
      new CombatPreviewRepository(fixture.client).updateCooperativeProjection({
        gameId: 'practice-1',
        viewerUserId: playerOne,
        expectedUpdatedAt: previousAt,
        expectedCurrentTurn: 'player-one',
        expectedStatus: 'playing',
        nextUpdatedAt: nextAt,
        projection: cooperativeProjection(),
      }),
    ).rejects.toBeInstanceOf(CombatPreviewConflictError);
  });

  it('recovers a projection when table and JSON timestamps describe the same instant', async () => {
    const row = {
      ...returnedRow(),
      updated_at: '2026-07-22T12:02:00+00:00',
      created_at: '2026-07-22T12:00:00+00:00',
    };
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(
      new CombatPreviewRepository({
        from,
      } as unknown as AmordleSupabaseClient).loadProjection('practice-1', playerOne),
    ).resolves.toMatchObject({
      id: 'practice-1',
      updatedAt: nextAt,
    });
  });

  it('rejects ranked Practice mutations before opening a table request', async () => {
    const from = vi.fn();
    const rankedPractice = {
      ...cooperativeProjection(),
      ranked: true,
      ratingBucket: 'multiplayer:og',
    };
    await expect(
      new CombatPreviewRepository({
        from,
      } as unknown as AmordleSupabaseClient).updateCooperativeProjection({
        gameId: 'practice-1',
        viewerUserId: playerOne,
        expectedUpdatedAt: previousAt,
        expectedCurrentTurn: 'player-one',
        expectedStatus: 'playing',
        nextUpdatedAt: nextAt,
        projection: rankedPractice,
      }),
    ).rejects.toMatchObject({ failure: { code: 'validation' } });
    expect(from).not.toHaveBeenCalled();
  });

  it('loads Ranked Daily queue status through the existing owner-scoped RPC and sanitizes UUIDs', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          request_id: 'queue-1',
          request_status: 'matched',
          matched_game_id: 'daily-1',
          opponent_request_id: 'queue-2',
          viewer_seat: 'player-one',
          player_one_user_id: playerOne,
          player_two_user_id: playerTwo,
          mode: 'go',
          scope: 'daily',
          daily_date_key: '2026-07-22',
          rating_bucket: 'async:go:daily:v1',
          word_length: 5,
          hard_mode: true,
          time_limit_ms: null,
          queued_at: createdAt,
          matched_at: previousAt,
        },
      ],
      error: null,
    }));
    const result = await new CombatPreviewRepository({
      rpc,
    } as unknown as AmordleSupabaseClient).loadRankedDailyQueue('queue-1');

    expect(rpc).toHaveBeenCalledWith('get_ranked_async_matchmaking_status_v2', {
      p_request_id: 'queue-1',
    });
    expect(result).toMatchObject({
      mode: 'go',
      wordLength: 5,
      ratingBucket: 'multiplayer:go:daily:v1',
    });
    expect(JSON.stringify(result)).not.toContain(playerOne);
    expect(JSON.stringify(result)).not.toContain(playerTwo);
  });

  it('maps authoritative Ranked Daily stale writes to retryable conflicts', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: '40001', message: 'stale expected version' },
    }));
    await expect(
      new CombatPreviewRepository({
        rpc,
      } as unknown as AmordleSupabaseClient).saveRankedDailyAction({
        gameId: 'daily-1',
        viewerUserId: playerOne,
        actionId: 'action-1',
        expectedVersion: 2,
        expectedMoveCount: 1,
        guess: 'crane',
      }),
    ).rejects.toMatchObject({ failure: { code: 'conflict', retryable: true } });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
