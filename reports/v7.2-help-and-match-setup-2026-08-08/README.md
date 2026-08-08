# v7.2 — match setup, the hover bug, and a Help page that demonstrates

Date: 2026-08-08
Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
Base commit: `3636efc` (v7.1 owner-accepted)
Revert point: `amordle-stage2-v7.1-refinement-pass-golden-2026-08-07` → `3636efc`
Intake: https://claude.ai/code/artifact/6da40e73-00a0-4b0a-a389-2c540767aeea

Five owner items. No migration, no game-mechanic, scoring, evidence-colour or keyboard change.
Production untouched.

---

## 1. What the intake got wrong

| Intake | Verified |
| --- | --- |
| The hover rule "may be greying other things" | It harms **exactly one** surface. `.button.primary` / `button.primary` are dead branches — no primary button in the app contains a `p`, `small` or `span`. `[aria-current]` and `[aria-pressed]` are covered by narrower rules. |
| — | The rule also beat the **forced-colors** override for the badge, because a media query adds no specificity. Second failure, same cause. |
| — | The test thought to guard the rule measures `.route-link`, an `<a>` — which the selector **cannot match**. The rule had never been under test. |
| Help colours missing on mobile | Missing at **every** width, and it was more than colour: `/help` never loads `solo-game.css`, so the tiles had no geometry either and the ✓ ~ × marks sat under the letters. **Both** tile-bearing aids were affected, not only the reported one. |

## 2. A second defect, found by the new test

The sweep written to catch the badge caught something nobody reported. Hovering a notification
row flips it to the inverse surface, but the date and time are `<time>` elements holding their own
muted ink — and `<time>` is not in the element list of the rule that corrects the others, so
nothing fixed them.

| Surface | Hovered before | Hovered now |
| --- | --- | --- |
| Alerts count | **2.89:1** | 6.93:1, identical to rest |
| Notification row date/time | **1.94:1** | 10.73:1 |

The badge failure is the one the owner diagnosed. On touch, `:hover` latches after a tap, so on a
phone it was not a flicker — it was the state for as long as the panel stayed open, which is how it
reached a screenshot. The fix excludes surfaces that carry their own background from the inherit
rule; the row takes `--terminal-selected-muted`, the token that already exists for secondary text
on a selected surface, matching `.route-link:hover span`.

**Why the sweep was blind:** three ways at once. It measured custom accents only, at rest only, and
mounted the badge as a bare child of a `<div>` — where `button:hover :is(...)` cannot match it under
any circumstance. It now mounts the real structure, forces rest/hover/focus-visible through the same
CDP path the control sweep uses, and covers named accents too. It fails on the previous CSS.

## 3. Match setup

The "Change word length" link is gone. It was never a control on anyone's match: it navigated the
whole page between 5 and 7 letters, and sat under the open-match list, which is why it read as
belonging to the row above it. No player can change a match's configuration after creation now,
their own included — which was already true on the server.

In its place, the Solo `Word length` field, in the same position relative to Mode and Difficulty,
for both public unranked and ranked. Three things this needed that Solo does not:

- **Word length was route-derived**, and the ranked search-recovery path compares a restored search
  against the route to decide whether it can resume — a hosted test covers exactly that reload. The
  field seeds from the route and commits back on blur, when the value has settled and there is no
  search to disturb. Per-keystroke syncing would re-render a server component on every digit and
  re-run the restore effect, which clears the queue before it reads storage.
- **Reseeding happens during render**, not in an effect. A `key` remount would also have worked and
  would also have discarded the mode, difficulty and clock the player had already chosen.
- **The draft is a string.** `normalizeRankedPracticeConfig` is a zod `.parse` inside a `useMemo`,
  so it throws during render and the error boundary blanks the route — and a number input
  legitimately passes through `''` (which is `0`) and `-` (which is `NaN`) while being typed. The
  parse now sees a clamped value, and both submit buttons stay disabled behind a visible message.

