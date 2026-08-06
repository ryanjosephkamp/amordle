# v7 Phase 3 — motion, states, cleanup

Date: 2026-08-06
Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
Revert point: `amordle-v6.7-accepted-revert-point-2026-08-06` → `740ca5e`
Follows: `reports/v7-phase2-surfaces-2026-08-06/`

The final phase of the v7 frontend design elevation: the additive motion layer, the state surfaces
the app never had, and removal of the superseded generation of CSS now that nothing depends on it.

## 1. Motion

Before v7 the app had **two transition declarations in total** against roughly a hundred hover,
focus, active, disabled, pressed and current-page state rules. Two durations and one curve now
cover all of them:

| Token | Value | Applied to |
| --- | --- | --- |
| `--duration-feedback` | 90ms | control background, border, ink and shadow on hover/focus/press |
| `--duration-surface` | 160ms | popover, dialog, backdrop and toast entry |
| `--ease-standard` | `ease-out` | both |

Surfaces that mount rather than toggle fade in. **Menus and dialogs get opacity only** — they
appear directly under a pointer that is about to click them, and moving a target as it arrives is
worse than not moving it. Toasts enter from the page edge, where a 4px rise reads as arrival.

**Deliberately excluded:** tiles, and anything on the path between a keypress and the board.
Key-to-tile response is held under 100ms at p95 by an existing test and nothing here goes near it.
The keyboard keeps the colour transition it already had — only its duration moved onto the scale,
so evidence still resolves the way it did.

**Reduced motion is now one block.** `tui-shell.css` carried a partial copy that set the transition
properties but omitted `animation-duration` and `animation-iteration-count`, so which rules
actually stopped depended on which file won. The `globals.css` block is now the only one.

## 2. State surfaces

- **`src/app/loading.tsx`** — the App Router had no `loading.tsx` anywhere, so a suspending route
  fell through to the layout's fallback: the literal string "Loading…", unstyled, with no status
  role. It now renders the skeleton primitive the app already ships. It deliberately renders no
  `<main>` and no `<h1>`: the shell owns the main landmark, and a heading of "Loading" would
  displace the real route title for anyone navigating by heading.
- **`src/app/error.tsx`** — there was no error boundary at any level, so a render throw fell
  through to the framework overlay in development and a blank document in production. A failed
  route now stays inside the product, with `reset()` to retry the segment and a Home link as the
  escape hatch.
- The layout's own Suspense fallback (which covers the shell suspending, before the main landmark
  exists) uses the same skeleton.
- `player-directory` now shows a list-shaped placeholder rather than a bare `Loading players…`.
- **`.field-help`, `.field-error` and `.form-error` had no rules at all** outside one scoped
  `.accent-fieldset > .field-error`. Every other use rendered as a default browser paragraph, so
  help text sat at the same weight as the label above it and an error was distinguishable only by
  its wording. They are now a matched pair, with error carrying the danger colour **and** a `!`
  marker so it never depends on colour alone.

## 3. Cleanup

**452 lines of superseded CSS removed**, in two passes, each verified rather than assumed.

**Pass one — unreachable class selectors.** Cross-referenced all 319 class selectors against every
token appearing anywhere in `src/`. Twenty never appeared. Two of those were **false positives that
a naive sweep would have deleted**, and both would have caused real damage:

- `.is-removed` — built dynamically as `` `key is-${state}` ``, so it is the live keyboard
  removed-letter state. Tokenizing source text cannot see it.
- `.is-pane` — never constructed today, but a documented, supported `WorkbenchRegion` variant that
  `DESIGN.md` explicitly reserves for "content that genuinely needs containment". Unused API is not
  dead code.

`.is-viewer` and `.is-opponent` needed care for the opposite reason: `is-opponent` *is* produced
live by the COMBAT transcript, but every rule naming it here was scoped under the superseded
`.dual-board`, so it went with that ancestor rather than being listed for deletion in its own right.

The remaining sixteen were removed: the faux-macOS window chrome (`.terminal-titlebar`,
`.traffic-lights`, `.window-title`, `.window-session`, `.terminal-statusbar`), `.dual-board` and
its side-by-side board family, `.mobile-nav`, `.context-rail`, the bare `.topbar`,
`.calendar-strip`, `.compact-board`, `.seeded-evidence`, `.region-corner`, `.stats-rating-table`,
`.save-state`, and `.workbench-region-footer`.

**Pass two — dead by override.** Class analysis cannot find these; they were checked declaration by
declaration:

- `html { background: oklch(0.14 0.025 230) }` and the body's two decorative radial gradients —
  painted unconditionally outside any scheme query and already overridden by
  `html, body { background: var(--background) }`, so they never reached a rendered page in either
  scheme.
- `body::before` — a fixed decorative overlay, switched off by a `display: none` 1,500 lines later.
  Both the layer and the switch are gone.
