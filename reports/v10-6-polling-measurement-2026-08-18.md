# The polling saving, measured

**Date:** 2026-08-18 · **Run:** `feed_20260818T233952812Z_2dae391c`
**Script:** `scripts/measure-notification-feed.mjs` (`pnpm measure:feed`)
**Nature:** measurement and a correction. No migration, no deploy, no promotion.

Three sessions have now quoted a hosting ceiling built on a number nobody had
measured. This measures it, and the answer is not the one I predicted.

---

## The headline correction

I told the owner that the published figure — roughly 150–500 regular players
before free-tier egress binds — was **stale and understated**, and that things
were worse than I had said.

**That was half wrong.** Measured, the pre-v10.6 figure lands at **295–590
players** for a player with a few live games, which makes the published range
slightly *pessimistic* rather than understated. It only becomes understated for
a player carrying a long Practice history, where the rematch fan-out takes over.

The estimate was right for the wrong reasons. Two errors cancelled:

| | estimated | measured |
|---|---|---|
| Bytes per response | 2 KB | ~1.1 KB raw, ~0.2 KB compressed |
| Response headers | ignored entirely | **84% of the old path's egress** |

Guessing the payload roughly 2× too high and omitting the headers entirely
produced approximately the right total. That is luck, not method, and it is
worth writing down as such.

---

## What was measured

Two disposable accounts, created and destroyed through the same machinery the
acceptance harness uses. Against one of them, both call sets in the same
session:

- **OLD** — `settings`, `list_amordle_combat_active_v2`, the legacy
  `authority_version = 0` scan, `get_private_multiplayer_match_requests`, plus
  one `get_practice_multiplayer_rematch_requests` per terminal Practice game.
  Exactly what `loadNotificationFeed` used to issue.
- **NEW** — `get_player_notification_feed_v1`.

Each response measured three ways: body as delivered, the same body gzipped, and
the response headers.

### The seed, and how representative it is

**Four real v2 Practice games** created through the application's own RPCs — not
rows fabricated into the authority table, because a fabricated row would measure
a projection the game could never produce. Three were joined and are playing,
one left waiting.

Four rather than more because **a player may hold at most five active games**;
the first run asked for six and was refused with `ACTIVE_LIMIT`. So four is near
the ceiling the app itself enforces, and this seed is a realistic *upper* bound
for the live-games part of the feed.

**Three things the seed does not contain, and they matter:**

1. **No terminal Practice games**, so the rematch fan-out — the four-to-twenty-four
   range's entire upper end — was **not measured**. The old-path figures below
   are its floor, at four calls.
2. **No private match request.** The RPC refused: a requester must have an active
   public profile, which a disposable account does not have.
3. **No legacy games**, which is not a gap — a new account cannot have
   `authority_version = 0` rows, and neither can any account created since the
   v2 authority.

So this measures **an active player with live games and no completed Practice
history**. A long-standing player is worse on the old path and identical on the
new one.

---

## The numbers

Per poll cycle, on the wire:

| | calls | body (gzip) | headers | total |
|---|---|---|---|---|
| Old, empty account | 4 | 88 B | 4,215 B | **4,303 B** |
| Old, seeded | 4 | 810 B | 4,245 B | **5,055 B** |
| New, empty | 1 | 89 B | 883 B | **972 B** |
| New, seeded | 1 | 787 B | 914 B | **1,701 B** |

Per signed-in tab-hour, applying the rate change (30 s → 120 s, so 120 cycles
became 30):

```
seeded   before  120 × 5,055 B  =  0.578 MB/hr
         after    30 × 1,701 B  =  0.049 MB/hr      11.9× less

empty    before  120 × 4,303 B  =  0.492 MB/hr
         after    30 ×   972 B  =  0.028 MB/hr      17.7× less
```

### The finding that surprised me

**Collapsing four calls into one saved almost no payload.** The new response is
*larger* raw (4,531 B against 4,448 B) because it carries the same data plus its
wrapper, and only 23 bytes smaller compressed.

The entire benefit is fewer round trips and a slower rate. If Supabase billed
body bytes alone, the saving would be **4.1×** — purely the interval change, and
the one-request collapse would have bought nothing.

That makes one assumption load-bearing: **response headers count toward egress.**
They are 84% of the old path's cost, and they do traverse the wire, but I am
inferring Supabase's accounting rather than reading it. If headers are excluded
from their metering, the real saving is 4.1× rather than 11.9×, and every
player-ceiling figure below scales accordingly.

---

## The recomputed ceiling

Free tier: **5 GB egress per month.**

| | 30 min/day | 60 min/day |
|---|---|---|
| **Before v10.6** (seeded) | 590 players | 295 players |
| **After v10.6** (seeded) | **7,014 players** | **3,507 players** |

And the part the seed could not reach — the old path with a Practice history,
extrapolated from the measured per-call header cost:

| Terminal Practice games | Old path per hour | Players at 30 min/day |
|---|---|---|
| 0 (measured) | 0.58 MB | 590 |
| 5 | 1.22 MB | 280 |
| 10 | 1.86 MB | 183 |
| 20 (the cap) | 3.14 MB | 109 |

That column is the only place the published 150–500 was too generous, and it is
also the case that v10.6 helps most: after the change, none of those rows exist,
because the fan-out is one join inside the database.

**Where this leaves the project:** free-tier Supabase egress now supports
something on the order of **3,500–7,000 regular players**, up from a few
hundred. Egress is no longer the binding constraint. The next wall is the 200
concurrent realtime connections, and after that the 500 MB database.

---

## What went wrong on the way, twice

Both failures were mine, and both left rows in the live database that had to be
removed by hand. Zero residue was confirmed by query after each.

**The first run over-seeded and then could not clean up.** Six lobbies hit
`ACTIVE_LIMIT` at the sixth. Then `cleanup_amordle_combat_e2e_v2` refused
everything, because it only deletes a game whose creation key proves the run
owns it — `<runId>:` — and the script had written `<runId>-`. The guard was
right and the script was wrong. Five games and two accounts were removed by
hand, in dependency order, by exact id.

**The second run measured cleanly and then failed to delete its accounts.** The
cleanup RPC removed the games; GoTrue's admin delete returned an **empty 500**,
twice. Deleting the same rows through SQL succeeded immediately.

This is the `AuthRetryableFetchError` family v10 recorded and deliberately left
unexplained, and it is being left unexplained again rather than given a
plausible cause. Two things are worth knowing: it is not a data problem, since
the SQL path works every time; and it is intermittent, since the same call
succeeded in the v10.6 hosted acceptance run hours earlier. One theory was
tested and **disproved** — that the `revoke all` on `player_daily_entitlements`
had cost the service role its access. It has not:
`has_table_privilege('service_role', …)` returns true.

The script now prints the exact SQL to finish a stuck run by hand, so the next
occurrence is a paste rather than an investigation.

---

## Verification

- Residue after both runs: **zero**, confirmed by direct query — no disposable
  accounts, no seeded games.
- `pnpm lint` and `pnpm format:check` clean.
- The measurement evidence is at
  `.codex-internal/evidence/feed_20260818T233952812Z_2dae391c/measurement.json`.

## What is still not measured

The rematch fan-out, because a disposable account cannot cheaply acquire a
completed Practice history. The table above extrapolates it from the measured
per-call header cost, which is sound arithmetic on a measured unit — but it is
extrapolation, and it is labelled as such.
