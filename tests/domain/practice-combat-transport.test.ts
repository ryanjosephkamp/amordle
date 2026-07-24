import { describe, expect, it } from 'vitest';

import {
  buildCooperativePracticeProjection,
  buildWaitingPracticeProjection,
  parsePracticeTransportProjection,
} from '../../src/services/practice-combat-transport';
import { createPracticeCombatPreview } from '../../src/domain/practice-combat-preview';

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
});
