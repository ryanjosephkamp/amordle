# v7 Phase 0 — instrumentation and pre-change baseline

Date: 2026-08-06
Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
Base commit: `e75e78b`
Revert point: `amordle-v6.7-accepted-revert-point-2026-08-06` → `740ca5e`

Phase 0 of the v7 frontend design elevation. **No presentation change.** The only source edit is
the bundle-budget verifier repair described below. The screenshots in `fidelity/` record the
appearance of the app immediately before Phase 1 begins.

## 1. `verify:budgets` repair

### The defect

`scripts/verify-bundle-budgets.mjs` reported `0B JS / 0B CSS` for both measured routes, so the
JS and CSS budgets were passing vacuously and nothing was constraining bundle size.

The script looked routes up by exact manifest key:

```js
manifest.entryJSFiles?.['[project]/src/app/page'] ?? []
```

Turbopack resolves `[project]` to the **inferred** project root — the directory of the nearest
lockfile walking upward, not the repository root. `/Users/noir/Documents/package.json` and
`package-lock.json` exist (containing only `supabase`), so the inferred root is `~/Documents` and
every real key carries an extra path segment:

```
[project]/amordle-final/src/app/page      ← actual
[project]/src/app/page                    ← what the script asked for
```

The lookup missed, `?? []` swallowed the miss, `gzipBytes([])` reduced to `0`, and `0 > 220KiB`
was false. The `Missing emitted asset` guard never fired because there were no assets to check.
Next itself reports this root inference during the build: _"Detected additional lockfiles"_.

### The fix

- Routes are resolved by **module suffix** (`src/app/page`) rather than by the whole key, so the
  lookup is correct under either inferred root.
- An unresolvable **or ambiguous** key is a hard failure. `resolveEntryKey` throws unless exactly
  one manifest entry matches.
- A measured `0B` for either JS or CSS is itself a hard failure, so this class of silent
  no-op cannot return.
- Measurement is the union of the root layout entry and the route entry, which is what the browser
  actually downloads for a first load. Next currently propagates the layout's assets into the page
  entry, so the union is a no-op today; taking it explicitly keeps the number meaningful if that
  propagation changes.

Verified: patching the route suffix to a non-existent module exits `1` instead of printing `PASS`.

### Measured first-load, gzipped (Node 24.18.0)

| Route | JS | JS budget | CSS | CSS budget | CSS headroom |
| --- | --- | --- | --- | --- | --- |
| `/` (home) | 192,888 B (188 KiB) | 220 KiB | 24,201 B (23.6 KiB) | 50 KiB | **26.4 KiB** |
| `/play/solo/practice/[mode]` (game) | 198,608 B (194 KiB) | 320 KiB | 28,688 B (28.0 KiB) | 65 KiB | **37.0 KiB** |

Both routes pass with real numbers. The CSS headroom is the figure that matters for Phases 1–3:
the token layer adds volume and the dead-CSS deletion removes it, and both are now measured.

**Note on reproducibility:** gzip output differs slightly between Node versions. Measured under
the pinned Node 24.18.0 via `scripts/node24.sh`, home JS is 192,888 B; under Node 25.2.1 the same
bytes compress to 191,573 B. Always compare budget numbers taken with the pinned runtime.

## 2. Gate confirmed green on the untouched tree

Run on 2026-08-06 with only the budget-script change present, so any later failure is attributable
to Phase 1 rather than to pre-existing drift.

| Command | Result |
| --- | --- |
| `pnpm check` | PASS — format, lint, typecheck, build, bootstrap 107/107, migrations 45/45 + 8/8, word authority 34/34, keyboard manual, boundaries, MP audit 73/73, parity 237/237, 3 HTTP interfaces, 67 CSS tokens resolve, budgets |
| `pnpm test:domain` | 22 files, 137 tests passed |
| `pnpm test:browser` | 1 file, 27 tests passed |
| `pnpm test:e2e:fixture` | 20 passed (chromium, firefox, webkit) |
| `pnpm test:visual` | 20 passed, including both control-contrast sweeps (light and dark) |

`test:e2e:services` was not run — it requires a protected Vercel Preview plus a service-role key
and cannot run locally. It is reserved for `pnpm test:acceptance` at the end of each phase.

## 3. Baseline screenshots — `fidelity/`

35 PNGs: the 7 `professionalSurfaces` × the 5 `professionalVariants` defined in
`tests/e2e/visual.responsive.spec.ts:17` and `:235`. Emitted by the fidelity matrix test on this
run and copied here because `test-results/` is git-ignored and overwritten by the next run.

Surfaces: `shell-home` (`/`) · `solo` (`/play/solo/practice/og`) · `daily-economy` (`/calendar`) ·
`combat` (`/combat`) · `account-data` (`/stats`) · `words-support` (`/words`) ·
`exceptional-states` (`/history`).

Variants: `1440x1024-light` · `1440x1024-dark` · `390x844-mobile` · `320x844-stress`
(dark, reduced motion) · `200-percent-forced-colors` (720×900, zoom 2, forced colors).

These are evidence, not assertions. No test compares against them; the repository has no Playwright
pixel baselines (`toHaveScreenshot` / `toMatchSnapshot` appear nowhere in `tests/`). They exist so
each later phase can be compared against the accepted v6.7 appearance by eye.

## 4. Observed, not changed

- **`next-env.d.ts` churns on every build.** `next.config.ts:26` sets
  `distDir: process.env.VERCEL ? '.next' : 'dist'`, so a local `pnpm build` rewrites the file's
  import to `./dist/types/routes.d.ts` while the committed version points at `./.next/...`. This
  dirties the working tree on every local build and must be reverted before committing. It is the
  same class of leak as the earlier `tsconfig.json` revert (`2c6980c`). Left alone here — it is
  outside the design cycle, but worth a separate decision.
- **`pnpm` warns `Unsupported engine`** on every script because the system Node is 25.2.1 while
  the project pins 24.18.0. Harmless: `scripts/node24.sh` selects the pinned runtime from
  `.tooling/` regardless. Only the pnpm wrapper itself runs on the system Node.
- **Stale committed artifacts.** `tests/browser/__screenshots__/components.test.tsx/` holds 8
  tracked PNGs that are Vitest browser-mode failure captures, not assertion baselines —
  `components.test.tsx` contains no screenshot call. They are inert; no test reads them.
