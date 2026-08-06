# v7 Phase 2 — surfaces

Date: 2026-08-06
Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
Revert point: `amordle-v6.7-accepted-revert-point-2026-08-06` → `740ca5e`
Follows: `reports/v7-phase1-token-layer-2026-08-06/`

Phase 2 applies the Phase 1 vocabulary to the app's surfaces: elevation, the loud/quiet balance of
selection, the play screen's measure, and the alignment work deferred from Phase 1. Routes, page
order, information architecture, game mechanics, the on-screen keyboard and the tile/evidence
colour semantics are unchanged.

## 1. Elevation ladder

Five levels, of which only three carry a shadow. A terminal surface separates with a hairline, and
67 of the app's 80 radius declarations resolve to zero by design, so shadow is reserved for things
that genuinely float.

| Level | Used by | Treatment |
| --- | --- | --- |
| 0 | page, board, table rows | hairline only |
| 1 | panels, form groups | hairline + inset surface |
| 2 | menus, popovers, the floating "latest row" control | `--elevation-2` |
| 3 | dialogs | `--elevation-3` |
| 4 | toasts, the update banner | `--elevation-4` |

This replaced four unrelated recipes for the same intent: `0 6px 8px` at three different alphas,
`0 1rem 3rem`, `0 0.9rem 2.3rem` written in `rgb()` rather than `oklch()`, and `0 2px 5px`. The
shadow colour is a token, so the dark scheme deepens to true black at higher alpha in one place
instead of each recipe guessing.

Two raw shadows remain, both deliberately: the `.app-shell` glass shadow, which is dead code from
the superseded faux-window generation and is deleted in Phase 3, and the `0 0 0 1000px … inset`
autofill-suppression hack, which is not elevation.

**Z-index.** `--z-backdrop: 50` and `--z-modal: 60` were declared but never referenced, while raw
`z-index: 24` and `40` sat in that band. The two unused tokens are gone rather than forced into
service: every dialog uses native `<dialog>` with `showModal()`, which promotes it to the browser's
top layer above all z-index, so a modal z-index has nothing to do. The raw literals now use the
tokens that actually describe them — `--z-dropdown` for a help popover, `--z-sticky` for the focus
rail. The remaining `z-index: 1`/`2` values are local stacking inside a single component and are
correctly not part of the app-level scale.

## 2. Selection, rebalanced

"You are here", "this is recommended" and "this is selected" were all painted with the same
full-width inverse slab, so Home had three shouting elements and nothing quiet to shout against.

- **Current route** — a 2px accent underline on the toolbar's own bottom rule, with the label
  stepping from muted to full ink. Hover takes a faint tint of the same accent, so the two states
  read as related.
- **Recommended command row** — an accent rail and a 10% tint.
- **Genuine selection** — full inverse is retained: an open account menu, a selected word,
  keyboard-driven selection, `aria-pressed` segmented controls.
- **Navigation dividers removed.** Five hairlines across five destinations read as a segmented
  control — five separate things to weigh — when the group is one thing and the current route is
  already marked. The boundaries that encode real structure are kept: the breadcrumb still closes
  with its own rule, and the account and menu controls keep theirs, so the toolbar still reads as
  identity | context | navigation | tools.

Because rows no longer invert, their children hold fixed colours instead of inheriting a flipped
one — which is what gives the command label (ink) and its description (muted) distinct ranks
rather than the single muted tone they shared.

The control-contrast sweep stayed at zero failures through all of this, across 24 routes × 6
accents × 3 interaction states × 2 schemes.

## 3. One play column

The play screen previously stacked four measures: status bar, board frame and message line at
`min(76rem)` = 1216px; keyboard, tools and evidence at `min(44rem)` = 704px; and the board itself
at its own content width — 358px for a five-letter word, floating with roughly 400px of dead space
on either side.

The column is now the keyboard's own **44rem**. The plan proposed inventing a 54rem column; using
the keyboard's existing width is better, because that width is fixed, accepted and asserted by the
keyboard-fit matrix — so every band lines up exactly and the keyboard is untouched. The 44rem
children clamp to 100% and fill the column automatically. The board stays centred, but now inside
something close to its own size. Long words still scroll inside the board region exactly as before.

Tile scale (58–72px desktop, 46–54px mobile), board centre axis, and keyboard fit across all eight
play viewports are unchanged and green.

## 4. One text column, completed

Phase 1 brought route headings and their intros onto one left edge. Phase 2 finishes the job:
region labels, prose, data rows and command rows now share it. Measured on Home at 1440px:

| Element | Before Phase 1 | Now |
| --- | --- | --- |
| Route prompt glyph | 24 | 24 |
| Heading text | 44 | 44 |
| Intro paragraph | 50.4 | 44 |
| Region label | 24 | 44 |
| Command row marker | 44 | 24 |
| Command row label | 64 | 44 |

**Four edges became two:** markers at 24, all text at 44.

The region body carries the gutter, so everything inside a region lands on the column without each
kind of content having to remember to indent itself. The Home command list opts out and supplies
its own marker column, so its selected and hovered rows read as full-width bands rather than
floating boxes. Row markers hang into the gutter by a negative offset rather than sitting at a
fixed inset, so they align with the route prompt instead of landing on their own label.

