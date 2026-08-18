import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ECONOMY_PRICES } from '@/domain/economy';

/*
 * The Daily unlock used to be two unrelated operations: a spend the client
 * priced, and a separate write of the entitlement into a table the owner may
 * update. Either could happen without the other, and the entitlement is what
 * decides whether the server will render a past Daily's answers.
 *
 * These assertions pin the three properties that fix cost something to obtain,
 * and that a later refactor could quietly give back.
 */

const root = process.cwd();

const migration = readFileSync(
  path.resolve(
    root,
    'supabase/migrations/20260818121000_amordle_daily_entitlement_authority_v1.sql',
  ),
  'utf8',
);

const calendar = readFileSync(path.resolve(root, 'src/features/solo/calendar-view.tsx'), 'utf8');
const soloAdapter = readFileSync(path.resolve(root, 'src/adapters/cloud/solo.ts'), 'utf8');
const identity = readFileSync(path.resolve(root, 'src/server/identity.ts'), 'utf8');

describe('the Daily unlock boundary', () => {
  it('prices the unlock on the server, at the number the dialog promises', () => {
    // The client constant is now a label on a confirmation dialog. This is the
    // price, and the two have to agree or the player is told one thing and
    // charged another.
    expect(migration).toMatch(
      new RegExp(`amordle_daily_unlock_price\\(\\)[\\s\\S]*?select ${ECONOMY_PRICES.dailyUnlock};`),
    );
  });

  it('charges and grants in one transaction', () => {
    const unlock = migration.slice(
      migration.indexOf('function public.unlock_daily_entitlement_v1'),
      migration.indexOf('function public.mark_daily_entitlement_unlocked_v1'),
    );
    expect(unlock).toContain(
      "phase57_apply_player_economy_operation(v_operation_id, 'spend', v_price)",
    );
    expect(unlock).toContain('insert into public.player_daily_entitlements');
  });

  it('keeps the entitlement out of reach of the browser', () => {
    expect(migration).toContain(
      'revoke all on table public.player_daily_entitlements from public, anon, authenticated',
    );
    // Read and write both go through RPCs; no direct grant may creep back in.
    expect(migration).not.toMatch(
      /grant (select|insert|update|delete).* on table public\.player_daily_entitlements/,
    );
  });

  it('reuses the operation id the old client path used, so a re-unlock cannot double-charge', () => {
    expect(migration).toContain(
      "'daily-unlock:' || to_char(p_local_date, 'YYYY-MM-DD') || ':' || v_mode",
    );
  });

  it('backfills what players already paid for', () => {
    // A migration that moved the field without carrying the rows would silently
    // relock every Daily anybody had ever bought.
    expect(migration).toContain(
      'insert into public.player_daily_entitlements (user_id, local_date, mode, state)',
    );
    expect(migration).toContain('from public.progress_snapshots snapshot');
    expect(migration).toContain('amordle-account-state-v1:');
  });

  it('leaves no writer pointing at the old owner-writable field', () => {
    expect(soloAdapter).not.toContain('export async function setDailyEntitlement');
    expect(calendar).toContain('unlockDailyEntitlement(selectedDate, mode)');
  });

  it('gates the answers on the table the server writes, not the one the player writes', () => {
    /*
     * canLoadDailyAnswers is the only place the entitlement is load-bearing:
     * it decides whether a past Daily's answers are shipped to the browser at
     * all. Reading it from the progress snapshot meant a player could grant
     * themselves the puzzle by writing a key into their own progress.
     */
    expect(identity).toContain("rpc('list_my_daily_entitlements_v1')");
    expect(identity).not.toContain('progress_snapshots');
  });
});
