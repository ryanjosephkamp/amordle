import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('../../supabase/migrations/*_post_phase58_ranked_practice_claim_idempotence.sql', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

function loadMigration(): { readonly filename: string; readonly sql: string } {
  const entries = Object.entries(MIGRATIONS)
  expect(entries).toHaveLength(1)
  const [path, sql] = entries[0]
  return {
    filename: path.split('/').at(-1) ?? '',
    sql,
  }
}

describe('ranked Practice claim idempotence migration contract', () => {
  it('returns only an authenticated caller-owned complete Practice match that already exists', () => {
    const { filename, sql } = loadMigration()

    expect(filename).toMatch(/^\d{14}_post_phase58_ranked_practice_claim_idempotence\.sql$/u)
    expect(sql).toMatch(/create or replace function public\.claim_ranked_async_matchmaking_pair\(/iu)
    expect(sql).toMatch(/security definer[\s\S]{0,120}set search_path = ''/iu)
    expect(sql).toMatch(/if not found or v_request\.user_id <> v_user_id then[\s\S]*Ranked queue request is not owned by current user/iu)
    expect(sql).toMatch(/if v_request\.scope = 'practice' then[\s\S]*where queue_row\.id = p_request_id[\s\S]*for update/iu)
    expect(sql).toMatch(/if v_request\.status = 'matched' then[\s\S]*v_matched_game_id := coalesce\([\s\S]*v_request\.matched_game_id[\s\S]*v_request\.matched_match_id/iu)
    expect(sql).toMatch(/where coalesce\(nullif\(queue_row\.matched_game_id, ''\), nullif\(queue_row\.matched_match_id, ''\)\) = v_matched_game_id[\s\S]*queue_row\.status = 'matched'/iu)
    expect(sql).toMatch(/if v_pair_rows = 2 and v_pair_users = 2 and found then[\s\S]*return query select v_request\.id, v_opponent\.id, v_matched_game_id, 'matched'::text/iu)
  })

  it('preserves queued FIFO matching and the existing rejection and permission boundaries', () => {
    const { sql } = loadMigration()

    expect(sql).toMatch(/if v_request\.status <> 'queued' then[\s\S]*Ranked queue request is not queued\.[\s\S]*errcode = '22023'/iu)
    expect(sql).toMatch(/candidate\.scope = 'practice'[\s\S]*candidate\.mode = v_request\.mode[\s\S]*candidate\.rating_bucket = v_request\.rating_bucket[\s\S]*candidate\.hard_mode = v_request\.hard_mode[\s\S]*candidate\.word_length = v_request\.word_length[\s\S]*candidate\.time_limit_ms is not distinct from v_request\.time_limit_ms/iu)
    expect(sql).toMatch(/order by candidate\.queued_at, candidate\.id[\s\S]*for update skip locked/iu)
    expect(sql).toMatch(/if v_request\.scope <> 'daily' or v_request\.status <> 'queued' then/iu)
    expect(sql).toMatch(/revoke all on function public\.claim_ranked_async_matchmaking_pair\(text, text\) from public, anon, authenticated/iu)
    expect(sql).toMatch(/grant execute on function public\.claim_ranked_async_matchmaking_pair\(text, text\) to authenticated/iu)
  })
})
