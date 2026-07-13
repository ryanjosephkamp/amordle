import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/20260711051818_phase57_solo_practice_marketplace_and_consumables.sql?raw'

describe('Phase 57 economy migration contract', () => {
  it('defines one private state/operation ledger and narrow authenticated RPCs', () => {
    expect(sql).toContain('create table if not exists public.player_economy_state')
    expect(sql).toContain('create table if not exists public.player_economy_operations')
    expect(sql).toContain('create or replace function public.get_player_economy_state()')
    expect(sql).toContain('create or replace function public.credit_player_economy_coins')
    expect(sql).toContain('create or replace function public.spend_player_economy_coins')
    expect(sql).toContain('create or replace function public.purchase_solo_practice_consumable')
    expect(sql).toContain('create or replace function public.consume_solo_practice_consumable')
  })

  it('keeps tables private and privileged functions locked to authenticated callers', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('set search_path = \'\'')
    expect(sql).toContain('revoke all on table public.player_economy_state from public, anon, authenticated')
    expect(sql).toContain('revoke all on table public.player_economy_operations from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.purchase_solo_practice_consumable')
    expect(sql).not.toContain('grant select on table public.player_economy_state to authenticated')
  })

  it('enforces fixed prices, Practice-only use, operation idempotency, and row locking', () => {
    expect(sql).toContain("when 'revealOneLetter' then 25")
    expect(sql).toContain("when 'removeIncorrectLetters' then 40")
    expect(sql).toContain("p_scope <> 'practice'")
    expect(sql).toContain('primary key (user_id, operation_id)')
    expect(sql).toContain('for update')
    expect(sql).toContain("progress->'progression'->>'coins'")
    expect(sql).toContain("progression'->>'economyRevision'")
    expect(sql).toContain('p_amount > 10000')
    expect(sql.indexOf('for update')).toBeLessThan(sql.indexOf('where user_id = v_user_id and player_economy_operations.operation_id'))
  })
})
