# v8.1 — repair ranked matchmaking

**Date:** 2026-08-11 · **Range:** `6a27d12` → `7ab74fc`
**Migration:** `20260811010000_amordle_matchmaking_repair_v1.sql`, **applied**.
**Preview:** `https://amordle-h402khif2-ryanjosephkamps-projects.vercel.app` (protected)
**Production:** unchanged, frozen at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.

---

## What was wrong

The owner reported that two accounts entering the same ranked time control were not
matched, or matched only after a long delay. It was not slowness. Cycle D's concurrency
limits had deadlocked matchmaking, and the live database said so without ambiguity:

- Four queue rows sat in `matched` carrying a game id that **had no game**.
- One account was in **12 live games** against a limit of **10**.
- Eight of those twelve were `playing` with **zero moves**, abandoned since July.

**The chain.** `claim` pairs the players, flips both queue rows to `matched` and reserves a
game id. `finalize` _then_ ran the capacity check added in Cycle D, raised `COMBAT_LIMIT`,
and the game was never created. A refusal at that point could not undo any of the pairing,
so both players were left holding a row that pointed at nothing, retrying every five
seconds forever.

It compounded. The failure re-enabled the portal grid, so pressing again minted a **second**
queue request and orphaned the first — and because the authority pairs candidates
oldest-first, an opponent could then match with an orphan no client was watching.

Three defects from one change: the check ran in the wrong place, counted the wrong things,
and failed into a deadlock instead of a sentence.

## What changed

**Capacity is decided in `claim`, before a single row is written**, where a refusal costs
nothing. An opponent at their limit is **skipped rather than refused**, so one full player
cannot block the queue behind them. `finalize` lost its copy entirely — keeping a second
gate there would only restore the ability to strand a pair between the two calls.

**The limit counts games actually being played** — `playing` or `holding` with at least one
move. Open lobbies nobody joined are capped separately at five, which is the right place
for that limit and not this one.

**The four phantom rows are expired**, which is the truthful state: the match they name
never happened.

**The five abandoned legacy games are cancelled**, as authorised. Cancelled rather than
deleted: it is the transition the state machine defines for a game that ends unplayed, it
is what the owner would have done through the UI had it reached them, and it leaves the
action ledger referring to rows that still exist. The predicate was narrow — legacy source,
zero moves, created before August — so it could not touch a real game.

**Client.** Pressing a second time control now switches rather than stacks. The portal opens
the match it found, which it did not: auto-navigation was gated on a `/combat/practice`
prefix, so `/combat` — the page whose whole purpose is a button saying "find me a game" —
was the one place a match stayed closed. And `COMBAT_LIMIT` now names the limit and the way
past it instead of "matchmaking needs attention".

**Clear all**, requested by the owner, sits beside Mark all read. Dismissal is remembered
against a notification's revision, not its game, so clearing "your turn" hides it now and
the opponent's next move raises a fresh one. Dismissing permanently would let a player
silence their own turn alerts with a button pressed once for tidiness.

## Verified

Local gate **161 domain · 31 browser · 24 fixture · 46 visual**. Hosted acceptance
**24 fixture · 3 services · 46 visual · 237/237 parity**, zero residue.

The hosted two-account scenario now sends the joining player through the **portal** — the
path that was broken and which nothing covered. Both players reach the same game, and the
joiner's match opens by itself.

After apply: **0 live games, 0 phantom queue rows.** After a full hosted run that creates
real matches: still **0 phantoms**.

## Still open

The correspondence sweep ends an abandoned game but does not apply its rating, because
settlement identifies its caller and a job has no caller. Unchanged from Cycle D and still
the honest next piece of work.

Nothing reaps abandoned games automatically. The backlog that caused this was cleared by
hand; under the new counting rule it would no longer have blocked anything, but the rows
would still accumulate.

## Rollback

Code reverts to `6a27d12`. The migration is forward-only: it replaces three functions and
retires rows that were already dead. Reverting the code without the database would restore
the deadlock.