- The `.app-shell` glass window — `min(96rem, calc(100% - 2rem))`, rounded corners, a blurred
  saturated backdrop and a drop shadow, every property of which was restated and cancelled by a
  second `.app-shell` rule further down. **`position: relative` was the one property that block did
  not override**, so it moved to the live rule rather than being deleted with the rest.

### A mistake worth recording

The first version of the remover had an off-by-one: when rewinding a multi-line selector run it
popped one line too many, silently eating the preceding closing brace. The build caught it
(`CssSyntaxError: Unclosed block`), but by then the damage was spread across 56 rules in three
files. I restored from a pre-edit backup rather than patching forward, rewrote the remover to
compute rule ranges up front instead of mutating an output buffer mid-stream, and added a
brace-balance assertion that aborts before writing. The second run was clean on the first attempt.

## 4. Tailwind: measured, and kept

The audit reported Tailwind as "~4.2KB of reset" — a *minified* figure that understated it. I
tested removal rather than estimating:

| | home CSS | solo CSS |
| --- | --- | --- |
| With Tailwind | 22,126 B | 26,485 B |
| Without | 18,735 B | 23,094 B |
| **Saving** | **3,391 B** | **3,391 B** |

Roughly **15% of route CSS**, gzipped — materially more than the audit implied.

But the removal is **not a no-op**: with the import dropped, the keyboard-fit matrix failed with
58px of overflow. Preflight is load-bearing here — the app depends on its margin, border and list
resets in places that do not set them explicitly.

**Recommendation: keep it for now.** The benefit is size headroom the project does not currently
need (the CSS budget is 50 KiB against 22 KiB used), and the cost is a hand-written reset whose
regressions would be subtle — default paragraph margins or list bullets returning on some of 26
routes — with no pixel baselines to catch them. Doing that at the tail of a cycle that just deleted
450 lines stacks two risks that should be taken separately. It is worth doing as its own small,
attentive change; the numbers above are the evidence for deciding.

The experiment was fully reverted and the suite re-run green.

## 5. Verification

| Command | Result |
| --- | --- |
| `pnpm check` | PASS — format, lint, typecheck, build, bootstrap 107/107, migrations 45/45 + 8/8, words 34/34, keyboard manual, boundaries, MP audit 73/73, parity 237/237, 3 HTTP interfaces, 92 CSS tokens resolve, budgets |
| `pnpm test:domain` | 22 files, 137 tests passed |
| `pnpm test:browser` | 1 file, 27 tests passed |
| `pnpm test:e2e:fixture` | 20 passed (chromium, firefox, webkit) |
| `pnpm test:visual` | 20 passed |

Holding specifically: control-contrast sweep at zero failures across 24 routes × 6 accents × 3
states × 2 schemes; **key-to-tile response under 100ms at p95**; 200% zoom, forced colors and
reduced motion all usable with zero serious/critical axe violations; LCP ≤2.5s, INP ≤200ms,
CLS ≤0.1; tile scale, board centring and keyboard fit across all eight play viewports; all Phase 2
geometry assertions.

### Bundle, across the whole cycle

| Route | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
| --- | --- | --- | --- | --- |
| `/` CSS | 24,201 B | 23,076 B | 23,425 B | **22,126 B** |
| solo CSS | 28,688 B | 27,543 B | 27,851 B | **26,485 B** |
| `/` JS | 192,888 B | 192,894 B | 193,014 B | 193,014 B |

**CSS is 2,075 B smaller than the accepted v6.7 baseline** (−8.6% on Home, −7.7% on solo), after
adding a token layer, a motion layer, a footer, and two new route files. JS is up 126 B — the
footer element and its registry-derived hint.

Source line counts: the three stylesheets total 7,236 lines against the baseline's 7,270 — but
358 of those are now explanatory comments, against roughly 60 before. Excluding comments, the rule
volume fell by about 330 lines.

## 6. Evidence — `fidelity/`

35 PNGs, the same 7 surfaces × 5 variants as every prior phase, directly comparable across all
four. `shell-home-1440x1024-dark.png` is worth a look specifically: it confirms the deleted
hardcoded dark backgrounds and gradients really were dead, because the dark scheme renders
identically without them.

## 7. State

Changes are **uncommitted**. Modified: `src/app/globals.css`, `src/app/tui-shell.css`,
`src/features/solo/solo-game.css`, `src/app/layout.tsx`, `src/components/app-shell.tsx`,
`src/features/home/home-attention.tsx`, `src/features/community/player-directory.tsx`,
`tests/e2e/fixture.solo.spec.ts`, `scripts/verify-bundle-budgets.mjs`. Added: `src/app/loading.tsx`,
`src/app/error.tsx`, and four `reports/v7-*` directories. Nothing committed, pushed, merged or
deployed.
