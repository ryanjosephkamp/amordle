# v7.3 — the timeout rule, a contrast family, History, Stats, and the Help rework begins

Date: 2026-08-08
Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
Base commit: `75a1eaa` (v7.2 owner-accepted)
Revert point: `amordle-stage2-v7.2-help-and-match-setup-golden-2026-08-08` → `3d7e99b`
Spec: `docs/v7.3-intake/WORK-INTAKE.md` (W1–W6)
Artifact: https://claude.ai/code/artifact/9d018dd8-b1b7-4bd2-a11c-c48e921e4c18

**All six owner items complete.** W5 was built artifact-first, approved unchanged, and
ported. No migration. Production untouched.

---

## 1. What re-verification changed

Roughly a third of the intake's code claims were wrong in a way that changed the work.

| Intake | Verified |
| --- | --- |
| Racing clients are safe because the timeout command is "idempotent by action id" | **False.** `operationId()` mints a fresh UUID per call, so the ledger dedupe never fires for a repeat. An unlatched effect would issue one real RPC per 250 ms clock tick, and every refusal calls `refetch()`. |
| Fixing the `?? 0` null handling is correct "on its own terms" — i.e. separable | **It is a prerequisite.** With the bug in place, auto-settlement fires immediately on every untimed match, and the server can never settle one, so it returns `TIMEOUT_PENDING` forever at tick rate. |
| Remove `canClaimTimeout` | **The predicate survives**, renamed and gated — automatic settlement asks the same question. What goes is the player-facing choice. |
| W2b: the dim is "correct in kind but too weak" | **There is no combat dim rule at all.** 28 `disabled` attributes route into one generic `button:disabled` using a token that governs every disabled control in the app. |
| W2a: scope the caret to combat's not-your-turn state | **No such state reaches the DOM.** One had to be added first. |
| `.custom-accent-option small` at `tui-shell.css:3090` | **`:3270`** — and the accent **name** is equally unreadable, which the intake does not mention. |
| W4a: "each card is a two-column grid" | **Mobile only** (< 47.99 rem). Above that the link already aligned. |
| W4b: "`draw` does not exist as a result yet" | **Wrong at four layers** — produced in `match-controller.tsx`, ranked by `terminalPrecedence`, CHECK-constrained in the DB and written by the settlement RPC, and already drawn on Stats. Also, there are **four** result values; `cancelled` was missing. |
| W4b: "an orange token may need adding" | **No.** `--present-text` is 8.61:1. The naive `--present` is 2.71:1 — the exact wash-out the owner flagged. |
| W5: the aids live in `help-live-aids.tsx` | **`CombatTurnExample` does not** — it is inlined in `src/app/help/page.tsx`. |
| W5.3: "revert to the static comparison" | **Not a subtraction.** The rail painted only through `data-reached`, which existed only because the sequence pre-set its final step. |

## 2. W1 — running out of time is the loss

The control shipped on **untimed** matches because `readCombatClock` folded an absent
budget into `0`. `ClockValue` hid the symptom (it is gated on `timeRemainingMs != null`);
nothing gated the claim.

Settlement is now **automatic and symmetric**: whichever client is watching sends the
command, including the client of the player who ran out. The server reaches the same
outcome the moment that player submits anything, because clock materialisation runs ahead
of the turn check.

**Residual, stated plainly:** settlement still needs *someone's* client open on the match.
If both players close the tab it sits at `0:00` until either returns, at which point it
settles instantly, before they can do anything else. This is *automatic from the player's
point of view*, not *guaranteed within N seconds*. A scheduled sweep is the real fix and
belongs in the deferred roadmap.

Two tests were asserting the defect. `platform.test.ts` pinned `expired === true` for a
null budget, and the claim test asserted "an untimed lane never produces a running clock"
while hand-feeding `running: false` — reality disagrees, and that false premise is what
let this ship.

## 3. W3 — one defect family, not a third instance

Widening the sweep turned 1 reported defect into **5 real ones, 254 failing combinations**:

