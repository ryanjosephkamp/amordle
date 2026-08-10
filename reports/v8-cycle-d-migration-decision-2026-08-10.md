# Amordle v8 Cycle D migration decision packet

**Status:** decision requested. Nothing written, nothing applied, no migration file
created. This describes what one would contain so it can be argued with first.

**Branch:** `codex/amordle-terminal-greenfield-implementation-2026-07-27`, HEAD `8ce6d2e`.
**Production:** frozen at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`. Not part of this request.

---

## Decision requested

Authorize one forward-only migration plus the client work for the COMBAT portal:

1. **Three correspondence time controls**, taking the ladder to ten and the bucket count
   to forty.
2. **A scheduled settlement** so a correspondence game that is abandoned resolves itself.
3. **Concurrency limits** on games in progress, enforced server-side.
4. **A live-occupancy RPC** so the portal can show where players actually are.
5. **The portal itself** — one COMBAT entry point in place of five separate pages.

Items 1 and 2 close the hole Cycle C left open. Items 3 to 5 are the portal the original
request was about. **Four of them carry a decision I should not make alone; they are
marked and answered below.**

---

## What the investigation found

### Correspondence is a new mechanic, but a small one

The clock today is a **whole-match budget**: `player_one_time_remaining_ms` and
`player_two_time_remaining_ms` are decremented against `turn_started_at` while it is your
turn. A correspondence clock is per _move_ — each turn gets a fresh allowance.

That sounds like a second clock system, and it is not, because the authority already
maintains `turn_started_at` on every turn. A per-move deadline is exactly
`turn_started_at + N`. So correspondence needs one new idea, not a new subsystem: a
`clock_kind` of `budget` or `per_move` on the bucket row, and one branch in the timeout
evaluation. No new column on the authority at all.

### The timeout is already opportunistic, and that matters

`save_amordle_combat_command_v2` materialises the clock server-side and declares a
timeout when the budget is exhausted — it does not trust a client assertion. The
consequence is that **a correspondence deadline is enforced the moment either player
opens the game.** The scheduled job is only the backstop for the case where nobody ever
looks again, which is precisely the case that has no other answer.

That changes how often the job needs to run, and it is the reason for the recommendation
in decision 1.

### There is already a scheduled job, and only three HTTP interfaces

`/api/cron/refresh-word-lists` runs daily at 00:00 from `vercel.json`, authenticated with
`Bearer ${CRON_SECRET}`. The project allows itself exactly three HTTP routes and all
three are in use, so a fourth would need `scripts/verify-api-count.mjs` changed — a
governance decision, not a code one.

The boundary scanner forbids server-only configuration in **client** files only, so a
service-role client under `src/server/` is permitted. That was checked, not assumed.

### The concurrency limits that exist do not limit games

Two limits exist today: five queued-or-matched ranked requests per user, and five
_waiting_ public lobbies per user. Neither counts **games in progress**, which is what
was actually asked for. Nothing stops a player holding twenty live matches.

### Live counts do not exist outside the admin dashboard

The only place occupancy is computed is `get_admin_operational_dashboard_v1`, which
raises `42501` for non-admins. The portal needs a new `security definer` projection over
the authority and queue tables.

---

## Recommended shape, and the four decisions

### 1 · The three correspondence controls — **decision**

I recommended **8 hours, 1 day, 3 days** per move in the Cycle C handoff. I now think
that was wrong, and the reason is the schedule.

A daily backstop means an 8-hour control could be settled up to 24 hours late when a game
is abandoned. Making the job hourly would fix that, but Vercel's cron frequency depends
on the plan, and I would be designing a game around a billing tier.

**Recommended: 1 day, 3 days, 7 days per move.** All three are enforced exactly the
moment either player opens the game, and the daily backstop is never more than a day
coarse against a deadline measured in days. It also matches the original ruling that
correspondence should settle automatically on a 5–7 day scale. Ten controls, forty
buckets, no dependency on how often the platform lets us run a job.

If you want a same-day correspondence option, say so and I will price the hourly cron
instead — it is a real option, just one with a cost attached.

### 2 · How the job authenticates — **decision**

**Recommended: extend the existing daily cron route.** It already has the schedule, the
`CRON_SECRET` check and the tests. Adding a service-role Supabase client to it and
calling one new RPC keeps the interface count at three, so no governance rule is
relaxed, and adds no new secret.

The alternative — a fourth route at `/api/cron/settle-correspondence` — is tidier to read
and requires changing the sanctioned route list. I do not think one more endpoint is
worth spending that rule on for a job that runs once a day.

### 3 · The concurrency limits — **decision**

The original request said: one game per rating bucket for timed play, five timed
simultaneously, five correspondence, ten overall.

**Recommended: adopt those numbers as written**, with one clarification — the
"one per rating bucket" rule applies to _ranked_ games only. Two unranked friendlies at
the same time control are not a rating problem, and refusing them would be surprising.

Enforced in the creation and claim paths, which is where every existing limit lives. A
client-side limit is a suggestion; these are refusals.

### 4 · What the portal replaces — **decision**

COMBAT is currently five routes: `/combat/practice`, `/combat/lobby`, `/combat/daily`,
`/combat/live`, `/combat/active`. That is the "afterthought" problem stated as a sitemap.

**Recommended: a new `/combat` portal that becomes the destination of the `[4] combat`
shortcut, with the five existing routes kept and reachable from it.** The portal leads
with the ranked grid — every time control, live occupancy, one click to queue — and
offers unranked, Daily and private as named lanes.

Keeping the old routes is deliberate: they are linked from notifications, from results
pages and from the legacy bridges, and breaking those to make a navigation point is a bad
trade. They can be retired later once the portal has proved itself.

### 5 · Live counts, and the leak

Raw counts leak information when the player base is small: "1 player queued at 3m OG" plus
a friend's status tells you who. **Recommended: report banded occupancy** — none, 1–2,
3–5, 6–10, 10+ — rather than exact numbers, for queue depth and live games alike. The
portal reads the same either way, and precision no player can act on is not worth the
inference it hands over.

---

## Files

| Area                                           | Change                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| new migration                                  | `clock_kind` on the bucket table, twelve correspondence rows, the per-move timeout branch, concurrency limits in the creation and claim paths, the occupancy RPC, the settlement RPC |
| `src/app/combat/page.tsx`                      | new portal route                                                                                                                                                                     |
| `src/features/combat/`                         | the portal grid, occupancy display, correspondence affordances                                                                                                                       |
| `src/app/api/cron/refresh-word-lists/route.ts` | call the settlement RPC alongside the freshness check                                                                                                                                |
| `src/server/`                                  | a service-role client for the cron path                                                                                                                                              |
| `src/domain/profile.ts`                        | three more ladder entries, `clock_kind` in the parser                                                                                                                                |
| tests                                          | occupancy banding, every limit refused at the boundary, a correspondence game settling from the job rather than a click                                                              |

## Risks

| Risk                                                                               | Mitigation                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A per-move branch in the timeout path is the most safety-critical code in the game | It reuses `turn_started_at`, which is already maintained and already tested; the budget branch is untouched                                                  |
| The cron job settles games nobody is watching                                      | It calls the same settlement path a player's own move would, so there is one implementation, not two                                                         |
| Concurrency limits could lock a player out                                         | Limits count games in progress, which end; the existing request limits are the ones that could strand someone, and they already expire after fifteen minutes |
| The portal is a navigation change                                                  | The five existing routes stay reachable, so nothing that links to them breaks                                                                                |

## Verification

`supabase db push --dry-run` must identify exactly one new file, the migration registered
in the bootstrap ledger by hash. Full local gate, protected Preview, hosted acceptance.
The correspondence settlement needs a test that runs the job rather than a click, which
means the services suite gains a scenario that backdates `turn_started_at` and then
invokes the RPC directly.

## Authorisation requested

> Apply Cycle D as described, with the recommended answers to decisions 1 to 5.

Nothing proceeds past writing the migration file until that is given.
