import { describe, expect, it, vi } from 'vitest';

import {
  buildCooperativePracticeProjection,
  buildWaitingPracticeProjection,
  parsePracticeTransportProjection,
  PracticeCombatTransportRepository,
} from '../../src/services/practice-combat-transport';
import { createPracticeCombatPreview } from '../../src/domain/practice-combat-preview';
import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';

const hostId = '00000000-0000-4000-8000-000000000101';
const joinerId = '00000000-0000-4000-8000-000000000202';
const outsiderId = '00000000-0000-4000-8000-000000000303';
const now = '2026-07-23T12:00:00.000Z';
const config = {
  mode: 'go' as const,
  wordLength: 2,
  difficulty: 'expert' as const,
  hardMode: true,
  puzzleCount: 5 as const,
  timeLimitMs: null,
};

describe('Practice COMBAT transport boundary', () => {
  it('keeps public waiting lobbies answerless and join-capable only for another account', () => {
    const raw = buildWaitingPracticeProjection({
      id: 'practice-1',
      hostUserId: hostId,
      config,
      now,
    });
    expect(JSON.stringify(raw)).not.toMatch(/answer|state|seed/i);
    expect(parsePracticeTransportProjection(raw, hostId)).toMatchObject({
      kind: 'waiting',
      viewerSeat: 'player-one',
      capabilities: { canCancel: true, canJoin: false },
    });
    expect(parsePracticeTransportProjection(raw, joinerId)).toMatchObject({
      kind: 'waiting',
      viewerSeat: null,
      capabilities: { canCancel: false, canJoin: true },
    });
  });

  it('keeps answer-bearing cooperative state participant-only and strips raw auth ids', () => {
    const state = createPracticeCombatPreview({
      id: 'practice-1',
      config,
      players: [{ displayName: 'Player One' }, { displayName: 'Player Two' }],
      answers: ['aa', 'ab', 'ac', 'ad', 'ae'],
      now,
    });
    const raw = buildCooperativePracticeProjection({
      sourceKind: 'public-lobby',
      playerOneUserId: hostId,
      playerTwoUserId: joinerId,
      wordRevision: 'test-revision',
      state,
    });

    const accepted = parsePracticeTransportProjection(raw, hostId);
    expect(accepted).toMatchObject({
      kind: 'cooperative-participant',
      viewerSeat: 'player-one',
      wordRevision: 'test-revision',
    });
    expect(JSON.stringify(accepted)).not.toContain(hostId);
    expect(JSON.stringify(accepted)).not.toContain(joinerId);
    expect(() => parsePracticeTransportProjection(raw, outsiderId)).toThrow(/participant-only/i);
  });

  it('rejects unknown projection fields instead of passing them into React', () => {
    const raw = buildWaitingPracticeProjection({
      id: 'practice-1',
      hostUserId: hostId,
      config,
      now,
    });
    expect(() =>
      parsePracticeTransportProjection({ ...raw, email: 'private@example.com' }, joinerId),
    ).toThrow();
  });

  it('rejects table/projection contradictions at construction time', () => {
    const state = createPracticeCombatPreview({
      id: 'practice-1',
      config,
      players: [{ displayName: 'Player One' }, { displayName: 'Player Two' }],
      answers: ['aa', 'ab', 'ac', 'ad', 'ae'],
      now,
    });
    const raw = buildCooperativePracticeProjection({
      sourceKind: 'public-lobby',
      playerOneUserId: hostId,
      playerTwoUserId: joinerId,
      wordRevision: 'test-revision',
      state,
    });
    expect(() => parsePracticeTransportProjection({ ...raw, wordLength: 3 }, hostId)).toThrow(
      /disagree/i,
    );
  });

  it('builds a shell-compatible ranked projection without exposing ids in the mapped view', () => {
    const state = createPracticeCombatPreview({
      id: 'ranked-practice-1',
      config: { ...config, mode: 'og', puzzleCount: 1, timeLimitMs: 300_000 },
      players: [{ displayName: 'Player One' }, { displayName: 'Player Two' }],
      answers: ['aa'],
      now,
    });
    const raw = buildCooperativePracticeProjection({
      sourceKind: 'ranked-queue',
      playerOneUserId: hostId,
      playerTwoUserId: joinerId,
      wordRevision: 'test-revision',
      state,
      ranked: true,
      ratingBucket: 'multiplayer:og:timed:v1',
      matchmakingRequestId: 'ranked-queue-1',
    });
    expect(raw).toMatchObject({
      ranked: true,
      ratingBucket: 'multiplayer:og:timed:v1',
      timeRemainingMs: { 'player-one': 300_000, 'player-two': 300_000 },
      turnStartedAt: now,
    });
    const mapped = parsePracticeTransportProjection(raw, hostId);
    expect(mapped).toMatchObject({
      ranked: true,
      ratingBucket: 'multiplayer:og:timed:v1',
      matchmakingRequestId: 'ranked-queue-1',
    });
    expect(JSON.stringify(mapped)).not.toContain(hostId);
    expect(JSON.stringify(mapped)).not.toContain(joinerId);
  });

  it('keeps unranked Daily fixed to its UTC five-letter lane', () => {
    const waiting = buildWaitingPracticeProjection({
      id: 'daily-1',
      hostUserId: hostId,
      config: {
        mode: 'go',
        wordLength: 5,
        difficulty: 'expert',
        hardMode: false,
        puzzleCount: 5,
        timeLimitMs: null,
      },
      now,
      scope: 'daily',
      dailyDateKey: '2026-07-23',
    });
    expect(parsePracticeTransportProjection(waiting, joinerId)).toMatchObject({
      kind: 'waiting',
      scope: 'daily',
      dailyDateKey: '2026-07-23',
      sourceKind: 'daily-lobby',
      wordLength: 5,
      ranked: false,
    });
    expect(() =>
      buildWaitingPracticeProjection({
        id: 'daily-invalid',
        hostUserId: hostId,
        config,
        now,
        scope: 'daily',
        dailyDateKey: '2026-07-23',
      }),
    ).toThrow(/scope metadata/i);
  });

  it('accepts equivalent PostgreSQL and JSON timestamp representations after lobby insert', async () => {
    const projection = buildWaitingPracticeProjection({
      id: 'practice-offset-1',
      hostUserId: hostId,
      config,
      now,
    });
    const row = {
      id: projection.id,
      scope: 'practice',
      mode: projection.mode,
      daily_date_key: null,
      status: projection.status,
      current_turn: projection.currentTurn,
      word_length: projection.wordLength,
      difficulty: projection.difficulty,
      go_puzzle_count: projection.goPuzzleCount,
      ranked: false,
      deadline_at: null,
      ended_at: null,
      winner_player_id: null,
      created_at: '2026-07-23T12:00:00+00:00',
      updated_at: '2026-07-23T12:00:00+00:00',
      projection,
    };
    const readMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const readEq = vi.fn(() => ({ maybeSingle: readMaybeSingle }));
    const readSelect = vi.fn(() => ({ eq: readEq }));
    const insertSingle = vi.fn(async () => ({ data: row, error: null }));
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    const from = vi.fn(() => ({ select: readSelect, insert }));

    const result = await new PracticeCombatTransportRepository({
      from,
    } as unknown as AmordleSupabaseClient).createPublicLobby({
      id: projection.id,
      hostUserId: hostId,
      config,
      now,
    });

    expect(result).toMatchObject({
      id: projection.id,
      kind: 'waiting',
      updatedAt: now,
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('reconciles the trusted RPC timestamp for a pristine private-request game', async () => {
    const state = createPracticeCombatPreview({
      id: 'private-practice-1',
      config,
      players: [{ displayName: 'Player One' }, { displayName: 'Player Two' }],
      answers: ['aa', 'ab', 'ac', 'ad', 'ae'],
      now,
    });
    const projection = buildCooperativePracticeProjection({
      sourceKind: 'private-request',
      playerOneUserId: hostId,
      playerTwoUserId: joinerId,
      wordRevision: 'test-revision',
      state,
    });
    const acceptedAt = '2026-07-23T12:00:01.00035+00:00';
    const canonicalAcceptedAt = '2026-07-23T12:00:01.00035Z';
    const row = {
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
      deadline_at: projection.deadlineAt,
      ended_at: projection.endedAt,
      winner_player_id: projection.winnerId,
      created_at: acceptedAt,
      updated_at: acceptedAt,
      projection,
    };
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const result = await new PracticeCombatTransportRepository({
      from,
    } as unknown as AmordleSupabaseClient).load(projection.id, hostId);

    expect(result).toMatchObject({
      kind: 'cooperative-participant',
      sourceKind: 'private-request',
      updatedAt: canonicalAcceptedAt,
      state: { updatedAt: canonicalAcceptedAt, revision: 0, moves: [] },
    });
  });

  it('does not reconcile contradictory timestamps for ordinary or mutated games', async () => {
    const state = createPracticeCombatPreview({
      id: 'public-practice-conflict',
      config,
      players: [{ displayName: 'Player One' }, { displayName: 'Player Two' }],
      answers: ['aa', 'ab', 'ac', 'ad', 'ae'],
      now,
    });
    const projection = buildCooperativePracticeProjection({
      sourceKind: 'public-lobby',
      playerOneUserId: hostId,
      playerTwoUserId: joinerId,
      wordRevision: 'test-revision',
      state,
    });
    const row = {
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
      deadline_at: projection.deadlineAt,
      ended_at: projection.endedAt,
      winner_player_id: projection.winnerId,
      created_at: now,
      updated_at: '2026-07-23T12:00:01.000Z',
      projection,
    };
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(
      new PracticeCombatTransportRepository({
        from,
      } as unknown as AmordleSupabaseClient).load(projection.id, hostId),
    ).rejects.toThrow(/metadata and projection evidence disagree/i);
  });
});
