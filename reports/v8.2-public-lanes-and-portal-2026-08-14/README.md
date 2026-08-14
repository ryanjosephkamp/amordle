# v8.2 — the public ranked surfaces, the portal, and two defects

**Date:** 2026-08-14 · **Range:** `db5bd68` → `c7326ce`
**Migration:** `20260814010000_amordle_public_ranked_lanes_v4.sql`, **applied**.
**Preview:** `https://amordle-10g94gn05-ryanjosephkamps-projects.vercel.app` (protected)
**Production:** unchanged, frozen at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.

---

## The leaderboard miss, stated plainly

Cycle C renamed every ranked Practice rating pool to `async:<mode>:<clock>:<hard|std>:v4`.
It repaired the authority and `get_public_site_stats_v1` — and stopped there. Three public
read functions still hardcoded the pre-Cycle-C names, in three places each, and were never
re-emitted:

| Function                             | What it was doing                                                           |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `get_public_ranked_leaderboard`      | Filtered on `async:og:amordle:v2` — zero rows — and rejected any v4 lane id |
| `list_public_player_directory_v1`    | Same stale whitelist; ranked filtering was dead                             |
| `get_public_player_profile_stats_v1` | A `case` whose every arm was retired, so ratings projected as null          |

That is my miss, not a new defect, and it was wider than the owner realised: they reported
the leaderboard, and two other surfaces were broken the same way.

All three now read the bucket table rather than a literal list, through one small lane
vocabulary — `amordle_lane_is_public`, `amordle_lane_public_id`,
`amordle_public_lane_storage`, `amordle_lane_key`. A v4 name is self-describing, so it is
the public lane id directly and there is no second scheme to keep in step. The next ladder
change carries these functions along for free, which is the property that was missing.

**Verified after apply, against live data:** profile stats returns `async:og:5m:std:v4` at
1162 with 2 games, where it previously projected null; the directory accepts a v4 lane. The
leaderboard requires a signed-in caller, so it is covered by the hosted suite rather than by
a service-key probe.

The client picker now offers the portal's own controls — mode, Hard Mode, and the
time-control ladder, imported rather than restated. The old four-lane list is gone; a second
copy of the ladder is exactly how those stale names survived.

## The portal

A tile grid, after the owner's reference: one large tile per time control, OG/GO as a
segmented control. That dissolves the misaligned `OG`/`GO` column headers they also
reported — the headers stop existing.

**Occupancy is visible now, which was the point.** Every tile rendered identically whether
anyone was there or not, so the live counts the whole page exists to show were invisible.
Presence raises the tile — full-strength border, standard surface, an accent rail that
thickens with the band — and says so in words. A colour-blind reader, a forced-colors user
and a greyscale screenshot all get the same answer.

Four columns on a desktop and two on a phone from one rule, with a cap on the grid: a floor
low enough for two columns at 390px gives seven at 1280px, which is a row of thin slabs
rather than a grid of tiles.

## The notification header

`.section-heading` is a two-child layout with no wrap. Clear all made it three children in a
24rem panel, so the title was flexed below its own text width and, with nothing clipping it,
printed underneath the buttons. The actions are one group now and the heading wraps.

## The Daily route

**The error page reports what failed.** It said the same sentence whatever the cause and
sent the real error to a console nobody had open — a whole tab was unusable and there was
nothing to act on. The message, digest, page and build now sit behind a disclosure with a
copy button.

**The calendar's derived state is defensive.** Stated plainly: this is containment, not a
diagnosis. I could not reproduce the crash — the route passes signed-out in three engines
and the owner's own rows parse cleanly — so rather than guess, the derivations stop being
able to throw. If the cause lies outside them, the error page is what will say so.

## Verified

Local gate **161 domain · 31 browser · 24 fixture · 52 visual**. Hosted acceptance
**24 fixture · 3 services · 52 visual · 237/237 parity**, zero residue.

Both new geometry tests were verified to fail without their fix. The header test reproduces
the **un-grouped** shape on purpose: testing the repaired markup passed with or without the
stylesheet, because grouping is itself most of the repair. A test that passes either way is
worth nothing.

## Also

A push was rejected with `GH007` after the owner made their GitHub email private. The
repository-local `user.email` is now their GitHub `noreply` address and the one unpushed
commit was re-authored. Their global git config is untouched.

## Still open

The Daily crash has no confirmed cause. The correspondence sweep still does not apply
ratings. Neither is new in this pass.