The control sits behind the account gate, so its assertions live in the hosted suite beside the
ranked search they protect. My first attempt put them in the signed-out fixture suite, where the
field does not exist.

## 4. Help

**The swatches.** Measured background alpha `0.00` on all three tiles at 1400px and 390px alike —
the ✓ ~ × marks were carrying the entire figure on every device. Help now owns its own swatch
presentation rather than importing the board's stylesheet, built from the same semantic tokens and
the same `color-mix` ratios. A figure whose purpose is explaining what green, amber and dark mean
has to show the colours they actually are.

**The aids.** Four figures now run a terminal sequence — one beat per step, no easing — the first
time they scroll into view, then rest. Two properties keep that safe:

- **The finished state is the initial state.** Every aid renders fully resolved on the server and
  only winds back if a client that can animate scrolls it into view. No JavaScript, no
  `IntersectionObserver`, reduced motion, or a crawler all get the complete figure. This matters
  more than it sounds: the global reduced-motion block only stops **CSS** animation, and a JS timer
  sails straight through it, so the check is made explicitly rather than inherited.
- **Nothing animates by fading text.** Letters and labels hold full opacity throughout; what
  advances is which tile has resolved and where the cursor sits. Every word stays legible at every
  instant, the explanation stays in the accessibility tree the whole time, and the contrast sweep
  never samples a half-faded colour — the trap that produced a spurious 1.00:1 last cycle.

**Hard Mode is clickable**, judged by `hardModeViolationForEvidence` — the function the game
enforces, not a copy. The four candidates cover one acceptance and all three refusal families, and
the test asserts its real messages, so the page cannot drift from the rule.

**On Remotion:** it renders video in a build step. That is megabytes for something the app draws
natively, and a video cannot respond to a reduced-motion preference or a keyboard. In-page,
state-driven animation does the same teaching at 2.9 KiB and stays accessible.

Two things fixed by looking rather than by a failing test: a pending tile was picking up the accent
tint the board uses for a draft row, which under the default accent sits far too close to "correct"
in a figure whose whole job is teaching what green means; and the advancing rail was losing a
specificity contest with the box border those items already carry.

## 5. Verification

Full `pnpm test:acceptance:local` green before any change and again after.

| Suite | Before | After |
| --- | --- | --- |
| domain | 144 | 144 |
| browser component | 29 | 29 |
| fixture e2e | 21 | **23** |
| visual e2e | 22 | 22 |
| parity · MP audit · APIs · bootstrap | 237 · 73 · 3 · 107/107 | unchanged |

Hosted acceptance green at `https://amordle-ffj16pv6j-ryanjosephkamps-projects.vercel.app`
(`dpl_Cz6fCwtmNgGgnzXi3vqtpPq36Yf6`) for `0f1479e`: services 3, visual 22, parity 237/237, and the
new word-length assertion against real services. Cleanup succeeded on the first attempt with
**zero residue** and `authResidue: 0`. Production unchanged at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.

**Cost, measured rather than estimated:** `/help` ships **2,860 more compressed bytes** of
JavaScript than Home — its first client JS. Help styling adds **380 bytes** of CSS to every route.
Home is 193,110 B JS / 22,836 B CSS against budgets of 220 KiB and 50 KiB.

## 6. Open items

1. **`/combat/practice` is swept for overflow signed out**, where the account gate replaces the
   form — so the new field is not checked at 320px by that sweep. Solo's identical control passes
   there, so the risk is low, but it is not directly covered.
2. **The hosted fixture count was not captured**, because the run output was tailed. All four
   stages passed; only the number is missing from the record.
3. Carried from v7.1, unchanged: the "Match unavailable" panel was never reproduced and is deferred;
   the timeout-claim settlement path is proven only on its refusal side; and the declared 90%
   coverage thresholds are still not run by any script (actual ≈73%).
