import { describe, expect, it } from 'vitest'
import { GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY } from '../game/go/chainSelector'

const MIGRATIONS = import.meta.glob('../../supabase/migrations/*_phase58_go_chain_selector_v2.sql', {
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

describe('Phase 58 GO chain selector migration contract', () => {
  it('versions ranked Daily authority without rewriting existing rows', () => {
    const { filename, sql } = loadMigration()

    expect(filename).toMatch(/^\d{14}_phase58_go_chain_selector_v2\.sql$/u)
    expect(sql).toMatch(/alter table brrrdle_private\.ranked_daily_game_authority[\s\S]*add column if not exists answer_generation_version text not null default 'v1'/iu)
    expect(sql).toMatch(/answer_generation_version in \('v1', 'v2'\)/iu)
    expect(sql).not.toMatch(/update brrrdle_private\.ranked_daily_game_authority/iu)
    expect(sql).not.toMatch(/delete from brrrdle_private\.ranked_daily_game_authority/iu)
  })

  it('preserves the exact v1 selector behind a versioned dispatcher', () => {
    const { sql } = loadMigration()

    expect(sql).toMatch(/alter function brrrdle_private\.phase55_ranked_daily_answers\(text, text\)[\s\S]*rename to phase58_ranked_daily_answers_v1/iu)
    expect(sql).toMatch(/create or replace function brrrdle_private\.phase55_ranked_daily_answers\(\s*p_daily_date_key text,\s*p_mode text/iu)
    expect(sql).toMatch(/phase58_ranked_daily_answers_v1\(p_daily_date_key, p_mode\)/iu)
    expect(sql).toContain(GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY)
  })

  it('selects deterministic v2 GO lanes without replacement and excludes the unranked set from ranked', () => {
    const { sql } = loadMigration()

    expect(sql).toMatch(/create or replace function brrrdle_private\.phase58_ranked_daily_go_answers_v2\(/iu)
    expect(sql).toMatch(/create or replace function brrrdle_private\.phase58_mix_u32\(/iu)
    expect(sql).toContain('go-chain-v2:multiplayer:daily:unranked:')
    expect(sql).toContain('go-chain-v2:multiplayer:daily:ranked:')
    expect(sql).toMatch(/phase58_mix_u32\(\s*brrrdle_private\.phase55_fnv1a\(v_stream_key \|\| ':' \|\| catalog\.word\)\s*\)/iu)
    expect(sql).toMatch(/order by ranked\.rank_value, ranked\.word/iu)
    expect(sql).toMatch(/catalog\.word <> all \(v_unranked_answers\)/iu)
    expect(sql).toMatch(/limit 5/iu)
  })

  it('stamps private authority and answerless public projections with the canonical version', () => {
    const { sql } = loadMigration()

    expect(sql).toMatch(/create trigger phase58_stamp_ranked_daily_authority_version/iu)
    expect(sql).toMatch(/before insert or update on brrrdle_private\.ranked_daily_game_authority/iu)
    expect(sql).toMatch(/create trigger phase58_stamp_ranked_daily_projection_version/iu)
    expect(sql).toMatch(/before insert or update on public\.async_multiplayer_games/iu)
    expect(sql).toMatch(/jsonb_build_object\('answerGenerationVersion', v_version\)/iu)
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*answers/iu)
  })

  it('keeps every new helper private and avoids rating, queue, claim, or catalog mutations', () => {
    const { sql } = loadMigration()

    expect(sql).toMatch(/revoke all on function brrrdle_private\.phase58_ranked_daily_answers_v1\(text, text\)\s+from public, anon, authenticated/iu)
    expect(sql).toMatch(/revoke all on function brrrdle_private\.phase58_ranked_daily_go_answers_v2\(text, boolean\)\s+from public, anon, authenticated/iu)
    expect(sql).toMatch(/revoke all on function brrrdle_private\.phase58_mix_u32\(bigint\)\s+from public, anon, authenticated/iu)
    expect(sql).toMatch(/revoke all on function brrrdle_private\.phase55_ranked_daily_answers\(text, text\)\s+from public, anon, authenticated/iu)
    expect(sql).not.toMatch(/insert into brrrdle_private\.ranked_daily_word_catalog/iu)
    expect(sql).not.toMatch(/update public\.multiplayer_ratings/iu)
    expect(sql).not.toMatch(/multiplayer_matchmaking_queue/iu)
    expect(sql).not.toMatch(/multiplayer_daily_claims/iu)
  })
})