| Surface | Worst | Combinations |
| --- | --- | --- |
| `a.route-link::before` `›` | **1.01:1** | 48 |
| `.notification-status::before` `●` | **1.01:1** | 53 |
| `.custom-accent-option small` (the hex) | **1.94:1** | 72 |
| `.custom-accent-option` name span | **1.94:1** | 72 |
| `.combat-wait-state span` | **3.57:1** | 9 (custom accents only) |

Two are pseudo-elements. `getComputedStyle(element)` cannot see one, so **every `::before`
in the design had always been unmeasured** — the `›` on route links, the `●` marker, the
`[ ]` on tool buttons, the DATE/RESULT labels on the mobile history card. The sweep now
measures them, holding single-glyph markers to the 3:1 non-text floor and real words to
4.5:1. That is a category, not an exemption: the `›` fails either floor.

`.combat-wait-state` surfaced only because the new probe sweeps **custom** hexes too.
`.confirmation-panel p` was a suspect on identical grounds and measured clean, so it is
untouched.

## 4. W2 and W4

The keyboard dim is **0.548 on the opponent's turn against 0.740 for an ordinary disabled
control** — measured, in both schemes, still clear of the 3:1 floor across every accent.

`--danger-text` was added because the new History test measured `--danger` at **3.76:1**
once `tbody tr:hover` flips the row to `--accent-soft`. Every semantic fill already had a
darker text sibling; red was the one that had never needed it.

## 5. Verification

| Suite | Before | After |
| --- | --- | --- |
| domain | 144 | **157** |
| browser component | 29 | **30** |
| fixture e2e | 23 | 23 |
| visual e2e | 22 | **31** |
| parity · MP audit · APIs · bootstrap | 237 · 73 · 3 · 107/107 | unchanged |

Every new test was **verified to fail without its fix**. That discipline paid for itself
twice: the first keyboard probe mounted on `/`, where `solo-game.css` is not loaded, and
reported an untouched `0.74` while measuring unstyled buttons — it would have passed
vacuously. The explicit opacity assertion caught it.

Hosted acceptance green at
`https://amordle-cwoz5jwao-ryanjosephkamps-projects.vercel.app`
(`dpl_9Pcy6Q5EAA5xZi976EN4MH2Ag6vX`) for `4d1ee18`: fixture 23, services 3, visual 31,
parity 237/237. Cleanup succeeded on the **first attempt with zero residue** and
`authResidue: 0`. Production unchanged at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.

**Cost, measured.** Home 193,128 B JS / 22,981 B CSS; game 198,846 B / 27,789 B — against
budgets of 220/50 KiB and 320/65 KiB. The game CSS rise of 594 B is the gzip cost of
splitting one stylesheet into two, not new rules. `/help`, which has no budget of its own,
costs **+16,548 B raw JS and +3,341 B raw CSS** over Home.

## 6. W5 — the animation rework

Built into one artifact, approved unchanged, then ported. Three things surfaced only by
opening the page, none of which any test would have caught:

1. **`.help-example` caps figures at 34 rem**, which sits *below* the COMBAT figure's own
   44 rem container breakpoint — so the two-keyboard composition approved at 800 px would
   have stacked at every width and never appeared in the app at all.
2. A **stale service worker** served the previous CSS during local verification and
   reported the wrong width. Worth remembering.
3. The canonical-route walk went from 9.4 s to a **35 s timeout**. Six figures were
   re-rendering 45 tiles and 104 keys across all ~130 frames. Played rows and derived
   evidence are now shared by reference and the row and keyboard components memoised, so
   typing re-renders the draft row alone. Back to **12.3 s**.

The figures' content is computed by `scoreGuess`, `deriveKeyboardEvidence` and
`continuationCost` rather than drawn, and nine domain tests assert it cannot contradict the
rules it teaches — including that **T stays green** after row seven plays `TASTE` and scores
its own T absent, which a hand-drawn figure would almost certainly have got wrong.

Keyboards are `<span>`, not `<button>`: a figure is not a control, and buttons would have
added 56 tab stops to `/help`. `HardModeAid` is byte-identical, verified by diff.

## 7. Open items

1. **Server-side timeout settlement is still not hosted-proven**, carried unchanged from
   v7.1. Proving it needs a match whose clock actually expires, and the only timed match in
   the hosted suite is load-bearing for a later win-by-guess assertion.
