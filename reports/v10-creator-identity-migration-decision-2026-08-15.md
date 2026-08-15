# Forward-migration decision — creator identity

**Date:** 2026-08-15 · **Cycle:** v10 · **Status:** written and reviewed, **not applied**

| | |
| --- | --- |
| File | `supabase/migrations/20260815055205_amordle_creator_identity_v1.sql` |
| sha256 | `7b0600cc0ab501dbe6bcfe4477a66a184ee359e93cb45a338676e51a2317001f` |
| Registered as | `reviewedPendingMigrations` in `scripts/verify-bootstrap-baseline.mjs` |
| Immutable migrations touched | none — 45/45 unchanged |
| Authorized additive migrations | 13, unchanged until this one is applied |

## Why a migration is needed at all

Workstream D asks for a Creator flair and an animated accent restricted to one
account. Neither can be done client-side.

Flair today is pure self-assertion. `flairNames` is a TypeScript array, the
column has a `CHECK` listing the three permitted values, and
`phase29_validate_public_profile_flair_key` lowercases a string and tests it
against the same three. Nothing anywhere asks *who* is setting it. Adding
`creator` to those lists — which is required for the value to be storable or
renderable at all — would make it selectable by every player through the picker,
and by anyone at all through a direct RPC call.

The same is true of the accent.

## What it does

1. Widens the flair `CHECK` to include `creator`.
2. Widens the accent `CHECK` to include `voltage`.
3. Adds `public_player_profiles_creator_identity_check`, which permits either
   value only on the row whose `user_id` is
   `2bc33680-d9e5-4dd5-9965-24bc4ea43497`.
4. Re-emits both validators with the widened lists and a readable refusal.

## The choice worth explaining

**The restriction is a constraint on the row, not a test of the caller.**

A caller-based gate — checking `auth.uid()` inside the write path — would have to
be repeated in every write path. There are three today: the two v2 upserts and
the superseded v1. A fourth would inherit nothing. And the service role bypasses
`auth.uid()` entirely, so a job or an admin tool could hand the flair to anyone
without any code intending to.

Binding the value to a user id in a `CHECK` makes the rule a property of the
data instead. There is no code path that can violate it: not a hand-written RPC
call, not a direct table write, not the service role, not a future migration
that forgets this one exists. The database will refuse the row.

Both values are covered by one constraint rather than two, so the account is
named once, and widening later — to an admin account, or to every player once
the accent has proven itself — is a single edit.

The validators are re-emitted anyway, so an ordinary caller who somehow reaches
one gets "That flair is reserved." rather than a raw constraint violation. They
are the courtesy. The constraint is the authority. `tests/domain/creator-identity.test.ts`
asserts that both exist and that the client and the migration name the same
account.

The validators change volatility from `immutable` to `stable` because they now
read `auth.uid()`. Nothing indexes on either function, so no index is
invalidated.

## Risk

Low, and reversible.

- **Additive only.** No column is dropped, no data is rewritten, no existing
  function's signature changes.
- **No existing row can fail validation.** Every current row carries a flair and
  an accent from the old sets, so the new constraint evaluates
  `(true and true) or …` → true for all of them. The `ALTER TABLE ... ADD
  CONSTRAINT` will not error on existing data.
- **Reversal** is three `drop constraint` statements plus re-emitting the two
  validators from `20260801193000_amordle_accent_presets_v2.sql` and
  `20260801032334_amordle_public_community_v1.sql`. Nothing would be lost, since
  no row will hold the new values until the owner selects them.
- **Not applying it** is also safe: the application ships with `creator` and
  `voltage` in its enums and pickers, and the server would refuse them with
  "Unsupported public profile flair." No other behaviour changes.

## Verification after apply

1. `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.public_player_profiles'::regclass;`
   shows all three constraints with the expected definitions.
2. As the creator account, set flair `creator` and accent `voltage` and confirm
   the profile saves and renders.
3. As a second account, call `upsert_my_public_player_profile_v2` **directly**
   with `p_flair_key => 'creator'` and confirm it is refused. The UI gate is
   courtesy; this is the assertion that matters.
4. Confirm every existing profile still loads and every other flair and accent
   still saves.

## Authorization

Applying this migration to the linked project requires the owner's explicit
authorization. It has not been applied. On apply, its entry moves from
`reviewedPendingMigrations` to `authorizedAdditiveMigrations` in
`scripts/verify-bootstrap-baseline.mjs`, taking the authorized count from 13 to
14, and `pnpm generate:types` is re-run.
