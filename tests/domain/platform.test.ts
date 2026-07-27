import { describe, expect, it } from 'vitest';
import {
  continuationCost,
  economyIdempotencyKey,
  levelForXp,
  selectIncorrectLettersToRemove,
  selectRevealPosition,
  xpFloorForLevel,
} from '@/domain/economy';
import { materializeClock } from '@/domain/clock';
import { acceptsExpectedState, terminalPrecedence } from '@/domain/multiplayer';
import { mergeNotifications } from '@/domain/notifications';
import { INITIAL_RATING, expectedScore, ratingDelta } from '@/domain/rating';
import { reconcileRevisioned } from '@/domain/reconciliation';
import { AuthTransitionCoordinator } from '@/application/auth-transition';

describe('platform domains', () => {
  it('calculates progression and exact continuation prices', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(900)).toBe(4);
    expect(xpFloorForLevel(4)).toBe(900);
    expect(continuationCost({ wordLength: 5, completionPercentage: 0, continuationCount: 0 })).toBe(
      6,
    );
    expect(
      continuationCost({ wordLength: 5, completionPercentage: 100, continuationCount: 1 }),
    ).toBe(6);
  });

  it('selects deterministic consumable effects and operation identities', () => {
    expect(
      selectRevealPosition({
        answer: 'crane',
        knownPositions: new Set([0, 2, 3, 4]),
        operationId: 'same',
      }),
    ).toBe(1);
    const removed = selectIncorrectLettersToRemove({
      answer: 'crane',
      draft: 's',
      alreadyAbsentOrRemoved: new Set(['b']),
      operationId: 'same',
    });
    expect(removed).toHaveLength(5);
    expect(removed.some((letter) => 'cranesb'.includes(letter))).toBe(false);
    expect(
      economyIdempotencyKey({
        ownerNamespace: 'guest',
        operation: 'continuation',
        logicalId: 'game',
      }),
    ).toBe('guest:continuation:game');
  });

  it('derives clocks from server time without debiting the inactive player', () => {
    const clock = materializeClock(
      {
        activePlayerId: 'one',
        playerRemainingMs: { one: 300_000, two: 300_000 },
        serverObservedAt: '2026-07-27T00:00:00.000Z',
      },
      '2026-07-27T00:00:05.000Z',
    );
    expect(clock.playerRemainingMs).toEqual({ one: 295_000, two: 300_000 });
  });

  it('uses terminal precedence and expected revision/move evidence', () => {
    expect(terminalPrecedence(['draw', 'forfeit', 'timeout'])).toBe('timeout');
    expect(
      acceptsExpectedState(
        {
          phase: 'playing',
          version: 3,
          move: 2,
          activePlayerId: 'one',
          acceptedRows: 2,
          winnerId: null,
          terminalReason: null,
        },
        3,
        2,
      ),
    ).toBe(true);
  });

  it('settles Elo with distinct provisional and established factors', () => {
    expect(expectedScore(INITIAL_RATING, INITIAL_RATING)).toBe(0.5);
    expect(ratingDelta({ rating: 1200, opponentRating: 1200, score: 1, gamesPlayed: 0 })).toBe(20);
    expect(ratingDelta({ rating: 1200, opponentRating: 1200, score: 1, gamesPlayed: 10 })).toBe(12);
  });

  it('reconciles revision first and timestamps second', () => {
    expect(
      reconcileRevisioned(
        { revision: 2, updatedAt: '2026-01-01T00:00:00Z', state: 'local' },
        { revision: 1, updatedAt: '2027-01-01T00:00:00Z', state: 'remote' },
      )?.state,
    ).toBe('local');
    expect(
      reconcileRevisioned(
        { revision: 2, updatedAt: '2026-01-01T00:00:00Z', state: 'local' },
        { revision: 2, updatedAt: '2026-01-02T00:00:00Z', state: 'remote' },
      )?.state,
    ).toBe('remote');
  });

  it('deduplicates notifications and rejects stale auth epochs', () => {
    const merged = mergeNotifications(
      [],
      [
        {
          id: 'old',
          accountNamespace: 'account:a',
          kind: 'turn',
          durableRevision: 'g:2',
          route: '/combat/match/g',
          createdAt: '2026-01-01T00:00:00Z',
          read: false,
        },
        {
          id: 'new',
          accountNamespace: 'account:a',
          kind: 'turn',
          durableRevision: 'g:2',
          route: '/combat/match/g',
          createdAt: '2026-01-02T00:00:00Z',
          read: false,
        },
      ],
    );
    expect(merged.map((item) => item.id)).toEqual(['new']);
    const coordinator = new AuthTransitionCoordinator();
    const first = coordinator.begin('a');
    const second = coordinator.begin('b');
    expect(coordinator.isCurrent(first)).toBe(false);
    expect(coordinator.isCurrent(second)).toBe(true);
  });

  it('keeps a durable transition read when an unchanged feed row reappears', () => {
    const read = {
      id: 'local-read',
      accountNamespace: 'account:a',
      kind: 'turn' as const,
      durableRevision: 'game:7',
      route: '/combat/match/game',
      createdAt: '2026-07-27T12:00:00.000Z',
      read: true,
    };
    const remoteReplay = { ...read, id: 'remote-replay', read: false };

    expect(mergeNotifications([read], [remoteReplay])).toEqual([read]);
  });
});
