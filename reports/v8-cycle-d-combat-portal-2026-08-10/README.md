# v8 Cycle D — the COMBAT portal

**Date:** 2026-08-10 · **Range:** `8ce6d2e` → `7cdc12f`
**Migration:** `20260810090000_amordle_combat_portal_v1.sql`, **applied**, authorised
against `reports/v8-cycle-d-migration-decision-2026-08-10.md`.
**Preview:** `https://amordle-67xa50t1j-ryanjosephkamps-projects.vercel.app` (protected)
**Production:** unchanged, frozen at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`. No release.

---

## What changed

**The portal exists, and it was filling a hole.** `[4] COMBAT` in the toolbar has always
pointed at `/combat`, and there has never been a page there — the mode's primary
navigation entry did nothing, while the whole of multiplayer lived in five sibling
routes with no way in. The portal leads with the choice the mode is about: ten time
controls by two modes, occupancy on every cell, one press to enter a queue. The five
existing routes stay reachable as named lanes, because notifications and results pages
link to them.

**Correspondence, without a second clock system.** The authority already stamps
`turn_started_at` on every turn, so a per-move deadline is a budget that refills at the
start of each turn. Writing the full allowance back to both seats after a move is the
whole mechanic — the materialisation that already existed then produces per-move
semantics with no branch of its own. Three controls at 1, 3 and 7 days per move, taking
the ladder to ten and the buckets to forty.

**Concurrency limits that count games.** The two limits that existed counted queued
requests and waiting lobbies, so nothing stopped a player holding as many live matches
as they could open tabs. Now ten overall, five per clock kind, one ranked game per rating
bucket — gated in both creation paths, because ranked finalize inserts directly rather
than routing through the shared constructor.

**Occupancy is banded, never counted.** At this player base an exact number plus knowing
where one friend is identifies them, and nobody can act on the difference between three
and four.

**One timeout implementation.** It used to be inline in the command function, which needs
an authenticated seated player. The daily sweep has neither. Rather than write the
transition twice — how two implementations drift until they disagree about who won — it
lives in one function both call.

---

## Verified after apply

40 active practice buckets · 10 distinct clocks · 12 per-move rows · both new RPCs
answering. Local gate **159 domain · 31 browser · 24 fixture · 46 visual**; bootstrap
107/107; migrations 45/45 plus 10 authorised additive. Hosted acceptance **24 fixture ·
3 services · 46 visual · 237/237 parity**, zero residue.

---

## What Cycle D does not do

**The sweep does not apply ratings, and this is the one thing to know.** Settlement
narrows its receipt to `auth.uid()`; a job has no caller. The alternatives were a second
copy of three hundred lines of Elo maths or loosening authentication on the one that
exists. So the job ends the game and the rating applies the moment either player next
opens it, with no button. For a correspondence timeout that is a weak dependency — the
player who did not abandon the game is the one who wins it — but it is a dependency, and
a system-callable settlement is the honest fix. It belongs in its own change.

Also outstanding: `/combat/active` still promises "recently completed games" while its
loader filters them out, and the app shell still suspends during SSR so every route's
first paint is a skeleton. Both are pre-existing and recorded rather than fixed.

## Rollback

Forward-only. Code reverts to `8ce6d2e`. The migration adds a column, twelve rows and
five functions; nothing was deleted.
