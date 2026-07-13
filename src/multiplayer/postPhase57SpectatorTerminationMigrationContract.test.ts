import { describe, expect, it } from 'vitest'

const migrations = import.meta.glob('../../supabase/migrations/*_post_phase57_spectator_termination_transparency.sql', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

function readMigration(): string {
  const sql = Object.values(migrations)
  expect(sql).toHaveLength(1)
  return sql[0]
}

describe('post-Phase-57 spectator termination migration contract', () => {
  it('replaces only the two established spectator projection functions', () => {
    const sql = readMigration()

    expect(sql.match(/create or replace function public\./gi)).toHaveLength(2)
    expect(sql).toMatch(/get_authenticated_live_v1_spectator_games_v2\s*\(/i)
    expect(sql).toMatch(/get_public_live_v1_spectator_games_v1\s*\(/i)
    expect(sql).not.toMatch(/create\s+table|alter\s+table|create\s+policy|drop\s+function/i)
  })

  it('projects safe cancellation and forfeit reasons without broadening private data', () => {
    const sql = readMigration()

    expect(sql).toMatch(/'terminationReason'/)
    expect(sql).toMatch(/'forfeitedSeat'/)
    expect(sql).toMatch(/status\s*=\s*'cancelled'[\s\S]*player_two_user_id\s+is\s+not\s+null/i)
    expect(sql).toMatch(/forfeitedPlayerId/)
    expect(sql).not.toMatch(/'playerSessions'|'answerWords'|'playerUserIds'|->>\s*'answer'/)
  })

  it('preserves current Daily exclusion and exact role grants', () => {
    const sql = readMigration()

    expect(sql).toMatch(/game\.scope\s*<>\s*'daily'/i)
    expect(sql).toMatch(/game\.daily_date_key\s*<>\s*settings\.current_daily_date_key/i)
    expect(sql).toMatch(/where game\.scope\s*=\s*'practice'/i)
    expect(sql).toMatch(/revoke all on function public\.get_authenticated_live_v1_spectator_games_v2\(integer, integer\) from public/i)
    expect(sql).toMatch(/grant execute on function public\.get_authenticated_live_v1_spectator_games_v2\(integer, integer\) to authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.get_public_live_v1_spectator_games_v1\(integer, integer, text\)\s+to anon, authenticated/i)
  })
})