No marker glyph was added to region headers. Generated content is announced by some screen readers,
and here the alignment carries the structure without the ornament.

**Below 48rem the gutter collapses.** It is a desktop reading affordance that costs 20px of a 320px
viewport — enough to push a loading leaderboard's lane switcher past the edge before its data
settled. That was caught by the overflow matrix, which measures during load rather than after it.

## 5. A bottom edge

Short routes ran out of content and left several hundred pixels of empty page with no closing edge.
The shell grid's third row now carries a quiet footer: a hairline, the wordmark, and a hint derived
from the same shortcut registry the toolbar, the Help table and the generated keyboard manuals read
— so it cannot drift out of step with the keys that actually work.

It restates existing shortcuts and **adds no destinations**. Information architecture is a hard
constraint for this cycle, so the footer is a bottom edge for the page, not a second navigation
surface. It is omitted during play and in Focus Mode, where the shell is deliberately contained to
the dynamic viewport and a third row would break that contract.

## 6. One test was changed — read this

`tests/e2e/fixture.solo.spec.ts:189` — "renders the terminal menu above the game status row on
mobile and desktop" — failed after the play column narrowed.

It failed on its **precondition**, not its guarantee. The test probed the geometric intersection of
the open menu and the play status row and errored outright when there was none. With the play
surface now one 44rem column, the menu at 1440px opens over empty page margin and the two boxes no
longer meet — so there is nothing there to occlude it.

The assertion was **strengthened, not relaxed**:

- The probe now samples the menu's own centre, so the layering guarantee is asserted at *every*
  viewport rather than only where the two boxes happen to overlap.
- The intersection itself is still *required* at mobile widths, which is where the play surface
  genuinely does run underneath the menu.

Mobile behaviour is therefore tested exactly as before, and desktop is now tested where it
previously was not. This is the only test touched in the cycle, and it is flagged here because
changing a test to accommodate a change is a decision that deserves an explicit review rather than
a line in a diff.

## 7. Verification

| Command | Result |
| --- | --- |
| `pnpm check` | PASS — format, lint, typecheck, build, bootstrap 107/107, migrations 45/45 + 8/8, words 34/34, keyboard manual, boundaries, MP audit 73/73, parity 237/237, 3 HTTP interfaces, 91 CSS tokens resolve, budgets |
| `pnpm test:domain` | 22 files, 137 tests passed |
| `pnpm test:browser` | 1 file, 27 tests passed |
| `pnpm test:e2e:fixture` | 20 passed (chromium, firefox, webkit) |
| `pnpm test:visual` | 20 passed |

Holding specifically: control-contrast sweep at zero failures; six accents still produce six
distinct unknown-key backgrounds with byte-identical semantic evidence backgrounds; tile scale and
board centring; keyboard fit at all eight viewports; the seven heading assertions; account trigger
bounds; notification row three-track grid; players filter six controls at ≥44px; solo session table
headers and `data-label`s; modal centring and backdrop dismissal; the `.menu-heading::before` /
`.menu-footer::before` frame-edge assertions; no horizontal overflow at 320/360/390/412/768/960/
1440/1920 across all 24 routes; 200% zoom, forced colors and reduced motion usable with zero
serious/critical axe violations; key-to-tile p95 under 100ms; LCP/INP/CLS inside budget.

### Bundle

| Route | Phase 0 | Phase 1 | Phase 2 |
| --- | --- | --- | --- |
| `/` CSS | 24,201 B | 23,076 B | 23,425 B |
| solo CSS | 28,688 B | 27,543 B | 27,851 B |
| `/` JS | 192,888 B | 192,894 B | 193,014 B |

Phase 2 added ~350 B of CSS (the elevation tokens, the footer, the alignment rules) and ~120 B of
JS (the footer element and its registry-derived hint). Still ~800 B below the Phase 0 baseline on
both routes, and far inside the 50/65 KiB CSS budgets.

## 8. Evidence — `fidelity/`

35 PNGs, the same 7 surfaces × 5 variants as Phase 0 and Phase 1, directly comparable. The clearest
pairs are `shell-home-1440x1024-light.png` (selection, alignment, footer) and
`solo-1440x1024-dark.png` (the unified play column).

## 9. Deferred to Phase 3

Motion on the ~100 interaction states, route-level `loading.tsx` and `error.tsx`, routing the bare
`Loading…` strings through the existing `SkeletonRows`, rules for `.field-help` and `.form-error`
(which still have none), deletion of ~700–900 lines of superseded CSS including the dead
`.app-shell` glass generation, and optionally removing Tailwind.

## 10. State

Changes are **uncommitted**. Modified: `src/app/globals.css`, `src/app/tui-shell.css`,
`src/features/solo/solo-game.css`, `src/features/home/home-attention.tsx`,
`src/components/app-shell.tsx`, `tests/e2e/fixture.solo.spec.ts`, and Phase 0's
`scripts/verify-bundle-budgets.mjs`. Added: three `reports/v7-*` directories. Nothing committed,
pushed, merged or deployed.
