import { describe, expect, it, vi } from 'vitest';

import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';
import {
  AuthoritativeCombatRepository,
  authoritativeClockRemainingMs,
  authoritativeCombatProjectionSchema,
  authoritativeGuessMoves,
} from '../../src/services/authoritative-combat-repository';

const now = '2026-07-24T20:00:00.000Z';

function participantProjection(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    authorityVersion: 2,
    id: 'amordle-combat-v2-test',
    scope: 'practice',
    mode: 'og',
    sourceKind: 'ranked-queue',
    visibilityKind: 'public',
    wordLength: 5,
    difficulty: 'expert',
    hardMode: false,
    goPuzzleCount: null,
    timeLimitMs: null,
    ranked: true,
    ratingBucket: 'multiplayer:og',
    status: 'playing',
    version: 0,
    moveCount: 0,
    serverNow: now,
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    currentTurn: 'player-one',
    currentPuzzleIndex: 0,
    attemptBudget: 6,
    viewerSeat: 'player-one',
    players: [
      { seat: 'player-one', displayName: 'Ember', initials: 'EM' },
      { seat: 'player-two', displayName: 'Frost', initials: 'FR' },
    ],
    moves: [],
    seededRows: [],
    playerState: {
      'player-one': {
        points: 0,
        attemptsThisPuzzle: 0,
        puzzlesSolved: 0,
        timeRemainingMs: null,
      },
      'player-two': {
        points: 0,
        attemptsThisPuzzle: 0,
        puzzlesSolved: 0,
        timeRemainingMs: null,
      },
    },
    capabilities: {
      canJoin: false,
      canSubmitGuess: true,
      canAdvance: false,
      canCancel: true,
      canForfeit: false,
      canSettleRating: false,
    },
    outcome: { terminal: false },
    ...overrides,
  };
}

function mockClient(data: unknown) {
  const rpc = vi.fn(async () => ({ data, error: null }));
  return {
    client: { rpc } as unknown as AmordleSupabaseClient,
    rpc,
  };
}

