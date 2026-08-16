import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The Elo numbers are settled by Postgres, and /methodology publishes them as
 * fact. There used to be a second copy of them in `src/domain/rating.ts` that
 * nothing imported except a test — so the test proved that the duplicate agreed
 * with itself, which is the one thing that could never be in doubt.
 *
 * Worse, the copy was subtly wrong. JavaScript's `Math.round` breaks exact
 * halves upward (`Math.round(-0.5)` is `-0`), while Postgres `round()` on
 * numeric breaks them away from zero (`round(-0.5)` is `-1`). A settlement
 * landing exactly on .5 would have disagreed by a point.
 *
 * The duplicate is gone. This asserts the real values against the migration
 * TEXT, the same way the economy and creator-identity contracts do, so that
 * changing the settlement without changing the page is a failing test.
 */

const settlement = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260814120000_amordle_system_settlement_and_reaper_v1.sql',
  ),
  'utf8',
);

const seed = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260604033000_phase23_competitive_multiplayer.sql',
  ),
  'utf8',
);

/** Whitespace in SQL is not meaningful, and prettier does not format it. */
function normalized(sql: string): string {
  return sql.replaceAll(/\s+/g, ' ');
}

describe('rating settlement contract', () => {
  it('computes the expected score on a 400-point scale', () => {
    expect(normalized(settlement)).toContain(
      'v_left_expected := 1 / (1 + power(10::numeric, (v_right_profile.rating - v_left_profile.rating)::numeric / 400));',
    );
    expect(normalized(settlement)).toContain('v_right_expected := 1 - v_left_expected;');
  });

  it('uses K = 40 while provisional and K = 24 after ten games, per player', () => {
    for (const side of ['left', 'right']) {
      expect(normalized(settlement)).toContain(
        `v_${side}_k := case when v_${side}_profile.games_played < 10 then 40 else 24 end;`,
      );
    }
  });

  it('applies the change as round(K x (S - E))', () => {
    for (const side of ['left', 'right']) {
      expect(normalized(settlement)).toContain(
        `v_${side}_delta := round(v_${side}_k * (v_${side}_score - v_${side}_expected))::integer;`,
      );
    }
  });

  it('scores a win, a loss, and a draw as 1, 0 and 0.5', () => {
    expect(normalized(settlement)).toContain('v_left_score := 1; v_right_score := 0;');
    expect(normalized(settlement)).toContain('v_left_score := 0; v_right_score := 1;');
    expect(normalized(settlement)).toContain('v_left_score := 0.5; v_right_score := 0.5;');
  });

  it('stops calling a rating provisional at the tenth game', () => {
    expect(normalized(settlement)).toContain('provisional = games_played + 1 < 10');
  });

  it('seeds a new rating at 1200', () => {
    expect(normalized(seed)).toMatch(/rating\s+integer\s+not null default 1200/i);
  });

  it('publishes nothing on the methodology page that the migration does not say', () => {
    // The page's own claims, checked against their source rather than restated.
    const page = readFileSync(path.resolve(process.cwd(), 'src/app/methodology/page.tsx'), 'utf8');
    expect(page).toContain('K = 40');
    expect(page).toContain('K = 24');
    expect(page).toContain('1200');
    expect(normalized(settlement)).toContain('then 40 else 24 end;');
  });
});
