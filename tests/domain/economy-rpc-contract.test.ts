import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONSUMABLE_RPC_SCOPE,
  CONSUMABLE_RPC_TYPE,
  ECONOMY_PRICES,
  type ConsumableProduct,
} from '@/domain/economy';

/*
 * This file exists because the two sides drifted apart and shipped.
 *
 * The client sent the `player_economy_state` column names and scope
 * 'solo-practice'; the RPC matches camelCase and demands scope 'practice'. Every
 * signed-in purchase raised `Invalid consumable` and every signed-in use raised
 * `Practice only`, in production, with no test anywhere that could notice —
 * because both sides were internally consistent and nothing compared them.
 *
 * So the check is deliberately against the migration TEXT rather than against a
 * constant restated in TypeScript. A constant would drift the same way.
 */

const migration = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260711051818_phase57_solo_practice_marketplace_and_consumables.sql',
  ),
  'utf8',
);

const products = Object.keys(CONSUMABLE_RPC_TYPE) as ConsumableProduct[];

describe('the economy RPC boundary', () => {
  it('sends consumable names the migration actually branches on', () => {
    for (const product of products) {
      const wireName = CONSUMABLE_RPC_TYPE[product];
      // The purchase branch: `when 'revealOneLetter' then 25`.
      expect(migration).toMatch(new RegExp(`when '${wireName}' then \\d+`));
      // The consume branch: `if p_consumable_type = 'revealOneLetter' then`.
      expect(migration).toContain(`p_consumable_type = '${wireName}'`);
    }
  });

  it('sends the only scope the consume guard accepts', () => {
    expect(migration).toContain(
      `if p_scope is null or p_scope <> '${CONSUMABLE_RPC_SCOPE}' then raise exception 'Practice only'`,
    );
  });

  it('never sends a column name where the migration expects a wire name', () => {
    // The failure that shipped: `reveal_one_letter` reaching `p_consumable_type`.
    for (const product of products) {
      expect(CONSUMABLE_RPC_TYPE[product]).not.toBe(product);
      expect(migration).not.toContain(`p_consumable_type = '${product}'`);
    }
  });

  it('quotes the prices the migration charges', () => {
    // ECONOMY_PRICES only ever labels a button; the server decides the charge.
    // If they disagree the page lies, so pin the two the server knows.
    expect(migration).toContain(
      `when '${CONSUMABLE_RPC_TYPE.reveal_one_letter}' then ${ECONOMY_PRICES.reveal}`,
    );
    expect(migration).toContain(
      `when '${CONSUMABLE_RPC_TYPE.remove_incorrect_letters}' then ${ECONOMY_PRICES.remove}`,
    );
  });

  it('constrains the ledger to the same wire names', () => {
    // player_economy_operations.consumable_type CHECK — a row the RPC writes
    // must satisfy it, so a third spelling would fail at insert time.
    expect(migration).toContain(
      `consumable_type in ('${CONSUMABLE_RPC_TYPE.reveal_one_letter}', '${CONSUMABLE_RPC_TYPE.remove_incorrect_letters}')`,
    );
  });
});
