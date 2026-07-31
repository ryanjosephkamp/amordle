import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { combatProjectionSchema, rematchRequestSchema } from '@/adapters/cloud/combat';
import {
  rankedDailyExpiryUtc,
  rankedPracticeQueueTransition,
  sameRankedPracticeConfig,
} from '@/domain/multiplayer';
import type { RankedPracticeConfig } from '@/domain/multiplayer';

const baseConfig: RankedPracticeConfig = {
  mode: 'go',
  wordLength: 7,
  difficulty: 'expert',
  hardMode: true,
  goPuzzleCount: 10,
  timeLimitMs: 300_000,
};

describe('Ranked Practice queue contract', () => {
  it('uses the backend-authoritative next UTC midnight for Ranked Daily expiry', () => {
    expect(rankedDailyExpiryUtc('2026-07-31')).toBe('2026-08-01T00:00:00.000Z');
    expect(rankedDailyExpiryUtc('2026-12-31')).toBe('2027-01-01T00:00:00.000Z');
    expect(rankedDailyExpiryUtc('2028-02-29')).toBe('2028-03-01T00:00:00.000Z');
    expect(() => rankedDailyExpiryUtc('2026-02-30')).toThrow('real UTC date');
    expect(() => rankedDailyExpiryUtc('07/31/2026')).toThrow('YYYY-MM-DD');
  });

  it('adopts an intent only for the exact account-visible compatibility tuple', () => {
    expect(sameRankedPracticeConfig(baseConfig, { ...baseConfig })).toBe(true);
    for (const changed of [
      { ...baseConfig, mode: 'og' as const, goPuzzleCount: null },
      { ...baseConfig, wordLength: 8 },
      { ...baseConfig, difficulty: 'standard' as const },
      { ...baseConfig, hardMode: false },
      { ...baseConfig, goPuzzleCount: 7 as const },
      { ...baseConfig, timeLimitMs: null },
    ]) {
      expect(sameRankedPracticeConfig(baseConfig, changed)).toBe(false);
    }
  });

  it('maps every queue status to an explicit recoverable lifecycle', () => {
    expect(rankedPracticeQueueTransition('queued')).toEqual({
      phase: 'queued',
      shouldClearIntent: false,
      shouldFinalize: false,
    });
    expect(rankedPracticeQueueTransition('matched')).toEqual({
      phase: 'matched',
      shouldClearIntent: false,
      shouldFinalize: true,
    });
    expect(rankedPracticeQueueTransition('expired')).toEqual({
      phase: 'expired',
      shouldClearIntent: true,
      shouldFinalize: false,
    });
    expect(rankedPracticeQueueTransition('cancelled')).toEqual({
      phase: 'cancelled',
      shouldClearIntent: true,
      shouldFinalize: false,
    });
    for (const recoverable of ['conflict', 'failed'] as const) {
      expect(rankedPracticeQueueTransition(recoverable)).toEqual({
        phase: recoverable,
        shouldClearIntent: false,
        shouldFinalize: false,
      });
    }
  });

  it('retains exact server authority for supported clocks and concurrent claims', () => {
    const sql = readFileSync(
      'supabase/migrations/20260724222000_amordle_authoritative_combat_v2.sql',
      'utf8',
    );
    expect(sql).toContain('check (time_limit_ms is null or time_limit_ms = 300000)');
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('request_one_id text not null unique');
    expect(sql).toContain('request_two_id text not null unique');
    expect(sql).toContain('settle_amordle_ranked_practice_v2');
  });

  it('extends private authority without exposing browser-authored answers or raw Daily ids', () => {
    const sql = readFileSync(
      'supabase/migrations/20260730193000_amordle_combat_authority_v3.sql',
      'utf8',
    );
    for (const source of [
      "'public_lobby'",
      "'ranked_queue'",
      "'daily_lobby'",
      "'private_request'",
      "'rematch'",
    ]) {
      expect(sql).toContain(source);
    }
    expect(sql).toContain('create_amordle_public_practice_v3');
    expect(sql).toContain('join_amordle_public_practice_v3');
    expect(sql).toContain('accept_private_multiplayer_match_request_v3');
    expect(sql).toContain('accept_practice_multiplayer_rematch_v3');
    expect(sql).toContain('get_amordle_ranked_daily_status_v3');
    expect(sql).toContain('finalize_amordle_ranked_daily_v3');
    expect(sql).toContain('get_amordle_public_practice_spectator_v3');
    expect(sql).toContain('revoke all on schema brrrdle_private');
    expect(sql).toContain('to anon, authenticated');
    const statusBoundary = sql.slice(
      sql.indexOf('create or replace function public.get_amordle_ranked_daily_status_v3'),
      sql.indexOf('create or replace function public.finalize_amordle_ranked_daily_v3'),
    );
    expect(statusBoundary).not.toContain('playerUserIds');
  });

  it('accepts untimed and non-guess participant fields after null stripping', () => {
    const participantState = {
      points: 0,
      attemptsThisPuzzle: 0,
      puzzlesSolved: 0,
    };
    const parsed = combatProjectionSchema.parse({
      schemaVersion: 2,
      authorityVersion: 2,
      id: 'amordle-private-v3-test',
      scope: 'practice',
      mode: 'og',
      sourceKind: 'private-request',
      visibilityKind: 'restricted',
      wordLength: 5,
      difficulty: 'standard',
      hardMode: false,
      timeLimitMs: null,
      ranked: false,
      status: 'cancelled',
      version: 1,
      moveCount: 0,
      serverNow: '2026-07-30T20:29:51.000Z',
      createdAt: '2026-07-30T20:29:51.000Z',
      startedAt: '2026-07-30T20:29:51.000Z',
      updatedAt: '2026-07-30T20:29:51.000Z',
      currentPuzzleIndex: 0,
      attemptBudget: 6,
      viewerSeat: 'player-two',
      players: [
        { seat: 'player-one', displayName: 'Player One' },
        { seat: 'player-two', displayName: 'Player Two' },
      ],
      moves: [
        {
          sequenceNo: 1,
          actionId: 'cancel-action',
          type: 'cancel',
          seat: 'player-two',
          createdAt: '2026-07-30T20:29:52.000Z',
        },
      ],
      seededRows: [],
      playerState: {
        'player-one': participantState,
        'player-two': participantState,
      },
      capabilities: {
        canJoin: false,
        canSubmitGuess: false,
        canAdvance: false,
        canCancel: false,
        canForfeit: false,
        canSettleRating: false,
      },
      outcome: { terminal: true, reason: 'cancelled' },
    });

    expect(parsed.playerState['player-one'].timeRemainingMs).toBeUndefined();
    expect(parsed.playerState['player-two'].timeRemainingMs).toBeUndefined();
    expect(parsed.moves[0]).toMatchObject({
      type: 'cancel',
      puzzleIndex: 0,
      tiles: [],
      pointsAwarded: 0,
    });
  });

  it('accepts the authoritative created rematch receipt', () => {
    const parsed = rematchRequestSchema.parse({
      created: true,
      created_at: '2026-07-30T20:29:51.000Z',
      created_game_id: 'amordle-rematch-v3-test',
      expires_at: '2026-07-30T21:29:51.000Z',
      go_puzzle_count: null,
      hard_mode: false,
      idempotent: false,
      mode: 'og',
      opponent_seat: 'player-two',
      request_id: 'rematch-request',
      request_status: 'created',
      requester_seat: 'player-one',
      responded_at: '2026-07-30T20:30:51.000Z',
      source_game_id: 'amordle-public-practice-v3-test',
      time_limit_ms: null,
      updated_at: '2026-07-30T20:30:51.000Z',
      viewer_can_accept: false,
      viewer_can_cancel: false,
      viewer_role: 'opponent',
      word_length: 5,
    });

    expect(parsed.request_status).toBe('created');
    expect(parsed.created_game_id).toBe('amordle-rematch-v3-test');
  });
});
