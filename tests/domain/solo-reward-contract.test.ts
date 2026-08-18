import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The reward formula now exists twice: once in TypeScript, where the client
 * computes what it believes a game earned, and once in PL/pgSQL, where the
 * server decides what it actually pays.
 *
 * Two copies of an arithmetic rule drift silently. That is not a hypothetical
 * here — it is exactly what happened to the consumable vocabulary, which was
 * internally consistent on both sides and wrong across the boundary, in
 * production, for the whole life of the economy. So this file compares the
 * migration TEXT with the TypeScript SOURCE TEXT. A restated copy of either
 * would drift along with the thing it was supposed to be pinning.
 *
 * What is being protected: if the two disagree, a player is quietly paid a
 * different number from the one the app showed them.
 */

const root = process.cwd();

const migration = readFileSync(
  path.resolve(root, 'supabase/migrations/20260818120000_amordle_solo_reward_authority_v1.sql'),
  'utf8',
);

const soloAdapter = readFileSync(path.resolve(root, 'src/adapters/cloud/solo.ts'), 'utf8');
const accountAdapter = readFileSync(path.resolve(root, 'src/adapters/cloud/account.ts'), 'utf8');

describe('the solo reward boundary', () => {
  it('pays the win formula the client displays', () => {
    // TypeScript: `session.status === 'won' ? 8 + puzzlesSolved * 4 : ...`
    expect(soloAdapter).toContain("session.status === 'won' ? 8 + puzzlesSolved * 4");
    // PL/pgSQL: `return 8 + v_solved * 4;`
    expect(migration).toMatch(/return 8 \+ v_solved \* 4;/);
  });

  it('pays the loss formula the client displays', () => {
    // TypeScript: `Math.min(4, puzzlesSolved)`
    expect(soloAdapter).toContain('Math.min(4, puzzlesSolved)');
    // PL/pgSQL: `return least(4, v_solved);`
    expect(migration).toMatch(/return least\(4, v_solved\);/);
  });

  it('derives the operation id the client used to send, so nothing is paid twice', () => {
    /*
     * The scheme is reproduced rather than improved on purpose. Every reward
     * already paid under the old client-side path is recorded under these ids,
     * and the operations table is keyed on (user_id, operation_id). A new
     * scheme would have re-paid every historical game exactly once, silently.
     */
    expect(accountAdapter).toContain("`solo-reward:${rowId.slice('solo:'.length)}`");
    expect(accountAdapter).toContain('`completion-reward:${rowId}`');
    expect(migration).toContain("'solo-reward:' || substring(p_history_row_id from 6)");
    expect(migration).toContain("'completion-reward:' || p_history_row_id");
  });

  it('only pays Solo, because COMBAT settles as rating rather than coins', () => {
    expect(migration).toContain("v_kind not in ('solo-practice', 'solo-daily')");
  });

  it('clamps the solved count to what the declared mode could have produced', () => {
    // The clamp is the bound. Without it a fabricated row could name any number
    // of solved puzzles and be paid four coins for each of them.
    expect(migration).toContain('v_solved := greatest(0, least(v_solved, v_max_puzzles));');
    expect(migration).toMatch(/v_go_count in \(5, 7, 10\)/);
  });

  it('no longer lets a browser choose its own award amount', () => {
    expect(migration).toContain(
      'revoke all on function public.credit_player_economy_coins(integer, text)',
    );
    // The grant must not be restored in the same breath.
    expect(migration).not.toMatch(/grant execute on function public\.credit_player_economy_coins/);
    // And nothing in the app may call it again.
    expect(accountAdapter).not.toContain("rpc('credit_player_economy_coins'");
  });

  it('says plainly that it bounds rather than closes the path', () => {
    /*
     * This assertion is about honesty, not behaviour, and it is deliberate.
     * `game_history.entry` is owner-writable, so a fabricated row still earns
     * what a real one would. A future reader who finds this migration and
     * concludes the economy is tamper-proof would be wrong, and the comment is
     * the only thing standing between them and that conclusion.
     */
    expect(migration).toContain('THIS BOUNDS THE EXPOSURE. IT DOES NOT REMOVE IT.');
  });
});
