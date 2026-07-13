import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('../../supabase/migrations/*_phase55_ranked_daily_multiplayer.sql', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const CONTRACT_REPAIR_MIGRATIONS = import.meta.glob('../../supabase/migrations/*_phase55_ranked_daily_contract_repair.sql', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const QUEUE_MATCHED_AT_REPAIR_MIGRATIONS = import.meta.glob('../../supabase/migrations/*_phase55_ranked_daily_queue_matched_at_repair.sql', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const CLEANUP_ORPHAN_REPAIR_MIGRATIONS = import.meta.glob('../../supabase/migrations/*_phase55_ranked_daily_cleanup_orphan_repair.sql', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const FINALIZATION_AUTHORITY_REPAIR_MIGRATIONS = import.meta.glob('../../supabase/migrations/*_phase55_ranked_daily_finalization_authority_repair.sql', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const CLEANUP_FIXTURE = import.meta.glob('../../e2e/fixtures/cleanup.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const SUPABASE_ADMIN_FIXTURE = import.meta.glob('../../e2e/fixtures/supabaseAdmin.ts', {
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

function loadContractRepairMigration(): { readonly filename: string; readonly sql: string } {
  const entries = Object.entries(CONTRACT_REPAIR_MIGRATIONS)
  expect(entries).toHaveLength(1)
  const [path, sql] = entries[0]
  return {
    filename: path.split('/').at(-1) ?? '',
    sql,
  }
}

function loadRawSource(modules: Record<string, string>): string {
  const entries = Object.values(modules)
  expect(entries).toHaveLength(1)
  return entries[0]
}

function loadQueueMatchedAtRepairMigration(): { readonly filename: string; readonly sql: string } {
  const entries = Object.entries(QUEUE_MATCHED_AT_REPAIR_MIGRATIONS)
  expect(entries).toHaveLength(1)
  const [path, sql] = entries[0]
  return {
    filename: path.split('/').at(-1) ?? '',
    sql,
  }
}

function loadCleanupOrphanRepairMigration(): { readonly filename: string; readonly sql: string } {
  const entries = Object.entries(CLEANUP_ORPHAN_REPAIR_MIGRATIONS)
  expect(entries).toHaveLength(1)
  const [path, sql] = entries[0]
  return {
    filename: path.split('/').at(-1) ?? '',
    sql,
  }
}

function loadFinalizationAuthorityRepairMigration(): { readonly filename: string; readonly sql: string } {
  const entries = Object.entries(FINALIZATION_AUTHORITY_REPAIR_MIGRATIONS)
  expect(entries).toHaveLength(1)
  const [path, sql] = entries[0]
  return {
    filename: path.split('/').at(-1) ?? '',
    sql,
  }
}

function loadEmbeddedCatalog(sql: string, tag: string): readonly string[] {
  const match = sql.match(new RegExp(`\\$${tag}\\$(\\[[\\s\\S]*?\\])\\$${tag}\\$`))
  expect(match?.[1]).toBeTruthy()
  return JSON.parse(match![1]) as readonly string[]
}

describe('Phase 55 ranked Daily migration contract', () => {
  it('adds a lossless ranked claim dimension and keeps legacy callers unranked-only', () => {
    const { sql } = loadMigration()

    expect(sql).toMatch(/alter table public\.multiplayer_daily_claims[\s\S]*add column if not exists ranked boolean/i)
    expect(sql).toMatch(/update public\.multiplayer_daily_claims[\s\S]*set ranked = false[\s\S]*where ranked is null/i)
    expect(sql).toMatch(/primary key \(user_id, transport, mode, daily_date_key, ranked\)/i)
    expect(sql).toMatch(/claim_daily_multiplayer_participation\(\s*p_user_id text,[\s\S]*p_source_id text,\s*p_ranked boolean/i)
    expect(sql).toMatch(/release_daily_multiplayer_claim\(\s*p_user_id text,[\s\S]*p_source_id text,\s*p_ranked boolean/i)
    expect(sql).toMatch(/claim_daily_multiplayer_participation\([\s\S]*p_source_id,[\s\S]*false[\s\S]*\);/i)
    expect(sql).toMatch(/release_daily_multiplayer_claim\([\s\S]*p_source_id,[\s\S]*false[\s\S]*\);/i)
    expect(sql).not.toMatch(/claim_daily_multiplayer_participation\([\s\S]*p_ranked boolean default/i)
    expect(sql).not.toMatch(/release_daily_multiplayer_claim\([\s\S]*p_ranked boolean default/i)
    expect(sql).not.toMatch(/grant execute on function public\.claim_daily_multiplayer_participation\(text, text, text, text, text, text, boolean\)/i)
    expect(sql).not.toMatch(/grant execute on function public\.release_daily_multiplayer_claim\(text, text, text, text, text, text, boolean\)/i)
    expect(sql).toMatch(/where public\.multiplayer_daily_claims\.source_id = excluded\.source_id/i)
    expect(sql).not.toMatch(/where public\.multiplayer_daily_claims\.source_kind = excluded\.source_kind/i)
  })

  it('adds authenticated Daily queue authority while retaining Practice FIFO', () => {
    const { sql } = loadMigration()

    expect(sql).toContain('create_ranked_async_matchmaking_request_v2')
    expect(sql).toContain('get_ranked_async_matchmaking_status')
    expect(sql).toContain('finalize_ranked_async_matchmaking_game')
    expect(sql).toContain('settle_ranked_async_multiplayer_match')
    expect(sql).toMatch(/scope = 'daily'/i)
    expect(sql).toMatch(/daily_date_key/i)
    expect(sql).toMatch(/word_length (?:<>|=) 5/i)
    expect(sql).toMatch(/time_limit_ms is (?:not )?null/i)
    expect(sql).toContain('async:og:daily:v1')
    expect(sql).toContain('async:go:daily:v1')
    expect(sql).toMatch(/order by\s+candidate\.queued_at,\s+candidate\.id/i)
    expect(sql.match(/for update skip locked/gi)).toHaveLength(1)
    expect(sql).toMatch(/auth\.uid\(\)/i)
    expect(sql).toMatch(/security definer[\s\S]{0,120}set search_path = ''/i)
  })

  it('keeps ranked Daily outcome authority outside participant-writable projections', () => {
    const { sql } = loadMigration()

    expect(sql).toMatch(/create schema if not exists brrrdle_private/i)
    expect(sql).toMatch(/create table if not exists brrrdle_private\.ranked_daily_game_authority/i)
    expect(sql).toMatch(/create table if not exists brrrdle_private\.ranked_daily_action_ledger/i)
    expect(sql).toMatch(/create table if not exists brrrdle_private\.ranked_daily_word_catalog/i)
    expect(sql).toMatch(/revoke all on schema brrrdle_private from public, anon, authenticated/i)
    expect(sql).toMatch(/revoke all on all tables in schema brrrdle_private from public, anon, authenticated/i)
    expect(sql).toMatch(/create or replace function public\.save_ranked_daily_async_multiplayer_action\(/i)
    expect(sql).not.toMatch(/create or replace function public\.save_ranked_daily_async_multiplayer_game\(\s*p_game_projection jsonb/i)
    expect(sql).toMatch(/phase55_ranked_daily_tiles/i)
    expect(sql).toMatch(/phase55_ranked_daily_hard_mode_guess_is_valid/i)
    expect(sql).toMatch(/phase55_ranked_daily_answers/i)
    expect(sql).toMatch(/brrrdle_private\.ranked_daily_action_ledger/i)
    expect(sql).toMatch(/authority_row\.terminal_status/i)
    expect(sql).toMatch(/authority_row\.winner_player_id/i)
    expect(sql).toMatch(/from brrrdle_private\.ranked_daily_action_ledger/i)
    expect(sql).not.toMatch(/v_moves := v_game\.projection -> 'moves'/i)
    expect(sql).not.toMatch(/v_winner_player := nullif\(coalesce\(v_game\.winner_player_id/i)
    expect(sql).toMatch(/Async participants can update non-ranked-Daily games/i)
    expect(sql).toMatch(/Users can create non-ranked-Daily async games/i)
    expect(sql).toMatch(/not \(ranked = true and scope = 'daily'\)/i)
  })

  it('derives canonical answers and accepts only narrow idempotent participant actions', () => {
    const { sql } = loadMigration()

    expect(sql).toMatch(/insert into brrrdle_private\.ranked_daily_word_catalog/i)
    expect(sql).toMatch(/phase55_ranked_daily_answers\(\s*p_daily_date_key text,\s*p_mode text/i)
    expect(sql).toMatch(/v_answers := brrrdle_private\.phase55_ranked_daily_answers\(/i)
    expect(sql).not.toMatch(/v_answers := public\.phase55_ranked_daily_session_answers/i)
    expect(sql).toMatch(/p_expected_move_count integer/i)
    expect(sql).toMatch(/p_action_id text/i)
    expect(sql).toMatch(/p_guess text default null/i)
    expect(sql).toMatch(/p_forfeit boolean default false/i)
    expect(sql).toMatch(/unique \(game_id, action_id\)/i)
    expect(sql).toMatch(/action_type in \('guess', 'forfeit', 'cancel'\)/i)
    expect(sql).toMatch(/v_attempt_limit := case when authority_row\.mode = 'go'[\s\S]{0,100}then 6 - authority_row\.current_puzzle_index[\s\S]{0,40}else 6/i)
    expect(sql).toMatch(/phase55_ranked_daily_hard_mode_evidence/i)
    expect(sql).toMatch(/expected_version/i)
  })

  it('embeds the complete ordered five-letter answer and valid-guess catalogs', () => {
    const { sql } = loadMigration()
    const answers = loadEmbeddedCatalog(sql, 'phase55_answers')
    const validGuesses = loadEmbeddedCatalog(sql, 'phase55_valid_guesses')

    expect(answers).toHaveLength(2175)
    expect(validGuesses).toHaveLength(9776)
    expect(new Set(answers).size).toBe(2175)
    expect(new Set(validGuesses).size).toBe(9776)
    expect(answers.every((word) => /^[a-z]{5}$/u.test(word))).toBe(true)
    expect(validGuesses.every((word) => /^[a-z]{5}$/u.test(word))).toBe(true)
    expect(answers.every((word) => validGuesses.includes(word))).toBe(true)
  })

  it('serializes Daily queue and finalization races without exposing rival queue rows', () => {
    const { sql } = loadMigration()

    expect(sql).toMatch(/create unique index if not exists multiplayer_matchmaking_queue_ranked_daily_active_lane_uidx/i)
    expect(sql).toMatch(/pg_advisory_xact_lock/i)
    expect(sql).toMatch(/phase55_ranked_daily_lane_lock_key/i)
    expect(sql).toMatch(/create table if not exists brrrdle_private\.ranked_daily_pair_reservations/i)
    expect(sql).toMatch(/'ranked-async-game-' \|\| extensions\.gen_random_uuid\(\)::text/i)
    expect(sql).toMatch(/v_matched_game_id := 'ranked-async-game-' \|\| extensions\.gen_random_uuid\(\)::text;[\s\S]{0,240}insert into brrrdle_private\.ranked_daily_pair_reservations/i)
    expect(sql).toMatch(/order by queue_row\.id[\s\S]*for update/i)
    expect(sql).toMatch(/create policy "Users can read own matchmaking requests"[\s\S]{0,240}using \(\(select auth\.uid\(\)\) = user_id\)/i)
    expect(sql).not.toMatch(/create policy "Users can read own matchmaking requests"[\s\S]{0,240}status = 'queued'/i)
  })

  it('extends only the approved rating and leaderboard allowlists and documents rollback probes', () => {
    const { filename, sql } = loadMigration()

    expect(filename).toMatch(/^\d{14}_phase55_ranked_daily_multiplayer\.sql$/)
    expect(sql).toMatch(/get_public_ranked_leaderboard/i)
    expect(sql).toMatch(/multiplayer:og:daily:v1/i)
    expect(sql).toMatch(/multiplayer:go:daily:v1/i)
    expect(sql).toMatch(/rollback notes/i)
    expect(sql).toMatch(/remote probes/i)
    expect(sql).toMatch(/revoke all on function[\s\S]*from public/i)
    expect(sql).toMatch(/grant execute on function[\s\S]*to authenticated/i)
  })

  it('adds one immutable follow-up migration for cancellation-safe ranked Daily requeueing', () => {
    const { filename, sql } = loadContractRepairMigration()

    expect(filename).toMatch(/^\d{14}_phase55_ranked_daily_contract_repair\.sql$/)
    expect(sql).toMatch(/create or replace function public\.create_ranked_async_matchmaking_request_v2\(/i)
    expect(sql).toMatch(/v_insert_idempotency_key[\s\S]*extensions\.gen_random_uuid\(\)/i)
    expect(sql).not.toMatch(/set\s+status = 'queued',[\s\S]{0,400}status in \('cancelled', 'expired'\)/i)
    expect(sql).toMatch(/order by\s+candidate\.queued_at,\s+candidate\.id/i)
    expect(sql).toMatch(/for update skip locked/i)
  })

  it('keeps ranked Daily GO puzzle five active until solved', () => {
    const { sql } = loadContractRepairMigration()

    expect(sql).toMatch(/create or replace function public\.save_ranked_daily_async_multiplayer_action\(/i)
    expect(sql).toMatch(/v_final_go_puzzle boolean/i)
    expect(sql).toMatch(/v_final_go_puzzle := authority_row\.mode = 'go'[\s\S]{0,100}current_puzzle_index = 4/i)
    expect(sql).toMatch(/if not v_final_go_puzzle and v_player_attempts >= v_attempt_limit/i)
    expect(sql).toMatch(/elsif not v_final_go_puzzle[\s\S]{0,100}v_player_attempts >= v_attempt_limit[\s\S]{0,100}v_other_attempts >= v_attempt_limit/i)
  })

  it('constructs ranked Daily public projections from an explicit allowlist', () => {
    const { sql } = loadContractRepairMigration()

    expect(sql).toMatch(/create or replace function public\.finalize_ranked_async_matchmaking_game_v2\(/i)
    expect(sql).toMatch(/v_public_projection := jsonb_build_object\(/i)
    expect(sql).not.toMatch(/v_public_projection := p_game_projection/i)
    expect(sql).not.toMatch(/v_public_projection := v_public_projection\s*\|\|/i)
    expect(sql).toMatch(/unknown caller projection fields are intentionally discarded/i)
  })

  it('provides service-role-only ranked Daily authority cleanup before ordinary E2E cleanup', () => {
    const { sql } = loadContractRepairMigration()
    const cleanupSource = loadRawSource(CLEANUP_FIXTURE)
    const adminSource = loadRawSource(SUPABASE_ADMIN_FIXTURE)

    expect(sql).toMatch(/create or replace function public\.cleanup_ranked_daily_multiplayer_for_users\(/i)
    expect(sql).toMatch(/security definer[\s\S]{0,120}set search_path = ''/i)
    expect(sql).toMatch(/revoke all on function public\.cleanup_ranked_daily_multiplayer_for_users\(uuid\[\]\)\s+from public, anon, authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.cleanup_ranked_daily_multiplayer_for_users\(uuid\[\]\)\s+to service_role/i)
    expect(adminSource).toContain('cleanupRankedDailyMultiplayerForUsers')
    expect(cleanupSource.indexOf('cleanupRankedDailyMultiplayerForUsers')).toBeGreaterThan(-1)
    expect(cleanupSource.indexOf('cleanupRankedDailyMultiplayerForUsers')).toBeLessThan(
      cleanupSource.indexOf('deleteRankedQueueRowsForUsers'),
    )
    expect(cleanupSource).toMatch(/staleCleanupPromise \?\?= cleanupStaleE2eArtifacts\(\)\.catch\([\s\S]*staleCleanupPromise = undefined/i)
  })

  it('adds the queue timestamp required by ranked Daily claim and status functions', () => {
    const { filename, sql } = loadQueueMatchedAtRepairMigration()

    expect(filename).toMatch(/^\d{14}_phase55_ranked_daily_queue_matched_at_repair\.sql$/)
    expect(sql).toMatch(/alter table public\.multiplayer_matchmaking_queue[\s\S]*add column if not exists matched_at timestamptz/i)
    expect(sql).toMatch(/comment on column public\.multiplayer_matchmaking_queue\.matched_at/i)
    expect(sql).toMatch(/rollback notes/i)
  })

  it('cleans ranked Daily pair reservations even when finalization never created authority', () => {
    const { filename, sql } = loadCleanupOrphanRepairMigration()

    expect(filename).toMatch(/^\d{14}_phase55_ranked_daily_cleanup_orphan_repair\.sql$/)
    expect(sql).toMatch(/create or replace function public\.cleanup_ranked_daily_multiplayer_for_users\(/i)
    expect(sql).toMatch(/from brrrdle_private\.ranked_daily_pair_reservations reservation[\s\S]*player_one_user_id = any\(p_user_ids\)/i)
    expect(sql).toMatch(/delete from brrrdle_private\.ranked_daily_action_ledger[\s\S]*delete from brrrdle_private\.ranked_daily_game_authority[\s\S]*delete from brrrdle_private\.ranked_daily_pair_reservations/i)
    expect(sql).toMatch(/grant execute on function public\.cleanup_ranked_daily_multiplayer_for_users\(uuid\[\]\)\s+to service_role/i)
    expect(sql).toMatch(/rollback notes/i)
  })

  it('builds ranked Daily finalization evidence from the locked server reservation', () => {
    const { filename, sql } = loadFinalizationAuthorityRepairMigration()

    expect(filename).toMatch(/^\d{14}_phase55_ranked_daily_finalization_authority_repair\.sql$/)
    expect(sql).toMatch(/create or replace function public\.finalize_ranked_async_matchmaking_game_v2\(/i)
    expect(sql).toMatch(/from brrrdle_private\.ranked_daily_pair_reservations reservation[\s\S]*where reservation\.game_id = p_matched_game_id[\s\S]*for update/i)
    expect(sql).toMatch(/v_public_projection := jsonb_build_object\([\s\S]*'id', v_reservation\.game_id[\s\S]*'mode', v_reservation\.mode[\s\S]*'hardMode', v_reservation\.hard_mode/i)
    expect(sql).not.toMatch(/'id', p_game_projection ->> 'id'/i)
    expect(sql).toMatch(/unknown caller projection fields are intentionally discarded/i)
    expect(sql).toMatch(/rollback notes/i)
  })
})
