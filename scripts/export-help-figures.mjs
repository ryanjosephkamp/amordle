/*
 * Exports the Help-page figure frames as JSON, for the blog article to replay.
 *
 * The point is that it EXPORTS rather than re-authors. Every colour, keyboard
 * state and price in these frames is computed by the game's own `scoreGuess`,
 * `deriveKeyboardEvidence`, `playableAttemptBudget` and `continuationCost` —
 * that is why src/features/support/help-figures/scripts.ts is a DOM-free module
 * in the first place. Hand-copying the frames into the blog would have thrown
 * that property away and left two sets of rules to keep in step.
 *
 * esbuild does the TypeScript and the `@/` alias; the builders are imported and
 * called, not reimplemented. Run it whenever the figures change.
 */
import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const stage = mkdtempSync(join(tmpdir(), 'amordle-figures-'));

try {
  /*
   * The platform binary directly, not `node_modules/.bin/esbuild`.
   *
   * esbuild is a transitive dependency here, so it is neither importable from
   * the root nor reliably runnable through its shim: that shim is a shell
   * script which hands the file to node, and under this pnpm layout the file it
   * hands over is the raw Mach-O executable, which node tries to parse as
   * JavaScript. Resolving the platform package skips both problems.
   */
  const [binary] = globSync('node_modules/.pnpm/@esbuild+*/node_modules/@esbuild/*/bin/esbuild', {
    cwd: root,
  });
  if (!binary) throw new Error('esbuild platform binary not found under node_modules/.pnpm');

  const bundle = join(stage, 'figures.mjs');
  execFileSync(
    resolve(root, binary),
    [
      resolve(root, 'src/features/support/help-figures/scripts.ts'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--tsconfig=${resolve(root, 'tsconfig.json')}`,
      `--outfile=${bundle}`,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );

  const scripts = await import(pathToFileURL(bundle).href);

  // The tool prices travel with the frames for the same reason the frames are
  // exported rather than copied: the blog must not restate a number the game owns.
  const economyBundle = join(stage, 'economy.mjs');
  execFileSync(
    resolve(root, binary),
    [
      resolve(root, 'src/domain/economy.ts'),
      '--bundle',
      '--platform=node',
      '--format=esm',
      `--tsconfig=${resolve(root, 'tsconfig.json')}`,
      `--outfile=${economyBundle}`,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const { ECONOMY_PRICES, continuationCost } = await import(pathToFileURL(economyBundle).href);

  /*
   * The continuation curve, evaluated rather than described. The article plots
   * it, and plotting a formula the blog restated would be the same drift the
   * exporter exists to avoid — so the game computes every point.
   *
   * Three word lengths at zero completion, across the first six continuations.
   */
  const continuationCurve = [5, 11, 21].map((wordLength) => ({
    wordLength,
    points: Array.from({ length: 6 }, (_unused, continuationCount) => ({
      continuationCount,
      cost: continuationCost({ wordLength, completionPercentage: 0, continuationCount }),
    })),
  }));

  const payload = {
    generatedFrom: 'src/features/support/help-figures/scripts.ts',
    pacing: {
      TYPE_MS: scripts.TYPE_MS,
      SETTLE_MS: scripts.SETTLE_MS,
      ROW_HOLD: scripts.ROW_HOLD,
      HANDOFF_MS: scripts.HANDOFF_MS,
      PUZZLE_HOLD: scripts.PUZZLE_HOLD,
      TOOL_MS: scripts.TOOL_MS,
    },
    continuePrice: scripts.continueFigurePrice(),
    prices: ECONOMY_PRICES,
    continuationCurve,
    // The Elo constants the article's expected-score chart uses, taken from the
    // migration that actually settles ratings rather than restated in the blog.
    rating: (() => {
      const sql = readFileSync(
        resolve(
          root,
          'supabase/migrations/20260814120000_amordle_system_settlement_and_reaper_v1.sql',
        ),
        'utf8',
      );
      const provisional = /then\s+(\d+)\s+else\s+(\d+)\s+end/.exec(sql);
      const scale = /\/\s*(\d+)\)\)/.exec(sql.slice(sql.indexOf('v_left_expected')));
      if (!provisional || !scale) throw new Error('could not read Elo constants from the migration');
      return {
        provisionalK: Number(provisional[1]),
        standardK: Number(provisional[2]),
        scale: Number(scale[1]),
      };
    })(),
    figures: {
      go: scripts.buildGoFrames(),
      combat: scripts.buildCombatFrames(),
      reveal: scripts.buildRevealFrames(),
      remove: scripts.buildRemoveFrames(),
      daily: scripts.buildDailyFrames(),
      continue: scripts.buildContinueFrames(),
    },
  };

  for (const [name, frames] of Object.entries(payload.figures)) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new Error(`figure ${name} produced no frames`);
    }
  }

  const out = process.argv[2] ?? resolve(root, 'help-figures.json');
  writeFileSync(out, `${JSON.stringify(payload)}\n`);

  const counts = Object.entries(payload.figures)
    .map(([name, frames]) => `${name} ${frames.length}`)
    .join(', ');
  process.stdout.write(`WROTE ${out}\n${counts}\ncontinue price ${payload.continuePrice}\n`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
