# Amordle Stage 2 v6.3 custom-accent migration decision packet

## Decision requested

Authorize this single additive, forward-only migration for the linked Amordle
Supabase project `squqdstdvbsvhagfuzgj`:

`20260801193000_amordle_accent_presets_v2.sql`

SHA-256:
`26d488ee2d64e69a6a08a28ef7891e01289874ab6c1de7a1f1eb1ffc6fa75f84`

The file is prepared and reviewed locally. It has **not** been applied to the
linked project. `supabase db push --linked --dry-run --include-all` lists this
file, and only this file, as pending.

## Verified gate state

- Private branch:
  `codex/amordle-terminal-greenfield-implementation-2026-07-27`.
- v6.2 rollback tag:
  `amordle-stage2-v6.2-public-community-golden-2026-08-01` at
  `e4c0857bbe3749a8ffd44afebee300682bc48175`.
- v6.3 presentation checkpoint:
  `3573430d2e3b6c82e063a2382cd4ddddd7f2e330`.
- Applied linked history: 48 synchronized migrations through
  `20260801051509_amordle_public_community_stats_repair.sql`.
- After authorization and successful application, the truthful synchronized
  count will be **49/49**. The plan's “48/48 after authorization” wording was a
  baseline-count typo; no applied migration is being removed or renumbered.
- Immutable authority remains 45 original migrations plus the three already
  authorized additive migrations.
- Production, the default branch, real accounts, existing visible E2E
  profiles, Word Explorer, and the locked shell have not been changed.

## Why a migration is required

The current profile authority validates one of six named accents only.
Cross-device custom colors, private saved preset names, a 24-preset account
limit, atomic active-preset selection, and sanitized public active-color
projection cannot be implemented truthfully in browser storage or React code
alone.

This migration adds the minimum server authority needed for that behavior. It
does not add an HTTP interface, route, paid service, game rule, rating rule,
matchmaking rule, word-list change, or persistence-envelope change.

## Minimum additive change

1. Add private `public_profile_accent_presets` rows keyed by preset UUID and
   owning Auth user, with canonical uppercase `#RRGGBB`, 1–32 character names,
   timestamps, case-insensitive per-account name uniqueness, and Auth-user
   cascade cleanup.
2. Add nullable `active_accent_preset_id` and `accent_hex` profile metadata.
   Existing rows receive no data update; both new columns remain null.
3. Change only the new-row named-accent default and validator fallback to
   Aurora. Existing named selections are not rewritten.
4. Add owner-only RPCs to list, create/update/select, and delete presets.
5. Enforce the 24-row limit under a per-account transaction advisory lock so
   concurrent creates cannot exceed it.
6. Make deletion of the active preset atomically clear custom metadata and
   fall back to Aurora.
7. Add v2 private profile and bounded public profile, directory, and
   leaderboard projections with optional validated `accent_hex`.
8. Keep custom preset names, preset ownership, raw Auth IDs, email, and private
   account data out of all public projections.

## Grants, RLS, and privacy review

- The preset table enables and forces RLS.
- Defense-in-depth owner policies compare `user_id` with `auth.uid()`.
- Direct table privileges are revoked from `public`, `anon`, and
  `authenticated`; browser access is RPC-only.
- Mutating RPCs are `security definer` with an empty search path and require an
  authenticated caller.
- Every write predicates on the current Auth user. Selecting another
  account's preset raises a bounded not-found/ownership error.
- Public v2 projections add only `accent_hex`; they do not return preset name,
  preset UUID, owning user ID, email, Solo History, settings, or economy.
- No grants are added to `brrrdle_private` and no private COMBAT authority is
  changed.

## Compatibility and replay proof

- The existing v1 profile RPC retains its exact argument and return signature.
- A frozen v1 client still receives one of the six named accents. If a newer
  client has selected a custom preset, a v1 profile save preserves that custom
  selection instead of silently deleting it.
- Existing v1 public profile, community, spectator, and leaderboard functions
  remain callable and unchanged.
- The migration contains no broad update of existing profiles. Adding nullable
  columns and changing a column default do not rewrite logical profile values.
- Guarded table/column/index creation, explicit constraint replacement, and
  `create or replace function` make the additive artifact replay-deterministic.
- `pgsql-parser` 18.2.1 accepts the complete PostgreSQL source.
- Targeted tests pass for canonical values, account isolation boundaries,
  transactional limit enforcement, fallback, public sanitization, and v1
  compatibility.
- The successor verifier recognizes the exact reviewed-pending filename and
  hash while retaining 107/107 bootstrap and 45/45 immutable migration checks.
- A linked Supabase dry run identifies exactly this one pending migration.

No local Supabase container runtime is installed on this workstation, so this
gate does not claim a Docker-backed local database execution. After exact
authorization, linked application is immediately followed by history
verification, type regeneration, RPC integration tests, complete acceptance,
and a forward-only repair stop if the database rejects or exposes any
contract defect.

## Work already completed before this gate

- Named accent palettes, Aurora defaults, alert-count accent styling, and
  contrast-safe custom-color resolution are implemented locally.
- Routine cloud synchronization no longer moves the game board; the warning
  uses the fixed-height status rail and retry reuses the latest envelope.
- Desktop route frames and COMBAT geometry are centered while the approved
  mobile composition remains unchanged.
- Profile public/private disclosure and mobile rating cards are repaired.
- `pnpm check` passed at the presentation checkpoint, including production
  build, 237/237 parity validation, 107/107 bootstrap validation, three HTTP
  interfaces, word-data boundaries, and bundle budgets.
- Targeted domain and responsive Playwright tests passed, including zero-pixel
  board and keyboard movement during repeated input.

## After authorization

Apply exactly the hashed migration to `squqdstdvbsvhagfuzgj`; verify 49/49
linked history; regenerate linked database types; implement the v2 adapters and
keyboard-accessible custom-preset UI; rerun the complete local command stack;
deploy the exact green commit to protected Preview; run serial disposable-user
hosted acceptance; prove exact zero residue; reconcile parity/run state; and
produce paired final reports and checklists.

No merge, Production release, default-branch change, Vercel project-setting
change, down migration, real-user deletion, existing E2E-profile deletion,
Word Explorer change, or locked-shell mutation is included.

## Rollback

Code rollback is a forward Git revert. Preview rollback redeploys the exact
v6.2 golden checkpoint
`e4c0857bbe3749a8ffd44afebee300682bc48175`. A database defect receives a
separately reviewed additive forward repair; no down migration is permitted.

## Exact authorization text

> I authorize applying
> `20260801193000_amordle_accent_presets_v2.sql` with SHA-256
> `26d488ee2d64e69a6a08a28ef7891e01289874ab6c1de7a1f1eb1ffc6fa75f84`
> to linked Supabase project `squqdstdvbsvhagfuzgj`, followed by migration
> verification, type regeneration, v2 adapter and custom-preset UI completion,
> complete acceptance, protected Preview deployment, disposable-user hosted
> acceptance, exact cleanup, parity reconciliation, and final reporting. Do
> not merge or release Production.
