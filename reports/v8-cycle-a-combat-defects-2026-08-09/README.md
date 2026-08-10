# v8 Cycle A — the five COMBAT defects

**Date:** 2026-08-09
**Branch:** `codex/amordle-terminal-greenfield-implementation-2026-07-27`
**Range:** `59e5833` (revert point) → `81e96f1`
**Preview:** `dpl_7M3Bujha9h5p3mmcEZEpDyTQ96jZ`
`https://amordle-a7ni6pyzx-ryanjosephkamps-projects.vercel.app` (protected)
**Production:** unchanged, frozen at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`. No release.
**Migration:** none. Every change in this cycle is client-side or CSS.

---

## Why this cycle existed

The owner reported five defects in COMBAT and, separately, that multiplayer — the
game's actual differentiator — reads as an afterthought. Cycle A is the defect half:
five fixes, no schema change, so the two migration cycles that follow land on a
codebase whose client behaviour is already correct.

Three things the investigation found changed what got built.

**The rating button was the only writer of ELO, and the owner's fear was exactly
right.** Every `update` against `multiplayer_rating_profiles` lives inside a
settlement RPC, and every one of those RPCs had a single call site: the
`UPDATE RATING` button. RLS grants the client `select` only, so nothing else *could*
write it. If neither player pressed, the ratings never moved, no
`multiplayer_match_results` row was created, and the match was invisible to the
leaderboard and to public stats. A losing player could decline the loss simply by
closing the tab.

**The matchmaking stall was a dead poll, not a slow one.** The lobby re-armed its
poll with a one-shot `setTimeout` that did nothing when it fired on a hidden tab —
and because it changed no state, it never scheduled a successor. Switching to the
second player's window is precisely what hides it. That is why refreshing appeared
to help: the refresh remounted the component and started a fresh timer.

**The Firefox notification test could not have seen the bug.** A test asserting the
status/date/time separation across eight phone widths already existed — but the
`visual` project runs Desktop Chrome only.

---

## A1 · The ranked queue no longer stops polling

`practice-lobby.tsx` now uses the ref-driven `setInterval` the ranked-Daily lobby
already used, reading `isPending` through a ref so the interval is not torn down and
rebuilt on every mutation. A `visibilitychange` listener polls immediately on return,
so coming back to the tab is instant rather than up to five seconds, and an `online`
listener does the same after a network drop.

The interval's dependency is a derived `pollableQueue` object that is `null` unless
the queue is genuinely pollable — right word length, phase in
`queued | conflict | failed`. The timer therefore exists exactly when it should and
is not restarted by unrelated renders.

**The regression test forces the hidden state.** Playwright keeps background pages
reporting `visible`, which is why the existing two-player scenario passed against the
broken code. The test now overrides `document.visibilityState` on the waiting page
before the second player claims, then asserts the waiter still reaches
`/combat/match/`. Verified to fail on the pre-fix code.

## A2 · Ranked results always count, and both players' changes are shown

`UPDATE RATING` is gone from every terminal branch. In its place is a latched effect,
the same shape as the timeout settlement accepted in v7.3: it fires once the match is
terminal, ranked and settleable, throttled on wall-clock time held in a ref, with
refusals swallowed. The RPC was already idempotent — its key is derived from the game
id inside the function, both seats update in one statement, and an advisory lock plus
`for update` serialises concurrent presses — so both clients firing is safe, and the
second one gets its own correct numbers back.

Both players' changes are shown on every ranked ending: name, old rating, arrow, new
rating, and a coloured delta. The opponent's numbers needed no migration — RLS on
`multiplayer_rating_transactions` is two-sided (`user_id = auth.uid() or
opponent_user_id = auth.uid()`), so the losing seat's row is readable by the winner
and vice versa, filtered by the `matchResultId` the receipt already returns.

Colours reuse the History tokens with no new values: `--correct-text` for a gain,
`--danger-text` for a loss, `--present-text` for zero. A ranked match cancelled before
play never settles, so it renders both ratings unchanged with an orange `±0` rather
than inventing a settlement that did not happen.

**This is the client half of the owner's "both" decision.** A player who force-quits
before the effect runs still avoids settlement; Cycle C moves settlement into the
terminal path server-side, at which point declining becomes impossible.

## A3 · The Firefox notification overlap

The notification row was a two-column grid with three children, held together by
`grid-column: 1 / -1` on the first child and *implicit* rows, with
`align-items: baseline` across them. A full-width spanner in an implicit row sharing a
baseline group is exactly where Gecko and Blink diverge.

Fixed by removing the browser's discretion rather than by chasing the divergence:
explicit `grid-template-areas`, explicit `grid-template-rows`, and `align-items: start`
so no baseline group spans rows. The `display: grid` specificity was raised while in
there — it previously beat `.menu-popover a { display: block }` on source order alone,
at equal specificity, which the stylesheet records as having already broken once.

`visual-firefox` and `visual-webkit` Playwright projects now exist, both filtered to
`@crossbrowser`, and `pnpm test:visual` runs all three engines.

**Stated plainly: desktop Firefox does not reproduce the Android rendering.** The new
cross-engine test therefore asserts the *structure* that made the divergence possible —
named grid areas, explicit rows, no cross-row baseline group — rather than a pixel
outcome it cannot observe. Those assertions do fail against the old CSS.

## A4 · A forfeit reveals the answer on the board

No migration: `revealedAnswers` is already projected whenever the game is `completed`,
which covers forfeit and timeout and correctly excludes `cancelled`.

One extra row is appended below the last real guess when the outcome reason is
`forfeit`, every letter red, no evidence glyph — nobody guessed it, so there is no
evidence to show. `canForfeit` requires at least one move, so there is always a guess
above it, and the transcript already reserved `rows.length + 1`, so the board grows on
its own.

Two details worth recording. `revealedAnswers` is **plural** — a GO match returns the
whole chain — so the row reads `revealedAnswers[currentPuzzleIndex]`, not `[0]`. And
the prop is **optional and off by default**, because the transcript is shared with the
spectator view whose RPC deliberately withholds answers; a shared component that can
render them is a leak waiting to happen.

Red was genuinely unused on a tile — the three evidence states are green, amber and
slate — so it reads unambiguously. It uses the existing `--danger` / `--danger-text`.

## A5 · The end-of-match cluster

Nine-plus controls sat in an unstructured `flex-wrap` with no mobile CSS at all. Worse,
`COPY WORD` and `SEARCH WEB` came from the per-answer definition block and repeated
once per revealed answer, so a GO match rendered up to ten of each.

- The cluster is now a deliberate two-tier layout — primary next action, then secondary
  navigation — on a real grid at both widths.
- The definition actions are scoped to the answer being viewed, so they appear once.
- `SEARCH AGAIN` is renamed **`NEW COMBAT`** and still returns to the Practice setup
  page. It appears after every combat match.
- A genuine **`SEARCH AGAIN`** now exists, ranked only, which re-enters the queue with
  the same configuration instead of navigating to a form. It lands on the lobby with the
  search already running. Cycle B makes it survive navigation.
- The ranked-Daily and legacy branches got the same treatment, so they do not diverge.

---

## Verification

Local gate, `pnpm test:acceptance:local` — green:
**158 domain · 30 browser · 24 fixture · 40 visual**, budgets
`home 193,242 B JS / 23,279 B CSS; game 198,960 B JS / 28,189 B CSS`.

Hosted acceptance against the Preview:

| Suite | Result |
| --- | --- |
| fixture (Chromium · Firefox · WebKit) | 24 passed |
| services (real Supabase, 1 worker) | 3 passed |
| visual (Chromium 36 · Firefox 2 · WebKit 2) | 40 passed |
| parity registry | 237/237 acceptance-verified |
| working-tree residue | none — `git status` clean after the build churn revert |

Every new test was verified to fail before its fix.

**One hosted failure, and it was mine, not the feature's.** The first hosted run failed
the forfeit assertion: the answer row rendered correctly — five red tiles, zero evidence
glyphs, both asserted and both passing — but I had anchored the label check to
`.combat-transcript-entry` `.last()`, and the transcript always pads to at least six
rows, so the final entry was an empty padding row reading `06·`. The assertion now
filters for the entry that actually carries `.board-row.is-answer`, asserts it is
unique and labelled `ANSWER`, and asserts it sits directly below the last real guess —
which is the property that actually matters and which the original check never tested.

---

## What Cycle A deliberately did not do

- **No server-side settlement.** A player who force-quits before the auto-settle effect
  runs still escapes the rating change. Cycle C closes this.
- **No background queueing.** `SEARCH AGAIN` starts the queue but a navigation still
  loses it. Cycle B.
- **No bucket, portal or concurrency work.** Cycles C and D, both migrations, both
  needing their own decision packet.
- **`get_public_site_stats_v1` is still broken** — it filters the pre-v2 buckets
  `async:og` / `async:go`, so site stats under-report ranked participation to zero. Same
  class of bug as the leaderboard repair in W-11. Found during this investigation, fixed
  in Cycle C.
- **`/combat/active` still promises "recently completed games"** while its loader filters
  terminal games out. Copy or filter, not yet decided.

## How to undo it

`git reset --hard 59e5833`. That discards A1 through A6 and returns to the state the
owner last accepted. Nothing durable changed outside the branch: no migration was
applied, no Production deploy was made, and the only service writes were the ranked
matches the hosted suite creates and cleans up itself.
