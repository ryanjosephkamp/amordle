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
});
