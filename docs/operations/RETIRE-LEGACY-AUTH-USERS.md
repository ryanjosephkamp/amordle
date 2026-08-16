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

The cause has been ruled out on the data side with evidence: zero rows across all
eleven public tables (re-verified 2026-08-15), every foreign key to `auth.users` is
`cascade` or `set null`, the only two restrictive foreign keys in the schema
(`multiplayer_private_match_requests` → `public_player_profiles`) are cleared,
`host_user_id` / `player_one_user_id` / `player_two_user_id` are all nullable, there are
no triggers on `async_multiplayer_games`, they own no storage objects, and their auth
records are normal in shape — email confirmed, one email identity with a `sub`, no MFA
factors, not banned.

So running the delete in SQL is not a workaround. It is the diagnostic: it bypasses
GoTrue entirely and either succeeds, proving the fault is inside GoTrue, or prints the
exact Postgres constraint — which is the one fact still missing.

## How to run it

**This is the owner's to run** — it deletes data. It needs the Supabase SQL editor, not
a terminal, so it can be done from a phone: Supabase dashboard → the `squqdstdvbsvhagfuzgj`
project → SQL Editor.

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

### 2. Delete

```sql
delete from auth.users
where id in (
  '1060009f-a896-4abc-b132-1cac2abe8983',
  '051e6f74-4169-46b8-bf5e-eb1db503e686'
)
and email like '%@example.com';
```

The `email like` clause is deliberate belt and braces. It is not needed to select the
right rows — the ids already do that — but it makes the statement self-limiting: run
against the wrong project, or with an id mistyped into a real account's, and it deletes
nothing rather than something irreversible.

**If it fails,** copy the whole error. That message is the answer to a question that has
been open since v10, and it is the only place the real constraint will ever be named.

### 3. Confirm

```sql
select count(*) from auth.users where email like '%@example.com';
```

Expect `0`.

## Afterwards

Record the outcome in `progress/run_state.json` under `openWorkAfterV10` item 7 —
whether it succeeded (fault was in GoTrue) or what Postgres said (fault is a constraint,
and now named). Either way the item closes.
