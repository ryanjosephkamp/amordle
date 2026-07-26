import { describe, expect, it } from 'vitest';

import { combatLaneLabel, projectedCombatPoints } from '../../src/domain/combat-presentation';
import { createCombatHistoryRow } from '../../src/services/combat-history';

describe('COMBAT history presentation', () => {
  it.each([
    ['daily', 'og', true, 'ranked-queue', 'Ranked Daily OG'],
    ['daily', 'go', false, 'daily-lobby', 'Unranked Daily GO'],
    ['practice', 'og', true, 'ranked-queue', 'Ranked Practice OG'],
    ['practice', 'go', false, 'public-lobby', 'Unranked Public Practice GO'],
    ['practice', 'og', false, 'private-request', 'Private Practice OG'],
    ['practice', 'go', false, 'rematch', 'Practice Rematch GO'],
  ] as const)('labels %s %s accurately', (scope, mode, ranked, sourceKind, expected) => {
    expect(combatLaneLabel({ scope, mode, ranked, sourceKind })).toBe(expected);
  });

  it('builds one sanitized private record without raw participant identity or answers', () => {
    const row = createCombatHistoryRow({
      gameId: 'game-one',
      userId: '10000000-0000-4000-8000-000000000001',
      scope: 'daily',
      mode: 'og',
      ranked: false,
      sourceKind: 'daily-lobby',
      result: 'Won',
      terminalReason: 'solve',
      wordLength: 5,
      difficulty: 'expert',
      hardMode: false,
      puzzleCount: 1,
      playerPoints: 14,
      opponentPoints: 6,
      completedAt: '2026-07-26T12:00:00Z',
      opponent: {
        publicProfileId: null,
        displayName: 'Private player',
      },
    });
    expect(row.id).toBe('combat:game-one');
    expect(row.entry).toMatchObject({
      area: 'combat',
      lane: 'Unranked Daily OG',
      result: 'Won',
    });
    expect(JSON.stringify(row)).not.toMatch(/email|answer|authuuid/i);
  });

  it('reconstructs player scores from accepted moves instead of counting rows', () => {
    const moves = [
      {
        playerId: 'player-one' as const,
        puzzleIndex: 0,
        tiles: [
          { state: 'absent' as const },
          { state: 'present' as const },
          { state: 'correct' as const },
          { state: 'correct' as const },
          { state: 'absent' as const },
        ],
      },
      {
        playerId: 'player-one' as const,
        puzzleIndex: 0,
        tiles: Array.from({ length: 5 }, () => ({ state: 'correct' as const })),
      },
      {
        playerId: 'player-two' as const,
        puzzleIndex: 0,
        tiles: Array.from({ length: 5 }, () => ({ state: 'present' as const })),
      },
    ];

    expect(
      projectedCombatPoints({
        mode: 'og',
        puzzleCount: 1,
        hardMode: false,
        moves,
        seat: 'player-one',
      }),
    ).toBe(177);
    expect(
      projectedCombatPoints({
        mode: 'og',
        puzzleCount: 1,
        hardMode: false,
        moves,
        seat: 'player-two',
      }),
    ).toBe(10);
  });
});
