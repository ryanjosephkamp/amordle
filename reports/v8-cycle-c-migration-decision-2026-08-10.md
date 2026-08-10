# Amordle v8 Cycle C migration decision packet

**Status:** decision requested. Nothing written to the database, nothing applied
locally or to the linked project. No migration file has been created yet — this packet
describes what one would contain, so it can be argued with before it exists.

**Branch:** `codex/amordle-terminal-greenfield-implementation-2026-07-27`, HEAD `7010426`.
**Production:** frozen at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`. Not part of this request.

---

## Decision requested

Authorize one forward-only migration that does five things:

1. Moves ranked settlement into the terminal path, so a result cannot be declined.
2. Standardises ranked play to one format.
3. Replaces five hand-written bucket allowlists with a **lookup table**, and seeds it
   with 28 ranked-Practice buckets plus the existing Daily ones.
4. **Deletes** the existing ranked rating rows.
5. Repairs `get_public_site_stats_v1`, which still filters on pre-v2 bucket names.

Items 1, 2, 4 and 5 are the owner decisions already accepted. Item 3 is a technical
recommendation this packet exists to justify, because it is the one that changes table
structure rather than function bodies.

---

## What the investigation found

### The bucket allowlist is five copies of the same hand-written array

`20260724222000_amordle_authoritative_combat_v2.sql:70-160` drops and re-adds a CHECK on
five tables — `async_multiplayer_games`, `multiplayer_matchmaking_queue`,
`multiplayer_rating_profiles`, `multiplayer_match_results`,
`multiplayer_rating_transactions` — each enumerating the same **twelve** literals, which
are four pre-v2 names, two v1 timed names, two Daily names, and the four v2 names
actually in use.

Going to 28 Practice buckets means those arrays become 40-plus entries, five times over,
and Cycle D's correspondence controls would mean editing all five again. Beyond the
CHECKs, bucket literals appear in fourteen migration files, concentrated in the four
that define the live functions.

### `amordle_storage_bucket` is the validation gate, and it cannot express hard mode

`brrrdle_private.amordle_storage_bucket(p_mode, p_time_limit_ms)` returns null for any
clock other than untimed or 300000, and `create_amordle_ranked_practice_request_v2:935-947`
rejects a null bucket. So the clock allowlist is enforced _indirectly_: widening the
bucket function widens validation with it. That is convenient, and it also means the
function is load-bearing and cannot be changed casually.

It takes only `(mode, time_limit_ms)`. **Hard mode is a genuinely new input**, and there
are four separate hardcoded `300000` literals in the v3 authority that must move in
lockstep with it.

### Settlement is reachable but not automatic

`public.settle_amordle_ranked_practice_v2` is `security definer`, takes an advisory lock
on the game id, updates both seats in one statement, and derives its idempotency key
internally — so it is already safe to call more than once. It reads `auth.uid()` only to
narrow the _receipt_ it returns to the caller, not to authorise the rating maths.

That means the rating logic can be lifted into a private function with no caller
identity, called both from the terminal path and from the existing RPC. The public RPC
keeps its shape, so the Cycle A client-side auto-settle keeps working as a redundant
path rather than becoming dead code.

### The live data is negligible

Read-only counts taken 2026-08-09:

| Table                                    | Rows |
| ---------------------------------------- | ---- |
| `multiplayer_rating_profiles`            | 12   |
| `multiplayer_rating_transactions`        | 10   |
| `multiplayer_match_results`              | 6    |
| ranked games, all time                   | 8    |
| ranked games live at the time of reading | 1    |

Every rating row has `games_played = 1`, sits at exactly 1180 or 1220, and is still
flagged provisional. Two of them still carry the pre-v2 `async:go` bucket. They are
automated-test residue, several from the same day.

**This is the single most important fact in this packet.** It means the destructive step
costs nothing, and it means the structural change can be made now at a price that will
never be this low again.

---

## Recommended shape

### 1 · A bucket lookup table, not five arrays

```
brrrdle_private.amordle_rating_bucket (
  bucket        text primary key,
  scope         text not null,          -- 'practice' | 'daily'
  mode          text not null,          -- 'og' | 'go'
  time_limit_ms integer,                -- null = untimed
  hard_mode     boolean not null,
  active        boolean not null default true,
  sort_order    integer not null
)
```

The five CHECK constraints become foreign keys to it. `amordle_storage_bucket` becomes a
lookup against it rather than a `case` ladder, and gains `p_hard_mode`.

**Why a table rather than a validating function in the CHECK.** A function-based CHECK
looks tidier and is a trap: Postgres does not re-validate existing rows when the function
changes, so the constraint silently stops meaning what it says, and dump/restore ordering
between a function and the constraint that depends on it is fragile. A foreign key is the
boring, correct mechanism — it is enforced continuously, it fails loudly, and Cycle D
adds twelve rows instead of editing five arrays.

**Why it earns its keep beyond tidiness.** Cycle D's portal needs to list every time
control with a live count. With a table that is a join. Without one it is a hardcoded
list in the client that can drift from the server's idea of what is playable — which is
the same class of defect as the site-stats bug being repaired here.

**The cost, stated plainly.** Five foreign keys added to existing tables, and the legacy
bucket names must be seeded as `active = false` rows so the eight historical games do not
violate them. That is the whole risk surface, and it is small because the tables are
nearly empty.

### 2 · The 28 ranked-Practice buckets

Seven whole-match controls × two modes × hard mode on/off:

| Clock      | `time_limit_ms` |
| ---------- | --------------- |
| Untimed    | `null`          |
| 1 minute   | 60000           |
| 3 minutes  | 180000          |
| 5 minutes  | 300000          |
| 10 minutes | 600000          |
| 20 minutes | 1200000         |
| 45 minutes | 2700000         |

Bucket strings become self-describing — `async:<mode>:<clock>:<hard|std>:v4`, with
`untimed` for a null clock — so one parser and one formatter replace the hand-written
ladders. `resolveRatingLane` in `src/domain/profile.ts` sniffs substrings and cannot
express a clock or hard mode at all; it gets replaced, not extended.

Daily keeps its two existing buckets untouched. Cycle D adds twelve rows for the three
correspondence controls, reaching forty.

### 3 · Ranked standardisation

5 letters, expert word list, GO fixed at 5 puzzles, enforced in
`create_amordle_ranked_practice_request_v2`. Unranked and private matches are untouched
and keep every option.

### 4 · Settlement in the terminal path

Extract the rating maths into `brrrdle_private.amordle_settle_ranked(p_game_id)`, called
from `save_amordle_combat_command_v2` whenever a ranked game reaches a terminal state,
and from the existing public RPC. `create or replace` on existing functions; no schema
change from this item.

### 5 · Destructive step

```sql
delete from public.multiplayer_rating_transactions;
delete from public.multiplayer_match_results;
delete from public.multiplayer_rating_profiles;
```

Ranked only. Solo history, Daily history, `async_multiplayer_games` transcripts, profiles,
settings, inventory and coins are all untouched.

Any ranked game not in a terminal state at apply time is cancelled in the same
transaction, so no game can outlive the bucket it was stamped with. Cancelled ranked games
never settle a rating, so nothing is lost.

---

## What this does not do

- No new HTTP route. The interface count stays at three.
- No change to game rules, scoring, evidence colours, or the word lists.
- No correspondence clocks and no scheduled job — Cycle D.
- No Production release.

## Risks

| Risk                                               | Mitigation                                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Five new foreign keys on existing tables           | Legacy bucket names seeded `active = false`; the tables hold 28 rows in total                               |
| A ranked game in flight at apply time              | Cancelled in the same transaction; one such game exists, itself test residue                                |
| Ratings deleted irreversibly                       | All 12 rows are single-game test artifacts; a `pg_dump` of the three tables is taken first regardless       |
| `amordle_storage_bucket` is the validation gate    | Its new signature is exercised by the existing refusal tests before anything else is changed                |
| Roughly 75 bucket literals across source and tests | Replaced by one parser and one formatter; `verify:parity` and the services suite both fail loudly on a miss |

## Verification before apply

`supabase db push --dry-run` must identify exactly one new file. Full local gate, then a
protected Preview and hosted acceptance. The services suite plays real ranked matches
end to end, so it exercises the new bucket path, the standardisation refusals and
automatic settlement against live services.

## Rollback

Forward-only, as every prior migration in this project has been. The revert point for the
code is `7010426`. The deleted rating rows are recoverable from the pre-apply dump; they
are test residue, so in practice the rollback is "let the next ranked match create them
again".

---

## Authorisation requested

> Apply the Cycle C migration as described, including the deletion of the existing ranked
> rating rows and the cancellation of any ranked game in flight.

Nothing proceeds past writing the migration file until that is given.
