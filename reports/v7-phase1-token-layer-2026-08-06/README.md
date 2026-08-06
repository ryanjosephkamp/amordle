# v7 Phase 1 — the token layer

Date: 2026-08-06
Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
Revert point: `amordle-v6.7-accepted-revert-point-2026-08-06` → `740ca5e`
Follows: `reports/v7-phase0-baseline-2026-08-06/`

Phase 1 of the v7 frontend design elevation: one shared vocabulary for type, rhythm and focus,
replacing values that had been typed by hand across three stylesheets. Layout, page order, routes,
game mechanics, the on-screen keyboard and the tile/evidence colour semantics are unchanged.

## 1. What changed

### Tokens (`src/app/globals.css`)

A `:root` token block now defines the type scale, spacing scale, focus geometry and motion
durations. Colour is deliberately not here — `tui-shell.css` owns it, including the light, dark
and seven accent variants.

| Group | Tokens |
| --- | --- |
| Type | `--text-1..6` = 11 / 12 / 14 / 17 / 21 / 27px |
| Leading | `--leading-tight` 1.25 · `--leading-snug` 1.4 · `--leading-body` 1.55 |
| Weight | `--weight-regular` 450 · `--weight-medium` 550 · `--weight-bold` 650 |
| Label | `--tracking-label` 0.08em |
| Space | `--space-1..7` = 2 / 4 / 8 / 12 / 16 / 24 / 40px |
| Structure | `--marker-gutter` 20px |
| Focus | `--focus-width` 2px · `--focus-offset` 2px · `--focus-offset-inset` −3px |
| Motion | `--duration-feedback` 90ms · `--duration-surface` 160ms · `--ease-standard` (declared, applied in Phase 3) |

Body text stays at 14px — exactly its v6.7 value — so running text did not reflow.

### Adoption

| Measure | Before | After |
| --- | --- | --- |
| `font-size` declarations on a scale | 0 of 170 | **156 of 170** |
| Distinct type sizes | 34 fixed + 11 `clamp()` ramps | 6 steps |
| Rem-bearing spacing declarations on a scale | 0 of 409 | **393 of 409** |
| Distinct spacing values | 39 | 7 |
| Focus-ring geometries | 4 | 1 (+1 deliberate inset) |
| `:root` colour declarations that never reached the page | 40 | 0 |

The 14 remaining `font-size` and 16 remaining spacing literals are all deliberate: the tile and
keyboard rules (accepted play surface, and asserted by the tile-scale and keyboard-fit tests), the
avatar initials which scale with their element, and safe-area `max()`/`env()` expressions whose
bare parts were tokenized but whose function arguments were left intact.

### Dead colour removed

`globals.css` declared a full palette that never reached the page: 22 light names and all 18 dark
names were redeclared by `tui-shell.css`, which loads second. Verified name-by-name before
deletion. `--rule` and the eight `--z-*` tokens were kept — nothing downstream redeclares them.

### Alignment — one text column

- **`max-width: 70ch` deleted** from `.route-header` (`globals.css`). It dated from an earlier
  design where the header was a block of text; `tui-shell.css` later redefined it as a full-width
  ruled line but never reset the cap, so at 1440px the heading rule died at **613px** while every
  region rule below it ran to **1416px** — on every route in the app.
- **The 1.65rem paragraph indent is gone.** Route intros now hang from the same `--marker-gutter`
  column as the heading text instead of an arbitrary 26.4px that matched nothing.
- `.route-title-line` uses a fixed marker column rather than an `auto` column plus a gap, so
  heading text starts at the same offset on every route.

### Three defects fixed

1. **Empty bordered box under every game.** `.game-message` forces a fixed height and border, and
   `solo-game.tsx:997` always renders it, so an empty rectangle sat beneath the keyboard on Solo
   and COMBAT. It is the `aria-live` region that announces action results, so it could not simply
   be removed or `display: none`'d — a live region must stay present and exposed to be announced
   reliably when it repopulates. When empty it now takes the visually-hidden treatment: still in
   the accessibility tree, but out of the layout entirely rather than merely collapsed.
2. **"device.No active Solo games"** on Home. `home-attention.tsx` wrapped two separate statements
   in an unstyled `div`; when there are no active games the sessions component returns a bare
   `span`, so the two ran together on the first screen a new player sees. The wrapper now stacks.
3. **`var(--control-disabled-opacity, 0.52)`** disagreed with the token's real value of `0.74`.

## 2. Two regressions found and fixed during the phase

Both were pre-existing fragilities that the type change exposed. Neither is covered by any test.

