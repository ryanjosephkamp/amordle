import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  calculateEloUpdate,
  determineCombatOutcome,
  expectedEloScore,
  oldestCompatibleQueueRequest,
  playerCombatPoints,
  rankBandForRating,
  rankedQueueCompatible,
  ratingBucketFor,
  ratingEligibility,
  settleRatingPair,
  type RankedQueueRequest,
} from '../../src/domain/combat';
import { scoreGuess } from '../../src/domain/game';

describe('COMBAT points and outcome precedence', () => {
  it('calculates tile, solve, unused-attempt, and Hard Mode points', () => {
    expect(
      playerCombatPoints([
        {
          guesses: [scoreGuess('allee', 'apple'), scoreGuess('apple', 'apple')],
          solved: true,
          maxAttempts: 6,
          hardMode: true,
        },
      ]),
    ).toBe(192);
  });

  it('uses cancellation, forfeit, timeout, OG solve, then points precedence', () => {
    const base = { playerIds: ['left', 'right'] as const, points: { left: 999, right: 0 } };
    expect(
      determineCombatOutcome({ ...base, submittedGuessCount: 0, forfeitingPlayerId: 'left' }),
    ).toEqual({
      kind: 'cancelled',
      reason: 'cancellation',
      winnerId: null,
      loserId: null,
      revealAnswer: false,
    });
    expect(
      determineCombatOutcome({ ...base, submittedGuessCount: 1, forfeitingPlayerId: 'left' }),
    ).toMatchObject({
      reason: 'forfeit',
      winnerId: 'right',
    });
    expect(
      determineCombatOutcome({ ...base, submittedGuessCount: 2, timedOutPlayerId: 'left' }),
    ).toMatchObject({
      reason: 'timeout',
      winnerId: 'right',
    });
    expect(
      determineCombatOutcome({ ...base, submittedGuessCount: 2, ogSolvedByPlayerId: 'right' }),
    ).toMatchObject({
      reason: 'og_solve',
      winnerId: 'right',
    });
    expect(determineCombatOutcome({ ...base, submittedGuessCount: 2 })).toMatchObject({
      reason: 'points',
      winnerId: 'left',
    });
  });
});

describe('Elo and matchmaking', () => {
  it('matches the canonical Elo constants and rank bands', () => {
    expect(expectedEloScore(1200, 1200)).toBe(0.5);
    expect(
      calculateEloUpdate({ rating: 1200, opponentRating: 1200, gamesPlayed: 0, result: 'win' }),
    ).toMatchObject({
      ratingDelta: 20,
      newRating: 1220,
      kFactor: 40,
      provisional: true,
    });
    expect(
      calculateEloUpdate({ rating: 1200, opponentRating: 1200, gamesPlayed: 10, result: 'loss' }),
    ).toMatchObject({
      ratingDelta: -12,
      kFactor: 24,
      provisional: false,
    });
    expect([899, 900, 1100, 1300, 1500, 1700, 1900].map(rankBandForRating)).toEqual([
      'Learner',
      'Bronze',
      'Silver',
      'Gold',
      'Platinum',
      'Diamond',
      'Master',
    ]);
  });

  it('produces complementary expected scores', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3000 }),
        fc.integer({ min: 0, max: 3000 }),
        (left, right) => {
          expect(expectedEloScore(left, right) + expectedEloScore(right, left)).toBeCloseTo(1, 12);
        },
      ),
    );
  });

  it('keeps rating buckets separate and rejects unsupported clocks', () => {
    expect(ratingBucketFor({ scope: 'practice', mode: 'og' })).toBe('multiplayer:og');
    expect(ratingBucketFor({ scope: 'practice', mode: 'go', timeLimitMs: 300_000 })).toBe(
      'multiplayer:go:timed:v1',
    );
    expect(ratingBucketFor({ scope: 'practice', mode: 'og', timeLimitMs: 60_000 })).toBeUndefined();
    expect(ratingBucketFor({ scope: 'daily', mode: 'go' })).toBe('multiplayer:go:daily:v1');
    expect(
      ratingEligibility({
        authenticated: false,
        durable: true,
        ranked: true,
        serverAuthorized: true,
        terminal: true,
        participant: true,
        fixture: false,
        scope: 'practice',
        mode: 'og',
      }),
    ).toMatchObject({ eligible: false });
  });

  it('settles a pair exactly once', () => {
    const state = { appliedIds: [], ratings: {} };
    const first = settleRatingPair({
      state,
      idempotencyId: 'match-1',
      playerIds: ['left', 'right'],
      result: { left: 'win', right: 'loss' },
    });
    expect(first.applied).toBe(true);
    const retry = settleRatingPair({
      state: first.state,
      idempotencyId: 'match-1',
      playerIds: ['left', 'right'],
      result: { left: 'win', right: 'loss' },
    });
    expect(retry.applied).toBe(false);
    expect(retry.state).toBe(first.state);
  });

  it('matches compatible FIFO requests and permits repeat opponents', () => {
    const settings = {
      scope: 'practice' as const,
      mode: 'og' as const,
      wordLength: 5,
      hardMode: false,
    };
    const request: RankedQueueRequest = {
      id: 'request',
      userId: 'a',
      queuedAt: '2026-07-21T12:01:00Z',
      settings,
      status: 'searching',
    };
    const later: RankedQueueRequest = {
      id: 'later',
      userId: 'b',
      queuedAt: '2026-07-21T12:02:00Z',
      settings,
      status: 'searching',
    };
    const earlier: RankedQueueRequest = {
      id: 'earlier',
      userId: 'c',
      queuedAt: '2026-07-21T12:00:00Z',
      settings,
      status: 'searching',
    };
    expect(rankedQueueCompatible(request, earlier)).toBe(true);
    expect(oldestCompatibleQueueRequest(request, [later, earlier])).toBe(earlier);
    const matched = { ...request, status: 'matched' as const, matchedGameId: 'game' };
    expect(oldestCompatibleQueueRequest(matched, [earlier])).toBe(matched);
  });
});
