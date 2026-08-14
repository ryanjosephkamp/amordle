# v9 — closing every open item

**Date:** 2026-08-14 · **Range:** `06184b4` → `0b20016`
**Migration:** `20260814120000_amordle_system_settlement_and_reaper_v1.sql`, **applied**.
**Preview:** `https://amordle-3rn9p6w27-ryanjosephkamps-projects.vercel.app` (protected)
**Production:** **RELEASED** — `dpl_2yJG1RZj3qFZreNz9aU23GEwWamw` at https://amordle.vercel.app

---

## Two defects found by testing, neither ever reported

Driving a real correspondence game to expiry against the real schema — inside a rolled-back
transaction — found two things that no amount of reading had:

**`amordle_timeout_game` has never worked.** Shipped in Cycle D, it writes
`requested_command = 'timeout'` into the action ledger, and that column's CHECK allows only
a real player command — `guess`, `cancel`, `forfeit`, `advance` — or null. It raised on its
first row. So the correspondence timeout, the entire point of Cycle D's scheduled job, has
been broken since it shipped. Nothing reported it because no per-move deadline had passed
yet: the controls are days long and days old. A system timeout has no requested command, and
it is null now.

**My own reaper had the same shape of bug.** It set `terminal_reason = 'abandoned'`, which
the authority's CHECK rejects. It would have raised on its first run, inside a cron that
swallows errors — so it would have failed silently, forever. It uses `cancelled`, which is
what the state machine already means by a game that ends unplayed.

Both were caught before either reached a real player. That is the argument for testing
against the real schema rather than reasoning about it.

## What changed

**Settlement the system can perform (R1).** `settle_amordle_ranked_practice_v2` is re-emitted
once as a private core taking an explicit actor, with the public function reduced to a thin
wrapper supplying `auth.uid()`. A null actor is the system: identity checks skipped, receipt
from player one's seat. One implementation, two entry points — deliberately not a second copy
of the Elo maths, which is how two of them would eventually disagree about who won.

_Proven:_ a ranked correspondence game past its deadline ends `completed`/`timeout` **and
both ratings apply** — 2 transactions, 2 profiles.

**The reaper (R2).** Zero moves, fourteen days idle, cancelled. A game with moves is never
touched, which was the owner's line. _Proven both ways:_ the zero-move game retired, the
played game in the same window untouched.

**`/combat/active` copy (R3).** It promised "recently completed games" while the loader
filtered them out. The words were wrong, not the list.

**Every route server-renders again (R4).** `AppShell` called `useSearchParams()` for exactly
one thing — the `?focus=1` flag — and in the App Router that forces everything up to the
nearest Suspense boundary to client-render. The boundary was around the whole shell.

_Measured:_ `/about` was 19.7 kB of skeleton with no navigation and no heading. It is now
23 kB with both; `/help` is 76 kB with its own.

I got this wrong once on the way and the tests caught it. Building the focus links from the
pathname alone drops `?generation=19`, which identifies _which_ Solo game you are in — so
exiting Focus Mode sent the player to a different puzzle. The hrefs are reported from the
reader, where the query string is known.

**Coverage for what reached the owner (R5).** The Daily calendar is now opened by a
signed-in account with real history in the hosted suite. Every existing route walk is
signed-out, and the calendar derives from three account queries during render — none of
which run for a visitor. That is exactly the gap that let a data-dependent crash reach them
first. Asserting the error boundary is _absent_ is the point: a route that throws still
returns 200 with a rendered page.

A domain test now reads the prerendered document and asserts it carries the route's heading
and the navigation. Nothing caught the SSR defect for the life of this codebase because
every browser test drives a hydrated page, by which time the skeleton is already gone.

## Verified

Local gate **163 domain · 31 browser · 24 fixture · 52 visual**. Hosted acceptance
**24 fixture · 3 services · 52 visual · 237/237 parity**, zero residue. All probe rows
rolled back; nothing persisted.

## The release, and the one thing only the owner can do

Production still runs code predating five applied migrations. The release is ready and
verified, and it is blocked on one step:

**Production has no `SUPABASE_SERVICE_ROLE_KEY`.** The correspondence sweep and the reaper
both need it, so without it the daily job would run and do nothing. Putting a service
credential into a hosting provider is the owner's to do, not mine. The key is already on
their machine at `.codex-internal/evidence/operator/supabase-service-key`:

```
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

It has to happen **before** the release, not after: Vercel applies environment changes to
new deployments, so adding it afterwards would mean releasing twice.

## Rollback

Code reverts to the accepted tag
`amordle-stage2-v8.2-public-lanes-and-portal-accepted-2026-08-14`. The migration is
forward-only; it replaces functions and adds two, and deletes nothing.