**The account trigger rendered at 14px.** `.account-menu > button, > a` carried `font: inherit`.
The shorthand resets size, family and weight to the inherited body values, so the trigger rendered
at body size while every other control in the same toolbar row was 11px — and any `font-size`
declared elsewhere in that rule could never take effect. Replaced with explicit family, size and
weight on the scale.

**The desktop navigation clipped its last route at 1440px.** `.desktop-nav` had `flex: 1`, giving
it a zero basis and a grow factor, so it split the toolbar's free space evenly with the breadcrumb
rather than taking the width its items need. It was allocated 496px for 513px of content and
silently clipped `data [5]` through its own `overflow-x: auto`. Measured overlap before the fix:
**21.1px**, reduced to 16.6px by the font fix alone, and to **0** by giving the nav `flex: 0 1 auto`
so it sizes to content while the breadcrumb absorbs the remainder and truncates — which is already
its designed and separately tested behaviour.

Verified at 1920 / 1440 / 1280 / 1024 / 853 / 768: zero nav clipping, zero breadcrumb-versus-tools
overlap, zero document overflow.

## 3. One deliberate departure from the mapping

`.game-status h1` — the play screen's title — was 12.16px, smaller than body text on every other
route, so the most-looked-at screen had the least legible heading. Nearest-value mapping would
have kept it at 12px. It is set to `--text-4` (17px) instead, and steps down to `--text-3` (14px)
below 47.99rem.

That responsive step is load-bearing, not cosmetic. At 320×568 the status bar is a single row
shared with the fact chips; a 17px title consumes enough width to push those chips onto a second
line, which costs the board the vertical room it needs to show six rows inside its own region. The
keyboard-fit matrix caught this — it was the one test failure of the phase, and it failed for a
real reason.

## 4. Verification

Full local gate, all green:

| Command | Result |
| --- | --- |
| `pnpm check` | PASS — format, lint, typecheck, build, bootstrap 107/107, migrations 45/45 + 8/8, words 34/34, keyboard manual, boundaries, MP audit 73/73, parity 237/237, 3 HTTP interfaces, 85 CSS tokens resolve, budgets |
| `pnpm test:domain` | 22 files, 137 tests passed |
| `pnpm test:browser` | 1 file, 27 tests passed |
| `pnpm test:e2e:fixture` | 20 passed (chromium, firefox, webkit) |
| `pnpm test:visual` | 20 passed |

Specifically holding:

- **Control-contrast sweep at zero failures** — 24 routes × 6 accents × 3 interaction states ×
  2 schemes, both light and dark tests.
- The six accents still produce six distinct unknown-key backgrounds, and the semantic
  correct/present/absent/removed backgrounds remain byte-identical across every accent.
- Tile scale 58–72px desktop / 46–54px mobile; board centre axis within 3px.
- Keyboard fully visible across all eight play viewports including 320×568 and landscape.
- No horizontal document overflow at 320/360/390/412/768/960/1440/1920, across all 24 routes.
- 200% zoom, forced colors and reduced motion usable; zero serious/critical axe violations.
- Key-to-tile response under 100ms p95; LCP/INP/CLS inside budget.

### Bundle impact

CSS got **smaller**, despite adding a token layer — repeated `var()` references compress better
than 39 distinct literals, and the dead colour blocks are gone.

| Route | Phase 0 CSS | Phase 1 CSS | Change |
| --- | --- | --- | --- |
| `/` | 24,201 B | 23,076 B | **−1,125 B** |
| solo practice | 28,688 B | 27,543 B | **−1,145 B** |

JS is unchanged at 192,894 B / 198,608 B. All four budgets pass with real measurements, which is
only true because Phase 0 repaired the verifier.

## 5. Evidence — `fidelity/`

35 PNGs, the same 7 surfaces × 5 variants as the Phase 0 baseline, so the two directories can be
compared directly. The clearest before/after pairs are `shell-home-1440x1024-light.png` (heading
rule, intro alignment, the Home copy collision) and `account-data-1440x1024-light.png` (the
toolbar).

## 6. Deferred to Phase 2

- **Region-header and command-row alignment.** Route headings and intros now share one text
  column, but region labels still sit at the frame gutter and row content at a third offset.
  Phase 2 restructures those components and will bring them onto the same column.
- Everything else in the agreed Phase 2 scope: the elevation ladder, navigation and inverse
  selection, the unified play column, and the footer rule.

## 7. State

Changes are **uncommitted**. Modified: `src/app/globals.css`, `src/app/tui-shell.css`,
`src/features/solo/solo-game.css`, `src/features/home/home-attention.tsx`, plus Phase 0's
`scripts/verify-bundle-budgets.mjs`. Added: the two `reports/v7-*` directories. Nothing committed,
pushed, merged or deployed.
