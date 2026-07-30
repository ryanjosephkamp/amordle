import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rankedPracticeQueueTransition, sameRankedPracticeConfig } from '@/domain/multiplayer';
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
});
