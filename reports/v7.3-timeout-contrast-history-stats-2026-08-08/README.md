# v7.3 — the timeout rule, a contrast family, History, Stats, and the Help rework begins

Date: 2026-08-08
Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
Base commit: `75a1eaa` (v7.2 owner-accepted)
Revert point: `amordle-stage2-v7.2-help-and-match-setup-golden-2026-08-08` → `3d7e99b`
Spec: `docs/v7.3-intake/WORK-INTAKE.md` (W1–W6)
Artifact: https://claude.ai/code/artifact/9d018dd8-b1b7-4bd2-a11c-c48e921e4c18

Six owner items. **W1–W4 and W6 are complete.** W5 is half-done by design: the animations
were built into a review artifact and the two removals landed; the port waits on lock-in.
No migration. Production untouched.

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
| domain | 144 | **148** |
| browser component | 29 | **30** |
| fixture e2e | 23 | 23 |
| visual e2e | 22 | **31** |
| parity · MP audit · APIs · bootstrap | 237 · 73 · 3 · 107/107 | unchanged |

Every new test was **verified to fail without its fix**. That discipline paid for itself
twice: the first keyboard probe mounted on `/`, where `solo-game.css` is not loaded, and
reported an untouched `0.74` while measuring unstyled buttons — it would have passed
vacuously. The explicit opacity assertion caught it.

Hosted acceptance green at
`https://amordle-rcl7pofqo-ryanjosephkamps-projects.vercel.app`
(`dpl_HwNPKXyD4LHqUXi7sjmXZESKGoh4`) for `563d02f`: fixture 23, services 3, visual 31,
parity 237/237. Cleanup succeeded on the **first attempt with zero residue** and
`authResidue: 0`. Production unchanged at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.

**Cost, measured:** CSS +145 B home, +190 B game. JS unchanged (−1 B). W5.1 and W5.3
moving to the server-only module removes their client JavaScript entirely.

## 6. Open items

1. **W5 is incomplete by design.** Six animations are built into the artifact and await
   owner feedback; the port is Phase 8. `GoChainAid` and `CombatTurnExample` are unchanged
   until then.
2. **The shared `board-surface.css` extraction is deferred**, not abandoned. It touches
   four live game routes and its only consumer is the port. Landing a structural refactor
   with no consumer would make this Preview riskier for no visible gain.
3. **One fidelity question for the owner**, recorded in the artifact: the intake describes
   Reveal as a green tile in row two; the game locks the letter into the *draft* row with a
   dashed outline. The figure shows the faithful version and asks.
4. **Server-side timeout settlement is still not hosted-proven**, carried unchanged from
   v7.1. Proving it needs a match whose clock actually expires, and the only timed match in
   the hosted suite is load-bearing for a later win-by-guess assertion.
5. Carried, unchanged: the declared 90/85/90/90 coverage thresholds are still not run by
   any script (actual ≈73%), and "Match unavailable" remains unreproduced.
