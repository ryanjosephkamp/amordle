import { describe, expect, it } from 'vitest'

const migrations = import.meta.glob('../../supabase/migrations/*_phase56_private_request_center_and_anti_spam.sql', { eager: true, import: 'default', query: '?raw' }) as Record<string, string>

describe('Phase 56 private request migration contract', () => {
  const sql = Object.values(migrations)[0] ?? ''

  it('uses owner-private preferences and directional blocks', () => {
    expect(sql).toContain('create table if not exists public.multiplayer_private_request_preferences')
    expect(sql).toContain('create table if not exists public.multiplayer_private_request_blocks')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('blocker_user_id')
    expect(sql).toContain('blocked_user_id')
  })

  it('enforces one active directional requester-target-mode lane and preserves rate limits', () => {
    expect(sql).toMatch(/requester_user_id[\s\S]+opponent_user_id[\s\S]+mode/)
    expect(sql).toContain("where status = 'requested'")
    expect(sql).toContain('Too many active outgoing private match requests.')
    expect(sql).toContain('Too many recent private match requests.')
  })

  it('keeps browser functions narrow and explicitly revokes public and anon execution', () => {
    expect(sql).toContain("set search_path = ''")
    expect(sql).toMatch(/revoke all on function[\s\S]+from public/)
    expect(sql).toMatch(/revoke all on function[\s\S]+from public, anon/)
    expect(sql).toContain('grant execute on function')
    expect(sql).not.toContain('service_role_key')
  })
})
