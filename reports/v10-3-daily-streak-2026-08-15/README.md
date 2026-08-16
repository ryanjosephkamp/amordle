# v10.3 — the daily streak

**Date:** 2026-08-15 · **Range:** `dcfb19d` → `a263de8`
**Migration:** none
**Preview:** <https://amordle-72e4gd1ww-ryanjosephkamps-projects.vercel.app> (protected), commit `a263de8`
**Production:** unchanged at `dpl_3ZitdmxrKGeqCizQ3k8et2xLTW8F` — release is the owner's to authorize

---

## What was wrong

`dailyStreak` had been a dead number since the greenfield rebuild. It was declared on
the durable progress record, initialised to zero, and rendered on the stats panel, and
the only thing that had ever written it was the legacy-save importer. A native account
displayed `0` forever; a migrated one displayed a frozen pre-migration snapshot that
could never change again.

It was deliberately left off the Methodology page for that reason. It is on it now.

## The rules, as decided by the owner

Either Daily keeps the streak — the OG and the GO are two ways to keep one streak, not
two. Finishing counts rather than winning, which matters because a Daily finalises on a
loss. The day is the player's local day, matching how Daily puzzles are already keyed.
Completing an older Daily from the calendar pays its rewards but never touches the
streak, so a lapsed streak cannot be bought back at 60 coins.

## How it works

**One optional field.** `lastDailyDate` on the progress record. Optional is the
load-bearing word: `progressSchema` is `.strict()` and pinned to `schemaVersion: 1`, so a
required field would have rejected every record written before it existed. This is the
same way `appliedRewards` and `dailyEntitlements` were added.

**Idempotency comes from the date, not from an operation id.** That is the same property
that makes finishing both the OG and the GO on one day count once and makes a retried
finalize a no-op. An operation id would have counted the second mode as a second day.

**No migration, by construction.** The record is JSON inside a `game_history` sentinel
row, so a new field is not a schema change. The one place SQL touches it is the account
reset, which zeroes `dailyStreak` and cannot know about a field added later. Rather than
write a forward migration, the transform reads a stored streak of zero as "no streak" and
restarts at one whatever date is on record — so a reset behaves correctly with no SQL at
all. This is why two fields were chosen over a set of recent dates: a set would survive
the reset and resurrect a streak the owner had just cleared, and *that* would have needed
a migration.

**The displayed streak lapses.** A stored streak is only current while its last day is
today or yesterday. Without that the panel would show a stale `7` to somebody who stopped
a month ago. The apply rule restarts at one after a gap, so the store and the display can
never disagree.

**Zero says something.** Never finished a Daily reads `start today`; finished one before
and lapsed reads `start again`. Two different situations, two different prompts.

## The bug this change had to dodge

The XP write was gated on `rewardXp > 0`. **A Daily loss with nothing solved earns no
XP** — which is exactly the case the owner asked to count. Hanging the streak off that
gate would have shipped a streak that silently ignored every bad day.

The two now share one `writeAccountProgressCas` call: one round trip, one `revision`
bump, and a no-op stays a no-op.

## Two things found on the way

**The local day key existed twice**, copy-pasted between `calendar-view.tsx` and
`daily-access-gate.tsx`. Both now import one function. Neither call site changed *when*
it runs — both still defer behind `queueMicrotask`, because computing the local day during
SSR bakes in the server's day rather than the player's.

**`vercel build` rewrites `tsconfig.json` and `next-env.d.ts`** as a side effect,
reformatting the arrays and repointing the types path from `dist` to `.next`. A `git add
-A` after a build sweeps both into the commit, which turns `format:check` red and would
have broken the bootstrap baseline. Restore both after every `vercel build`.

## Verified

**Local gate:** 213 domain · 31 browser · 24 fixture · 52 visual; bootstrap 107/107;
migrations 45/45 immutable plus 14 authorized additive, none added; parity 237/237;
102 CSS custom properties resolving. Budgets home 199192 B JS / 25030 B CSS, game
205593 B JS / 29940 B CSS — inside the 220/50 and 320/65 KiB ceilings.

**Hosted acceptance: green** at commit `a263de8` — 24 fixture · 3 services · 52 visual ·
237/237 parity acceptance-verified, cleanup on attempt 1 with **zero residue** across
every tracked resource.

### The end-to-end proof

The suite had never played a Daily. It seeded one through the legacy import and asserted
the panel, which left the whole chain — play, outbox, finalize, CAS, record, panel —
unproven against a real deployment.

It now plays today's OG Daily **to a loss** on the deployed build. Nothing solved earns
no XP and no coins, so it is precisely the case the old gate would have skipped, and the
run asserts the balances are untouched while the streak still moves. Because the account's
imported streak is dated `2026-07-20`, it also proves the lapse-then-restart path rather
than a simple increment.

Recorded from the run: `result: lost, rewardedXp: 0, rewardedCoins: 0, streakAfter: 1,
lapsedFrom: 2026-07-20`, with `lastDailyDate` written as `2026-08-15`.

Guesses are drawn from outside the answer catalog entirely, so the game cannot be won by
accident and the test never has to agree with the server about which word today holds.

**The gate is a named domain rule**, compared by test against rows the real builder
produces rather than against a restated copy. Two internally consistent sides that
disagree is how the signed-in shop went unnoticed in production, and TypeScript would not
have caught it here either.

### One test the change corrected

The services suite pinned `daily streak 5` from a legacy save whose newest Daily is
`2026-07-20`. That number is a month stale and the panel now says so. The assertion is
`start again`, which is stronger than the old one: an import that carried the number
without the date would render `start today`, so this pins the date coming across.

### One flake

The first hosted visual run timed out on Firefox on the text-only-zoom dropdown test — a
30-second timeout rather than an assertion failure, on a cold Preview, in a path this
change does not touch. It did not reproduce; the re-run was 52 passed. Recorded as a
flake rather than explained, which is the honest description.

## What is still open

Unchanged from v10 except that the streak is closed:

1. **Continuation pricing and the Daily unlock price are client-side.** The Methodology
   page says so plainly. Moving them server-side is a migration and its own change.
2. **`src/domain/rating.ts`** is a dead second copy of the Elo constants, imported only by
   a test. Its `Math.round` differs from Postgres on exact halves.
3. **A services-suite flake** on the draft-clear window, unexplained.
4. **Two legacy auth users** remain, invisible to every surface. Deterministic and
   unexplained; the next step is a direct `delete from auth.users` in the SQL editor,
   which bypasses GoTrue. Nothing depends on it.
5. **`list_my_accent_presets_v2` should coalesce `is_active`** at source. Needs a
   migration.
6. **The creator cannot see their own page treatment** while signed in, because opening
   your own public profile redirects to `/profile`.

## Rollback

Three commits, revertable independently. There is no migration to reverse and no data to
undo: a record that already carries `lastDailyDate` still parses against the previous
schema — the field is optional in both directions — so a revert leaves the streak frozen
at whatever it last reached rather than breaking anything.

## Known rollout property

The progress record is strict, so a browser tab left open across the deploy that then
reads a record written by the new build sees "Account progress could not be read safely"
until it is reloaded. The owner accepted this in exchange for one release rather than
two. It affects only tabs open across the deploy, and reload clears it.
