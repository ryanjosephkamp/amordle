# Retiring the last two legacy auth users

**Status at 2026-08-15:** both still exist. Nothing player-facing depends on them, and
they are invisible on every surface because they hold no row in any `public` table.

|                                        |                                                                     |
| -------------------------------------- | ------------------------------------------------------------------- |
| `1060009f-a896-4abc-b132-1cac2abe8983` | `amordle.e2e_20260725040615_1f60194096d2.parityuione@example.com`    |
| `051e6f74-4169-46b8-bf5e-eb1db503e686` | `amordle.e2e_20260725035717_7e71e7bf7df4.parityuione@example.com`    |

Both carry the old harness's reserved-domain `@example.com` address, which is what
identifies them as machines rather than people. No real account uses that domain.

## Why the script cannot finish the job

`scripts/retire-legacy-test-accounts.mjs` deletes through GoTrue's admin API, and for
these two it returns `AuthRetryableFetchError`, status 500, with an **empty body**. The
exception happens inside GoTrue's own delete transaction, where no client can see it.
Two `--apply` runs produced byte-identical failures, so this is not the transient fault
the error's name implies.

## The cause, found 2026-08-16

Running the delete through `supabase db query --linked` bypassed GoTrue and printed the
exception GoTrue had been swallowing. It is a **trigger**, not a constraint:

```
ERROR: 23503: insert or update on table "multiplayer_daily_claims"
violates foreign key constraint "multiplayer_daily_claims_user_id_fkey"
DETAIL: Key (user_id)=(051e6f74-…) is not present in table "users".
CONTEXT: … PL/pgSQL function public.enforce_async_daily_multiplayer_claim()
SQL statement "UPDATE ONLY "public"."async_multiplayer_games"
              SET "host_user_id" = NULL WHERE $1 = "host_user_id""
```

The chain, in order:

1. Deleting the auth user makes Postgres honour `async_multiplayer_games.host_user_id`,
   which is `ON DELETE SET NULL`, by issuing an `UPDATE … SET host_user_id = NULL`.
2. That table carries `enforce_async_daily_multiplayer_claim_trigger`, which fires
   `BEFORE INSERT OR UPDATE OF … host_user_id, …` — so the cascade's own update trips it.
3. The trigger calls `claim_daily_multiplayer_participation(new.player_one_user_id, …)`,
   which inserts into `multiplayer_daily_claims`.
4. That insert's foreign key points at `auth.users`, and the user has already been
   removed inside the same transaction. It fails, and the whole delete rolls back.

**This is why only these two are stuck.** The eight that deleted cleanly were non-hosts,
so nothing ever issued a `host_user_id` update for them. The v10 report identified that
pattern and then dismissed it, on the strength of a check that reported *no triggers on
`async_multiplayer_games`*. There are two. That check was simply wrong, and it cost the
investigation its best lead.

**It is not a live defect.** A real player deleting their account never hits this,
because `service_detach_deleted_combat_player_v1` nulls those columns *first*, while the
auth row still exists — so the trigger's re-claim satisfies its foreign key, and by the
time GoTrue removes the user there is nothing left to cascade. These two are stuck
precisely because the earlier retire script deleted their public rows without ever
running that detach, leaving six games still pointing at them.

## How to run it

**This is the owner's to run** — it deletes data. Use the terminal, so the real error is
visible if anything else surfaces; the Supabase SQL editor also works and needs no
terminal, but it intercepts destructive statements behind a confirmation dialog.

### 1. Confirm what you are about to delete

```sql
select id, email, created_at, banned_until
from auth.users
where id in (
  '1060009f-a896-4abc-b132-1cac2abe8983',
  '051e6f74-4169-46b8-bf5e-eb1db503e686'
);
```

Expect exactly two rows, both with `@example.com` addresses. **If it returns anything
else, stop** and do not run step 2.

### 2. Detach them from their games first

This is the step the earlier retire script skipped, and the whole reason the delete
fails. It runs the application's own detach — the same function account deletion calls —
which nulls `host_user_id`, `player_one_user_id` and `player_two_user_id` **while the
auth row still exists**, so the trigger's re-claim satisfies its foreign key.

```sql
select public.service_detach_deleted_combat_player_v1('1060009f-a896-4abc-b132-1cac2abe8983');
```

```sql
select public.service_detach_deleted_combat_player_v1('051e6f74-4169-46b8-bf5e-eb1db503e686');
```

Nothing is deleted here. Six terminal games from 2026-07-25 stop naming these accounts
and stay where they are, which is what the app does for every player who deletes an
account.

### 3. Delete

```sql
delete from auth.users
where id in (
  '1060009f-a896-4abc-b132-1cac2abe8983',
  '051e6f74-4169-46b8-bf5e-eb1db503e686'
)
and email like '%@example.com'
returning id, email;
```

The `email like` clause is deliberate belt and braces. It is not needed to select the
right rows — the ids already do that — but it makes the statement self-limiting: run
against the wrong project, or with an id mistyped into a real account's, and it deletes
nothing rather than something irreversible. `returning` makes the outcome unambiguous:
two rows back means two rows gone.

### 4. Confirm

```sql
select count(*) from auth.users where email like '%@example.com';
```

Expect `0`.

## Afterwards

Record the outcome in `progress/run_state.json` under `openWorkAfterV10` item 7 —
whether it succeeded (fault was in GoTrue) or what Postgres said (fault is a constraint,
and now named). Either way the item closes.
