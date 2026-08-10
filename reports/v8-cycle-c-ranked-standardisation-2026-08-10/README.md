# v8 Cycle C — ranked standardisation and the bucket authority

**Date:** 2026-08-10
**Branch:** `codex/amordle-terminal-greenfield-implementation-2026-07-27`
**Range:** `9fc688d` (end of Cycle B) → `7eaf76d`
**Migration:** `20260810020000_amordle_ranked_buckets_v4.sql`, **applied** to the linked
project, authorised against `reports/v8-cycle-c-migration-decision-2026-08-10.md`.
**Preview:** `https://amordle-mf8zfbglv-ryanjosephkamps-projects.vercel.app` (protected)
**Production:** unchanged, frozen at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`. No release.

---

## What changed

**A rating-bucket table is now the authority.** Five tables each carried their own copy
of the same twelve-literal `CHECK` on bucket names. Going to 28 buckets would have made
those 40-entry arrays, five times over, and Cycle D would have meant editing all five
again. They are foreign keys to `brrrdle_private.amordle_rating_bucket` now. Retired
names are seeded inactive so the eight historical games keep referential integrity, and
nothing new can land in them.

**Ranked Practice is one comparable format:** five letters, expert, GO fixed at five.
A rating only means something if everyone competing for it is playing the same game;
leaving length and difficulty open would have sharded it into thousands of permanently
empty pools. Unranked and private matches keep every option, and the lobby _derives_ the
ranked configuration rather than sending whatever the form holds — so a player cannot
compose a ranked search the server would refuse.

**The clock ladder went from two options to seven** — untimed, 1, 3, 5, 10, 20 and 45
minutes per player. For unranked as well as ranked: a ranked-only widening would have
left unranked on the old two, which is backwards. Four validators that compared against
a literal `300000` ask the authority now.

**Settlement happens at the terminal transition.** The terminal state is caused by a
command, and commands come through one function, so the result lands whatever either
client does next. Cycle A's client-side auto-settle stays as a harmless replay — the
settlement takes an advisory lock and derives its idempotency key internally. Failures
are swallowed deliberately: a rating that cannot be written must never roll back a move
that was legitimately played.

**`get_public_site_stats_v1` was repaired.** It still filtered the bucket names retired
in July, so ranked participation reported as zero.

---

## Applied outcome, verified

|                                   | Before | After         |
| --------------------------------- | ------ | ------------- |
| `multiplayer_rating_profiles`     | 12     | 0             |
| `multiplayer_rating_transactions` | 12     | 0             |
| `multiplayer_match_results`       | 7      | 0             |
| ranked games still live           | 1      | 0 (cancelled) |
| stale queue rows retired          | —      | 25            |

A pre-apply dump of all three tables was taken first. Every deleted row was
single-game test residue: `games_played = 1`, rating exactly 1180 or 1220, still
provisional, two of them still naming July's buckets.

**The first apply attempt aborted** on `updated_at` not existing on
`multiplayer_matchmaking_queue`. Nothing was written — each migration runs in a
transaction — and the column was corrected to `expires_at`, which is how a stale request
is retired everywhere else in the schema.

---

## Verification

Local gate: **159 domain · 31 browser · 24 fixture · 46 visual**, bootstrap 107/107,
migrations 45/45 plus 9 authorised additive, budgets
`home 197,756 B JS / 23,752 B CSS`.

Hosted acceptance: **24 fixture · 3 services · 46 visual · 237/237 parity**, zero
residue.

The services suite plays real ranked matches, so it exercised the new bucket path,
automatic settlement and the standardisation refusals against live services. Two
assertions were strengthened rather than merely updated:

- The GO scenario sets the form to **seven letters and ten puzzles** and then starts a
  ranked search. It now asserts the queue row the server actually wrote — five letters,
  expert, GO five, bucket `async:go:untimed:std:v4` — which is standardisation proved
  from the outside rather than trusted.
- The ranked match settled with two rating profiles and two transactions summing to
  zero, with nobody pressing anything.

**One honest gap.** Site stats reports zero ranked players, and that is correct — the
hosted suite cleans up after itself, so there are genuinely none. The repair is verified
structurally (the function reads the authority table, and the old filter could never
match a v4 bucket) rather than by observing a non-zero count. The first real ranked match
will confirm it.

---

## What Cycle C did not do

- **No correspondence clocks and no scheduled job.** Cycle D.
- **A game that never reaches a terminal state still never settles.** Settlement rides
  the command that ends the match; if nobody ever sends it, nothing fires. That is
  exactly what Cycle D's inactivity job is for, and it is the remaining hole in
  "a result cannot be declined".
- **No portal, no live counts, no concurrency limits.** Cycle D.
- **No Production release.**

## Rollback

Forward-only, as every migration in this project has been. Code reverts to `9fc688d`.
The deleted rating rows are in the pre-apply dump; they are test residue, so in practice
the rollback is letting the next ranked match create them again.