describe('authoritative COMBAT repository', () => {
  it('creates Ranked Practice with the complete server-owned reservation fingerprint', async () => {
    const fixture = mockClient({
      schemaVersion: 2,
      requestId: 'queue-v2',
      status: 'queued',
      queuedAt: '2026-07-24T20:00:00+00:00',
      expiresAt: '2026-07-24T20:15:00+00:00',
      idempotent: false,
    });
    const result = await new AuthoritativeCombatRepository(
      fixture.client,
    ).createRankedPracticeRequest({
      mode: 'go',
      wordLength: 8,
      difficulty: 'standard',
      hardMode: true,
      goPuzzleCount: 7,
      timeLimitMs: 300_000,
      creationKey: 'e2e-test:ranked-practice',
      expiresAt: '2026-07-24T20:15:00.000Z',
    });

    expect(result).toMatchObject({
      requestId: 'queue-v2',
      status: 'queued',
      queuedAt: '2026-07-24T20:00:00.000Z',
    });
    expect(fixture.rpc).toHaveBeenCalledWith('create_amordle_ranked_practice_request_v2', {
      p_mode: 'go',
      p_word_length: 8,
      p_difficulty: 'standard',
      p_hard_mode: true,
      p_go_puzzle_count: 7,
      p_time_limit_ms: 300_000,
      p_creation_key: 'e2e-test:ranked-practice',
      p_expires_at: '2026-07-24T20:15:00.000Z',
    });
  });

  it('loads a strict answerless active participant projection', async () => {
    const fixture = mockClient(participantProjection());
    const result = await new AuthoritativeCombatRepository(fixture.client).getGame(
      'amordle-combat-v2-test',
    );

    expect(result).toMatchObject({
      authorityVersion: 2,
      status: 'playing',
      viewerSeat: 'player-one',
    });
    expect(JSON.stringify(result)).not.toContain('answer');
  });

  it('canonicalizes omitted nullable Daily OG and untimed projection fields', () => {
    const wire = structuredClone(
      participantProjection({
        scope: 'daily',
        sourceKind: 'daily-lobby',
        visibilityKind: 'restricted',
        dailyDateKey: '2026-07-24',
        ranked: false,
        ratingBucket: null,
      }),
    ) as Record<string, unknown>;
    delete wire.goPuzzleCount;
    delete wire.timeLimitMs;
    delete wire.ratingBucket;
    const playerState = wire.playerState as Record<string, Record<string, unknown>>;
    delete playerState['player-one']!.timeRemainingMs;
    delete playerState['player-two']!.timeRemainingMs;

    const result = authoritativeCombatProjectionSchema.parse(wire);

    expect(result.goPuzzleCount).toBeNull();
    expect(result.timeLimitMs).toBeNull();
    expect(result.ratingBucket).toBeNull();
    expect(result.playerState['player-one'].timeRemainingMs).toBeNull();
    expect(result.playerState['player-two'].timeRemainingMs).toBeNull();
  });

  it('rejects unexpected answer and raw identity fields before they reach React', async () => {
    const answerFixture = mockClient({
      ...participantProjection(),
      answer: 'crane',
    });
    await expect(
      new AuthoritativeCombatRepository(answerFixture.client).getGame('amordle-combat-v2-test'),
    ).rejects.toMatchObject({ name: 'ZodError' });

    const identityFixture = mockClient({
      ...participantProjection(),
      playerOneUserId: '00000000-0000-4000-8000-000000000001',
    });
    await expect(
      new AuthoritativeCombatRepository(identityFixture.client).getGame('amordle-combat-v2-test'),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('keeps accepted guesses distinct from seeded evidence and ledger control actions', () => {
    const projection = authoritativeCombatProjectionSchema.parse(
      participantProjection({
        mode: 'go',
        goPuzzleCount: 5,
        currentPuzzleIndex: 1,
        attemptBudget: 5,
        version: 3,
        moveCount: 2,
        moves: [
          {
            sequenceNo: 1,
            actionId: 'guess-one',
            type: 'guess',
            seat: 'player-one',
            puzzleIndex: 0,
            guess: 'CRANE',
            tiles: [
              { letter: 'C', state: 'absent' },
              { letter: 'R', state: 'present' },
              { letter: 'A', state: 'absent' },
              { letter: 'N', state: 'correct' },
              { letter: 'E', state: 'correct' },
            ],
            pointsAwarded: 19,
            createdAt: now,
          },
          {
            sequenceNo: 2,
            actionId: 'guess-two',
            type: 'guess',
            seat: 'player-two',
            puzzleIndex: 0,
            guess: 'PLANT',
            tiles: [
              { letter: 'P', state: 'absent' },
              { letter: 'L', state: 'absent' },
              { letter: 'A', state: 'present' },
              { letter: 'N', state: 'correct' },
              { letter: 'T', state: 'absent' },
            ],
            pointsAwarded: 9,
            createdAt: now,
          },
          {
            sequenceNo: 3,
            actionId: 'advance-one',
            type: 'advance',
            seat: 'player-two',
            puzzleIndex: 1,
            createdAt: now,
          },
        ],
        seededRows: [
          {
            sourcePuzzleIndex: 0,
            label: 'P1',
            guess: 'CRANE',
            tiles: [
              { letter: 'C', state: 'absent' },
              { letter: 'R', state: 'present' },
              { letter: 'A', state: 'absent' },
              { letter: 'N', state: 'correct' },
              { letter: 'E', state: 'correct' },
            ],
            consumesAttemptSlot: true,
            countsAsPlayerGuess: false,
            awardsPoints: false,
          },
        ],
      }),
    );

    expect(authoritativeGuessMoves(projection)).toHaveLength(2);
    expect(projection.seededRows).toHaveLength(1);
    expect(projection.moveCount).toBe(2);
  });

  it('derives the active clock from the server snapshot and never below zero', () => {
    const projection = authoritativeCombatProjectionSchema.parse(
      participantProjection({
        timeLimitMs: 300_000,
        ratingBucket: 'multiplayer:og:timed:v1',
        serverNow: '2026-07-24T20:00:10.000Z',
        turnStartedAt: '2026-07-24T20:00:00.000Z',
        playerState: {
          'player-one': {
            points: 0,
            attemptsThisPuzzle: 0,
            puzzlesSolved: 0,
            timeRemainingMs: 300_000,
          },
          'player-two': {
            points: 0,
            attemptsThisPuzzle: 0,
            puzzlesSolved: 0,
            timeRemainingMs: 300_000,
          },
        },
      }),
    );

    expect(
      authoritativeClockRemainingMs(
        projection,
        'player-one',
        Date.parse('2026-07-24T20:00:15.000Z'),
      ),
    ).toBe(285_000);
    expect(
      authoritativeClockRemainingMs(
        projection,
        'player-one',
        Date.parse('2026-07-24T20:10:00.000Z'),
      ),
    ).toBe(0);
    expect(
      authoritativeClockRemainingMs(
        projection,
        'player-two',
        Date.parse('2026-07-24T20:10:00.000Z'),
      ),
    ).toBe(300_000);
  });

  it('validates owner and joiner capabilities for unranked Daily lobby lists', async () => {
    const fixture = mockClient([
      {
        schemaVersion: 2,
        authorityVersion: 2,
        id: 'daily-lobby-v2',
        scope: 'daily',
        mode: 'go',
        dailyDateKey: '2026-07-24',
        status: 'waiting',
        version: 0,
        moveCount: 0,
        wordLength: 5,
        difficulty: 'expert',
        hardMode: false,
        goPuzzleCount: 5,
        ranked: false,
        viewerSeat: null,
        owner: { displayName: 'Ember' },
        createdAt: '2026-07-24T20:00:00+00:00',
        updatedAt: '2026-07-24T20:00:00+00:00',
        capabilities: { canJoin: true, canCancel: false },
      },
    ]);
    const result = await new AuthoritativeCombatRepository(fixture.client).listUnrankedDailyLobbies(
      { mode: 'go' },
    );

    expect(result).toMatchObject([
      {
        id: 'daily-lobby-v2',
        dailyDateKey: '2026-07-24',
        createdAt: now,
      },
    ]);
  });

  it('rejects inconsistent settlement arithmetic', async () => {
    const fixture = mockClient({
      schemaVersion: 2,
      matchResultId: 'result-v2',
      bucket: 'multiplayer:og',
      outcome: 'win',
      oldRating: 1200,
      newRating: 1221,
      ratingDelta: 20,
      idempotent: false,
    });

    await expect(
      new AuthoritativeCombatRepository(fixture.client).settleRankedPractice({
        gameId: 'amordle-combat-v2-test',
        actionId: 'settle-v2',
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });
});