2. **`/help` and `/stats` still have no bundle budget of their own.** Both were measured by
   hand this cycle; nothing automated guards them.
3. Carried, unchanged: the declared 90/85/90/90 coverage thresholds are still not run by
   any script (actual ≈73%), and "Match unavailable" remains unreproduced.

The Reveal fidelity question raised during review is closed: the owner approved the
faithful rendering, where a bought letter lands in the draft row outlined rather than as a
green evidence tile.

---

## 8. v7.4 — Help keyboard fidelity (follow-up)

Owner accepted everything except the Help figures, and reported five cosmetic defects.
Two had causes I had got wrong when I built the figures.

| Reported | Actual cause |
| --- | --- |
| "The keyboards are a bit too different from the real ones" | A **box-model hole**, not a styling drift. The properties that centre a key's glyph live on `button, .button`; a `<span class="key">` matches neither, so letters sat top-left at the wrong weight. |
| "Both keyboards show my accent" | **The `data-accent` attributes did nothing.** The accent blocks were still scoped to `:root`, which is `<html>`, so an attribute on a nested `<div>` matched no selector. Planned in v7.3 and never executed in the port — the approved artifact *had* relaxed selectors, which is exactly why it looked right there and wrong in the app. |
| "Make the keys look pressed like the game" | **The game has no pressed state.** `button:active` sets a 1px nudge in `globals.css` and `tui-shell.css` cancels it. The only visible key state is the hover treatment, which on touch *is* the tap state. |

Two further corrections came from the tests rather than from reading:

- The parity values had to come from `tui-shell.css`, not `globals.css`. The first declares
  `font-weight: 700; letter-spacing: 0.015em`; the second **redeclares `button, .button`
  and loads after it**, so a real key computes **650 and 0**. Copying the first rule found
  would have made every figure key bolder than the keyboard it imitates. The parity test
  caught it because it compares against a real `<button>` injected into the same row rather
  than against remembered constants.
- The pressed state was first built as an `--accent-soft` tint, and the new sweep caught it
  at **1.31:1** — an absent key carries near-white ink, and a light tint underneath left
  white on pale green. Amplified as a **doubled inset ring** instead, which never touches
  the text/background pair and so cannot fail on any key state, accent, or scheme.

**Measured, not asserted.** The Remove keyboard is now **704 px — exactly 44 rem**, the real
play-route width, with 68 / 64 / 115 px keys against the game's 67.5 / 62.9 / 118.9. The
COMBAT figure holds a row-three ratio of **0.95** against the game's **0.93**, at any width,
because the wide keys use an 8% basis rather than a fixed `3.5rem` that would eat half a
247 px column.

Coverage: the figure keys are spans, so `controlSelector` never matched them and **nothing
swept them in any state**. They now go through the contrast sweep pressed and at rest in
both schemes, and a new fixture test asserts the two keyboards resolve different key
backgrounds and that the draft row alternates accent with the turn — verified to fail with
the selectors re-scoped.

domain 157 → 158, fixture 23 → 24, visual 31 → 33. Hosted acceptance green at
`https://amordle-eri2l45fw-ryanjosephkamps-projects.vercel.app`
(`dpl_4ZarqhJytpLMw5eEMmsw9Nz8kvnr`) for `7d3ce9b`, zero residue on the first attempt.

### Correction to section 5

The v7.3 report claimed the figures' terminal frame reaches a client with no JavaScript.
**That is wrong** — and not because of the figures. The whole app shell sits inside a
Suspense boundary that suspends during SSR, so the initial HTML of *every* route is the
skeleton fallback and all page content, server and client components alike, arrives only
after hydration. Verified by `curl`: the only `<main>` in `/help`'s HTML is the fallback's,
and the page text appears solely inside the RSC flight payload.

"The finished state is the initial state" still holds for reduced motion and for the first
paint after hydration, which is what it was built for. The no-JS part of the claim was
never true. Pre-existing and app-wide; recorded here rather than fixed, because it is an
architecture question and not a Help cosmetic.
