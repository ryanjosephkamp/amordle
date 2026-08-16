# Migration decision packet — coalesce `is_active` at source

**File:** `supabase/migrations/20260816013000_amordle_accent_preset_is_active_coalesce_v1.sql`
**SHA-256:** `6e7aa2ba3a8450359d7bb7009d176b1fa708b26d40a28227a4c3ab375409dbf5`
**Status:** written and reviewed, **not applied**. Registered as
`reviewedPendingMigrations` in `scripts/verify-bootstrap-baseline.mjs`, which is the
slot for exactly this state — the gate now reports `reviewed pending additive 1/1`.
**Needs:** the owner's authorization, and the owner's terminal to apply.

---

## What it changes

One function body. `list_my_accent_presets_v2` currently computes:

```sql
profile.active_accent_preset_id = preset.preset_id as is_active
```

and after this becomes:

```sql
coalesce(profile.active_accent_preset_id = preset.preset_id, false) as is_active
```

Nothing else moves. The signature, `stable`, `security definer`, `set search_path = ''`,
the `auth.role()` and `auth.uid()` guards, the ordering, the `limit 24` and all three
grant/revoke statements are re-emitted exactly as they already are. No table, column,
constraint, index or row is touched. The migration reads and writes no data.

## Why

This is the SQL half of the v10.1 `/profile` defect. Save a custom accent, then switch
back to a named one: the preset row survives, `active_accent_preset_id` goes null, and
the comparison becomes `null = uuid` — which is NULL in SQL, not false. The client
demanded a strict boolean, the parse threw, and `/profile` rendered "Profile
unavailable" with a Try again button that could never succeed. It affected any player
who tried a custom accent and changed their mind.

v10.1 fixed it on the client. That fix is correct in meaning — "no active preset" is
exactly "this preset is not the active one" — but the decision belongs at the source.

**This is not a new policy.** `upsert_my_accent_preset_v2`, two functions further down
the same original migration, already returns
`coalesce(profile.active_accent_preset_id = v_preset.preset_id, false)`. Two functions
returned the same column and disagreed about whether it could be null. Only one of them
was ever wrong, and this brings it into line. Repository-wide there is exactly one site
computing this without a coalesce, and this is it.

## Why the client tolerance stays

Deliberately kept, not removed once this lands. A deployed browser is not upgraded in
step with the database, so during any window where one has moved and the other has not,
the tolerance is what keeps `/profile` working. And it is not a workaround — false is
the correct reading of that null. `tests/domain/accent-preset-contract.test.ts` says so
in as many words, so nobody removes it as dead code later.

## Risk

Low, and one-directional. A client that tolerates null also accepts false, so applying
this cannot break the deployed app. A client that demanded a strict boolean — the state
before v10.1 — would be *fixed* by it.

The one thing to know: `create or replace function` on a `security definer` function
re-establishes ownership and grants from the statement rather than inheriting them,
which is why every grant and revoke is re-emitted rather than assumed. A test asserts
they are all present in the file, so a future edit cannot quietly drop one and widen
who can call it.

## Reversal

Re-emit the previous body. It is the same statement with the coalesce removed:

```sql
    profile.active_accent_preset_id = preset.preset_id as is_active,
```

Nothing is lost by reversing, because no data is changed and no row records the
difference.

## How to apply

The owner's to run, from the repository root, on the desktop:

```bash
pnpm exec supabase db push --linked
```

Exactly one file should be pushed. Afterwards, regenerate types and re-run the gate:

```bash
pnpm generate:types
```

Types are expected to come back **byte-identical**: the function's return signature has
not changed, and `is_active` was already generated as `boolean | null`. Then move the
entry in `scripts/verify-bootstrap-baseline.mjs` from `reviewedPendingMigrations` to
`authorizedAdditiveMigrations` with the same hash, taking the count from 14 to 15, and
record the apply in `progress/run_state.json`.

Until that happens the repository and the database disagree by one function body, in the
safe direction: the database is the older, more permissive shape, and the client already
handles it.
