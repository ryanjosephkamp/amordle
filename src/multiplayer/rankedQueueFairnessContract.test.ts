import { describe, expect, it } from 'vitest'
import FIFO_MIGRATION_SQL from '../../supabase/migrations/20260708202000_phase50_ranked_practice_fifo_matchmaking.sql?raw'

describe('ranked queue FIFO migration contract', () => {
  it('preserves the browser-facing claim RPC signature and response shape', () => {
    expect(FIFO_MIGRATION_SQL).toContain('create or replace function public.claim_ranked_async_matchmaking_pair')
    expect(FIFO_MIGRATION_SQL).toContain('p_request_id text')
    expect(FIFO_MIGRATION_SQL).toContain('p_matched_game_id text default null')
    expect(FIFO_MIGRATION_SQL).toContain('returns table (')
    expect(FIFO_MIGRATION_SQL).toContain('request_id text')
    expect(FIFO_MIGRATION_SQL).toContain('opponent_request_id text')
    expect(FIFO_MIGRATION_SQL).toContain('matched_game_id text')
    expect(FIFO_MIGRATION_SQL).toContain('request_status text')
  })

  it('keeps same-settings compatibility filters before first-come, first-served ordering', () => {
    const compatibilityIndex = FIFO_MIGRATION_SQL.indexOf('candidate.hard_mode = v_request.hard_mode')
    const orderIndex = FIFO_MIGRATION_SQL.indexOf('order by')
    const queueAgeIndex = FIFO_MIGRATION_SQL.indexOf('candidate.queued_at', orderIndex)
    const candidateIdIndex = FIFO_MIGRATION_SQL.indexOf('candidate.id', orderIndex)

    expect(FIFO_MIGRATION_SQL).toContain('candidate.mode = v_request.mode')
    expect(FIFO_MIGRATION_SQL).toContain('candidate.rating_bucket = v_request.rating_bucket')
    expect(FIFO_MIGRATION_SQL).toContain('candidate.word_length = v_request.word_length')
    expect(FIFO_MIGRATION_SQL).toContain('candidate.time_limit_ms is not distinct from v_request.time_limit_ms')
    expect(compatibilityIndex).toBeGreaterThan(0)
    expect(compatibilityIndex).toBeLessThan(orderIndex)
    expect(queueAgeIndex).toBeGreaterThan(orderIndex)
    expect(queueAgeIndex).toBeLessThan(candidateIdIndex)
  })

  it('does not use recent-opponent or rating-distance preference in current pairing', () => {
    expect(FIFO_MIGRATION_SQL).not.toContain('phase43_is_recent_ranked_practice_opponent')
    expect(FIFO_MIGRATION_SQL).not.toContain('phase27_ranked_search_band')
    expect(FIFO_MIGRATION_SQL).not.toContain('abs(candidate.rating_snapshot - v_request.rating_snapshot)')
    expect(FIFO_MIGRATION_SQL).toContain('for update skip locked')
    expect(FIFO_MIGRATION_SQL).toContain("Phase 50 preserves the public signature and compatibility filters while matching the oldest compatible queued opponent first.")
  })
})
