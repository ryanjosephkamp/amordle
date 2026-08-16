# v10.4 — the open-item sweep

**Date:** 2026-08-15 · **Range:** `48d677b` → `96de2fa`
**Migration:** one **written and not applied** — the owner's to authorize and push
**Preview:** <https://amordle-owvesbjni-ryanjosephkamps-projects.vercel.app> (protected), commit `96de2fa`
**Production:** unchanged at `dpl_HtzTTEomEP6UHeLYs4kKQ53gCJPJ` — release is the owner's

Scope was every open item after v10 **except** server-side pricing, which the owner
deferred to its own session.

---

## Seeing your own profile

Every player has a public profile at an address they are invited to copy. It was the one
address they could not open: `/players/<your id>` redirected its owner to `/profile`, so
the only person who could never see what a profile looks like was the person who owned
it. That is also why the creator page treatment was invisible to the creator.

**The redirect is gone rather than made conditional.** A query-parameter escape hatch
would have made the property true for one button and false everywhere else; removing it
makes "your public link opens for you" hold from every entry point, including your own
name in a leaderboard row. Your public page is now the same page everybody else reads,
with `EDIT PROFILE` on it when it is yours — the link that existed before the redirect
made it unreachable — and `VIEW PUBLIC PROFILE` on the editor beside the copy button.

Three things it had to get right:

- **`PrivateChallengeForm` was already gated on `!isMine`**, so removing the redirect
  could not expose a challenge-yourself path. That was luck, but checkable luck.
- **Your own private profile resolves to nothing here**, exactly as it does for everyone
  else. Correct, and baffling to read about yourself, so the owner gets a panel that says
  which it is and offers the way to publish rather than "Player not found".
- **The narrow-width rule targeted `.public-profile > .button`**, which stopped being a
  direct child the moment the buttons went into a wrapper. It would have silently broken
  the mobile layout; it now targets the wrapper and stays a row where full width allows
  one.

_Proven:_ the hosted suite drives both directions — the owner is not redirected, sees
`EDIT PROFILE`, and returns to the editor with it; a visitor sees `COPY LINK` and no
`EDIT PROFILE`. `EDIT PROFILE` only renders once the is-this-me query resolves, which is
exactly when the old redirect fired, so waiting for it and *then* reading the URL proves
the redirect is gone rather than merely slow.

## The duplicate Elo constants

`src/domain/rating.ts` held a second copy of the Elo constants that nothing imported
except one test — so the test proved the duplicate agreed with itself, which is the one
thing that could never be in doubt.

It was also **subtly wrong**. JavaScript's `Math.round` breaks exact halves upward;
Postgres `round()` on numeric breaks them away from zero. A settlement landing exactly on
`.5` would have disagreed by a point.

Deleted, and replaced by `tests/domain/rating-contract.test.ts`, which reads the
migration that actually settles ratings — the same shape as the economy and
creator-identity contracts. It pins the 400-point scale, K = 40 provisional and 24 after
ten games *per player*, `round(K × (S − E))`, the 1/0/0.5 scores, the tenth-game
provisional boundary and the 1200 seed, and checks the Methodology page against them
rather than against a restatement.

**The gate caught what the deletion broke.** Four MP-09 clauses in the audit registry
cited the deleted test by name. They now cite the three replacements, and the evidence is
strictly better than what it replaced.

## The accent-preset coalesce — written, not applied

`supabase/migrations/20260816013000_amordle_accent_preset_is_active_coalesce_v1.sql`,
sha256 `6e7aa2ba3a8450359d7bb7009d176b1fa708b26d40a28227a4c3ab375409dbf5`.

This is the SQL half of the v10.1 `/profile` defect: `list_my_accent_presets_v2` computes
`profile.active_accent_preset_id = preset.preset_id`, which for a null left side is NULL
rather than false.

**Not a new policy.** `upsert_my_accent_preset_v2`, two functions down the same original
migration, already coalesces. Two functions returned the same column and disagreed about
whether it could be null; exactly one site in the repository lacks the coalesce and this
is it.

Registered in `reviewedPendingMigrations` — a slot that already existed for exactly this
state — so the gate reports `reviewed pending additive 1/1` and nobody mistakes it for
live. The client tolerance is deliberately **kept** after it lands: a deployed browser is
not upgraded in step with the database, and false is the correct reading of that null.
The test now says so, so it is not deleted later as dead code.

Decision packet: `reports/v10-4-accent-preset-coalesce-migration-decision-2026-08-15.md`.

## The last two legacy auth users

Both still exist and every public table is clean — re-verified across all eleven. Both
carry the old harness's reserved `@example.com` domain, which no real account uses.

`docs/operations/RETIRE-LEGACY-AUTH-USERS.md` carries the SQL. Running it is not a
workaround but the **diagnostic**: it bypasses GoTrue, whose 500 has an empty body, and
either succeeds — proving the fault is inside GoTrue — or finally names the Postgres
constraint, which is the one fact still missing. The delete carries an `email like`
clause it does not need, so a mistyped id or the wrong project deletes nothing.

It runs in the Supabase SQL editor rather than a terminal, so it can be done from a
phone. Deleting data is the owner's to run.

## The draft-clear flake

Still unexplained, but the next occurrence will explain itself. The poll now carries the
board state into its failure value; the passing path is unchanged. The single failure
this ever produced could not be diagnosed afterwards because nothing recorded whether the
guess had been accepted and the draft merely lingered, or the round trip never landed.

**Deliberately not made deterministic** by waiting on the accepted row instead.
`submitOnScreenGuess` serves Solo and COMBAT, whose accepted rows carry different markup,
so one locator for both would be the same reach-into-the-DOM guess that turned six board
entries into zero once already. A flake seen once and already mitigated does not justify
rewriting the suite's most-used helper.

## One process failure worth recording

The first pass grouped these commits wrongly. A `git rm` staged before an unrelated commit
put the `rating.ts` deletion inside the profile commit — so reverting the profile feature
would also have restored the dead module, which is exactly the property the owner asked
to preserve.

Regrouped behind a backup ref and proved lossless by diffing the rewritten `HEAD` against
it: identical tree, then the ref was deleted. Nothing was pushed in the wrong shape.

## Verified

**Local gate:** 220 domain · 31 browser · 24 fixture · 52 visual; bootstrap 107/107;
migrations 45/45 immutable + 14 authorized + **1 reviewed pending**; parity 237/237; MP
audit 73/73; 102 CSS custom properties resolving. Budgets home 199193 B JS / 25041 B CSS,
game 205594 B JS / 29951 B CSS.

**Hosted acceptance: green on the first attempt** at `96de2fa` — 24 fixture · 3 services ·
52 visual · 237/237 parity, cleanup attempt 1, **zero residue**.

## Waiting on the owner

1. **Promote the Preview** — from the Vercel dashboard, which works from a phone.
2. **Apply the accent-preset migration** — `supabase db push --linked`, desktop.
3. **Run the legacy auth user deletion** — Supabase SQL editor, works from a phone.

## Rollback

Six commits, each independently revertable, which is what the regroup was for. The
migration is inert until pushed. Reversing the profile change restores a redirect and
nothing else; reversing the rating change restores a dead file and a weaker test.
