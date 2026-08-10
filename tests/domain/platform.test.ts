import { describe, expect, it } from 'vitest';
import {
  continuationCost,
  economyIdempotencyKey,
  levelForXp,
  selectIncorrectLettersToRemove,
  selectRevealPosition,
  xpFloorForLevel,
} from '@/domain/economy';
import { formatClock, readCombatClock, shouldAutoSettleTimeout } from '@/domain/clock';
import { rematchViewState } from '@/domain/combat-rematch';
import { classifyServiceFailure, serviceFailureIsRetryable } from '@/domain/service-failure';
import { acceptsExpectedState, terminalPrecedence } from '@/domain/multiplayer';
import {
  countByCategory,
  matchesCategory,
  mergeNotifications,
  notificationMetadata,
} from '@/domain/notifications';
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
    // Five seconds into the active player's turn, read from a projection produced at
    // that same instant. The inactive seat holds its stored post-debit value.
    const turnStartedAt = '2026-07-27T00:00:00.000Z';
    const serverNow = '2026-07-27T00:00:05.000Z';
    const observedAtMs = 1_000_000;
    const active = readCombatClock({
      durableRemainingMs: 300_000,
      running: true,
      turnStartedAt,
      serverNow,
      observedAtMs,
      nowMs: observedAtMs,
    });
    const inactive = readCombatClock({
      durableRemainingMs: 300_000,
      running: false,
      turnStartedAt,
      serverNow,
      observedAtMs,
      nowMs: observedAtMs + 60_000,
    });
    expect(active.remainingMs).toBe(295_000);
    expect(inactive.remainingMs).toBe(300_000);
    expect(inactive.running).toBe(false);
  });

  /*
   * A2. `refetchOnWindowFocus` means returning to a backgrounded tab refetches, and the
   * read RPC is `stable` so it returns the same undebited 300_000 every time. Anchoring
   * elapsed time to `serverNow` therefore restored the full budget on every refocus.
   * Anchoring to `turnStartedAt` makes the reading monotonic across refetches.
   */
  it('holds the running clock through a refetch and a refocus', () => {
    const turnStartedAt = '2026-08-06T12:00:00.000Z';
    const first = readCombatClock({
      durableRemainingMs: 300_000,
      running: true,
      turnStartedAt,
      serverNow: '2026-08-06T12:00:10.000Z',
      observedAtMs: 1_000_000,
      nowMs: 1_005_000,
    });
    expect(first.remainingMs).toBe(285_000);

    const afterRefocus = readCombatClock({
      durableRemainingMs: 300_000,
      running: true,
      turnStartedAt,
      serverNow: '2026-08-06T12:02:10.000Z',
      observedAtMs: 1_120_000,
      nowMs: 1_120_000,
    });
    expect(afterRefocus.remainingMs).toBe(170_000);
    expect(afterRefocus.remainingMs).toBeLessThan(first.remainingMs);
  });

  it('ignores client clock skew, a missing turn anchor, and unparseable timestamps', () => {
    const base = {
      durableRemainingMs: 300_000,
      running: true as const,
      turnStartedAt: '2026-08-06T12:00:00.000Z',
      serverNow: '2026-08-06T12:00:30.000Z',
      observedAtMs: 1_000_000,
      nowMs: 1_000_000,
    };
    // A device an hour out of step with the server reads exactly the same number.
    expect(readCombatClock(base).remainingMs).toBe(270_000);
    expect(
      readCombatClock({ ...base, observedAtMs: 4_600_000, nowMs: 4_600_000 }).remainingMs,
    ).toBe(270_000);
    // Microsecond precision and an explicit offset are what Postgres actually emits.
    expect(
      readCombatClock({
        ...base,
        turnStartedAt: '2026-08-06T12:00:00.123456+00:00',
        serverNow: '2026-08-06T12:00:30.123456+00:00',
      }).remainingMs,
    ).toBe(270_000);
    // Degrade rather than render NaN when the anchor is absent or malformed.
    expect(readCombatClock({ ...base, turnStartedAt: undefined }).remainingMs).toBe(300_000);
    expect(readCombatClock({ ...base, serverNow: 'not-a-date' }).remainingMs).toBe(300_000);
    /*
     * W1. This previously asserted `expired === true`, pinning the defect in place: an
     * untimed lane sends no budget at all, and folding that absence into 0 made every
     * untimed seat read as out of time. A seat with no budget has no time to run out of.
     */
    expect(readCombatClock({ ...base, durableRemainingMs: null })).toEqual({
      remainingMs: 0,
      running: false,
      expired: false,
    });
    expect(readCombatClock({ ...base, durableRemainingMs: undefined }).expired).toBe(false);
    // A real budget of zero is a different thing entirely, and still expires.
    expect(readCombatClock({ ...base, durableRemainingMs: 0 }).expired).toBe(true);
    expect(readCombatClock({ ...base, nowMs: 1_400_000 })).toEqual({
      remainingMs: 0,
      running: true,
      expired: true,
    });
    expect(formatClock(295_000)).toBe('4:55');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });

  /*
   * W1. Running out of time is the loss, so nobody claims it — a client settles it
   * automatically. The predicate is symmetric: it asks whether the seat ON MOVE has run
   * out, so whichever client is watching sends the command, including the client of the
   * player who lost.
   *
   * The test this replaces asserted that "an untimed lane never produces a running
   * clock" and hand-fed `running: false` to prove it. Reality disagreed —
   * `useCombatClockReading` derives `running` from turn ownership alone, with no
   * reference to whether the lane is timed — and that false premise is exactly what let
   * the control ship onto untimed matches. So the untimed case is now built from
   * `readCombatClock` rather than asserted about a hand-made reading.
   */
  it('settles a timeout automatically for whichever seat on move has run out', () => {
    const expired = { remainingMs: 0, running: true, expired: true } as const;
    const live = { remainingMs: 42_000, running: true, expired: false } as const;
    const base = {
      status: 'playing',
      terminal: false,
      currentTurn: 'player-two',
      activeClock: expired,
    } as const;
    expect(shouldAutoSettleTimeout(base)).toBe(true);
    // Symmetric: your own exhausted turn settles too. You lose; that is the rule.
    expect(shouldAutoSettleTimeout({ ...base, currentTurn: 'player-one' })).toBe(true);
    // Their clock is still running.
    expect(shouldAutoSettleTimeout({ ...base, activeClock: live })).toBe(false);
    // Nobody is on move, or the match already ended.
    expect(shouldAutoSettleTimeout({ ...base, currentTurn: undefined })).toBe(false);
    expect(shouldAutoSettleTimeout({ ...base, terminal: true })).toBe(false);
    expect(shouldAutoSettleTimeout({ ...base, status: 'holding' })).toBe(false);

    // An untimed lane, built the way the app actually builds it: no budget, and
    // `running` true because this seat is on move. It must never settle.
    const untimed = readCombatClock({
      durableRemainingMs: null,
      running: true,
      turnStartedAt: undefined,
      serverNow: '2026-08-08T12:00:00.000Z',
      observedAtMs: 1_000_000,
      nowMs: 9_000_000,
    });
    expect(untimed.expired).toBe(false);
    expect(shouldAutoSettleTimeout({ ...base, activeClock: untimed })).toBe(false);
  });

  /*
   * A1. The requesting player polls the same row the accepting player mutated, and that
   * row already carries the created game id. Before this, any status other than pending
   * fell through to "REQUEST REMATCH", so the requester was silently offered a fresh
   * request instead of a way into the match that had just started without them.
   */
  it('gives the rematch requester a way into an accepted rematch', () => {
    const nowMs = Date.parse('2026-08-06T00:05:00.000Z');
    const expires_at = '2026-08-06T00:10:00.000Z';
    const created = {
      request_status: 'created',
      created_game_id: 'amordle-rematch-v3-abc',
      viewer_can_accept: false,
      viewer_can_cancel: false,
      expires_at,
    } as const;
    expect(rematchViewState(created, nowMs)).toEqual({
      action: 'join',
      joinGameId: 'amordle-rematch-v3-abc',
      lastOutcome: null,
    });
    // The dead 'accepted' spelling must behave identically if the schema ever emits it.
    expect(rematchViewState({ ...created, request_status: 'accepted' }, nowMs).action).toBe('join');
    // 'created' without a game id is incomplete, not terminal — never a dead end.
    expect(rematchViewState({ ...created, created_game_id: null }, nowMs).action).toBe('request');

    const pending = { ...created, request_status: 'pending', created_game_id: null } as const;
    expect(rematchViewState(undefined, nowMs)).toEqual({
      action: 'request',
      joinGameId: null,
      lastOutcome: null,
    });
    expect(rematchViewState({ ...pending, viewer_can_accept: true }, nowMs).action).toBe('respond');
    expect(rematchViewState({ ...pending, viewer_can_cancel: true }, nowMs).action).toBe('cancel');
    expect(rematchViewState(pending, nowMs).action).toBe('request');
    // Requests expire lazily server-side, so a polled row can outlive its window.
    expect(
      rematchViewState({ ...pending, viewer_can_cancel: true }, Date.parse(expires_at) + 1),
    ).toEqual({ action: 'request', joinGameId: null, lastOutcome: 'expired' });
    // A refusal now says so instead of showing a bare button with no explanation.
    for (const outcome of ['declined', 'cancelled', 'expired'] as const) {
      expect(rematchViewState({ ...pending, request_status: outcome }, nowMs)).toEqual({
        action: 'request',
        joinGameId: null,
        lastOutcome: outcome,
      });
    }
  });

  /*
   * A3. One sentence and one retry button covered four different situations, including
   * two where retrying can never succeed. The authority already distinguishes them.
   */
  it('separates a missing match from a private one, a lapsed session, and a dropped link', () => {
    expect(classifyServiceFailure({ code: 'P0002' })).toBe('not-found');
    expect(classifyServiceFailure({ code: 'NOT_FOUND' })).toBe('not-found');
    expect(classifyServiceFailure({ code: 'PGRST116' })).toBe('not-found');
    expect(classifyServiceFailure({ code: '42501' })).toBe('forbidden');
    expect(classifyServiceFailure({ code: 'FORBIDDEN' })).toBe('forbidden');
    expect(classifyServiceFailure({ code: '28000' })).toBe('auth');
    expect(classifyServiceFailure({ code: 'AUTH_REQUIRED' })).toBe('auth');
    expect(classifyServiceFailure({ code: 'UNAVAILABLE' })).toBe('unavailable');
    expect(classifyServiceFailure({ code: 'INVALID_RESPONSE' })).toBe('unsupported');
    expect(classifyServiceFailure({})).toBe('unknown');
    expect(classifyServiceFailure({ code: null })).toBe('unknown');
    // Being offline explains any code, so it wins over one.
    expect(classifyServiceFailure({ code: 'P0002', online: false })).toBe('offline');
    expect(classifyServiceFailure({ code: 'P0002', online: true })).toBe('not-found');
    // A retry is only offered where the same request could later succeed.
    expect((['not-found', 'forbidden', 'auth'] as const).map(serviceFailureIsRetryable)).toEqual([
      false,
      false,
      false,
    ]);
    expect(
      (['offline', 'unavailable', 'unsupported', 'unknown'] as const).map(
        serviceFailureIsRetryable,
      ),
    ).toEqual([true, true, true, true]);
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

  /*
   * v8-B3/B4. The read flag is the only thing the stored copy is authoritative for.
   *
   * This used to return the STORED row wholesale for an unchanged transition, which
   * was indistinguishable from the right answer while a notification was nothing but
   * identity plus a flag. It stopped being right once rows carry a live summary and a
   * board snapshot: those are stripped before persisting, so returning the stored copy
   * meant every notification lost its detail the moment it was read.
   *
   * The rule now is: take the live row, carry the flag across.
   */
  it('keeps a durable transition read while the live row stays authoritative', () => {
    const read = {
      id: 'local-read',
      accountNamespace: 'account:a',
      kind: 'turn' as const,
      durableRevision: 'game:7',
      route: '/combat/match/game',
      createdAt: '2026-07-27T12:00:00.000Z',
      read: true,
    };
    const remoteReplay = {
      ...read,
      id: 'remote-replay',
      read: false,
      detail: 'Nova · Ranked · OG · 5 letters',
      board: { wordLength: 5, rows: ['aapca'] },
    };

    expect(mergeNotifications([read], [remoteReplay])).toEqual([{ ...remoteReplay, read: true }]);
  });

  /*
   * v8-B3/B4. What gets written down, and what gets filtered.
   *
   * The stripping is load-bearing in two directions: it keeps a per-notification board
   * snapshot out of the durable envelope, and it is what makes the persist-comparison
   * in the centre terminate — comparing a stripped stored record against a live one
   * would never match, and the component would write on every render.
   */
  it('persists identity and read state only, and sorts notifications into lanes', () => {
    const base = {
      accountNamespace: 'account:a',
      durableRevision: 'game:7',
      route: '/combat/match/game',
      createdAt: '2026-07-27T12:00:00.000Z',
      read: false,
    };
    const turn = {
      ...base,
      id: 'turn:game',
      kind: 'turn' as const,
      detail: 'Nova · OG · 5 letters',
      board: { wordLength: 5, rows: ['aapca', 'ccccc'] },
    };

    expect(notificationMetadata(turn)).toEqual({
      id: 'turn:game',
      accountNamespace: 'account:a',
      kind: 'turn',
      durableRevision: 'game:7',
      route: '/combat/match/game',
      createdAt: '2026-07-27T12:00:00.000Z',
      read: false,
    });
    expect(Object.keys(notificationMetadata(turn))).not.toContain('board');

    const waiting = { ...base, id: 'match:other', kind: 'match' as const };
    const result = { ...base, id: 'result:done', kind: 'result' as const, read: true };
    const rematch = { ...base, id: 'rematch:req', kind: 'rematch' as const };
    const all = [turn, waiting, result, rematch];

    // A game waiting on the opponent belongs in the turn lane: both answer "which
    // games am I in right now".
    expect(all.filter((item) => matchesCategory(item, 'turn')).map((item) => item.id)).toEqual([
      'turn:game',
      'match:other',
    ]);
    expect(all.filter((item) => matchesCategory(item, 'all'))).toHaveLength(4);
    expect(countByCategory(all, 'turn')).toBe(2);
    // Counts are unread-only, so a lane whose items have all been read reads as quiet.
    expect(countByCategory(all, 'result')).toBe(0);
    expect(countByCategory(all, 'all')).toBe(3);
  });

  it('prunes obsolete notifications and makes a revised event unread again', () => {
    const previous = {
      id: 'turn:game',
      accountNamespace: 'account:a',
      kind: 'turn' as const,
      durableRevision: 'game:7',
      route: '/combat/match/game',
      createdAt: '2026-07-27T12:00:00.000Z',
      read: true,
    };
    const revised = {
      ...previous,
      durableRevision: 'game:8',
      createdAt: '2026-07-27T12:01:00.000Z',
      read: false,
    };
    expect(mergeNotifications([previous], [revised])).toEqual([revised]);
    expect(mergeNotifications([previous], [])).toEqual([]);
  });
});
