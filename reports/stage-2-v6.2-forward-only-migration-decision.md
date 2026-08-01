# Amordle Stage 2 v6.2 migration decision packet

## Decision requested

Authorize the single additive, forward-only migration:

`20260801032334_amordle_public_community_v1.sql`

SHA-256:
`ee1885032983b79577b08afbe7f989221dbe264f09401849f78f5e9b34d11d52`

The migration has been prepared and the linked push dry run identifies only
this file. It has not been applied to local or linked Supabase.

## Why a migration is required

The current schema accepts only the `none` flair, has no bounded public player
directory or public COMBAT aggregate, and spectator v3 does not include the
sanctioned public profile identifier required to link player names without
using Auth IDs. React-only changes cannot safely create these authorities.

## Minimum additive changes

1. Expand the existing flair constraint and validator to `none`, `daily`, and
   `combat`.
2. Set the new-row accent default and validator fallback to `cyan`.
3. Add one partial index for active public display-name prefix search.
4. Add `list_public_player_directory_v1`, capped at 50 rows and 5,000 offset,
   supporting name prefix, one public rating lane, rating bounds, and four
   deterministic sort modes.
5. Add `get_public_player_profile_stats_v1`, projecting COMBAT aggregates and
   the four public rating buckets only.
6. Add `get_amordle_public_practice_spectator_v4`, preserving the v3 privacy
   boundary while adding sanctioned `publicProfileId` to public participant
   profiles.

No table, column, public HTTP route, account-storage format, rating rule,
matchmaking rule, or game rule is added or changed.

## RLS, grants, and privacy

- All functions use fixed empty search paths and security-definer projections.
- Direct tables remain ungranted.
- Private-schema table access is explicitly revoked from `public`, `anon`, and
  `authenticated`.
- Directory and stats return opaque public profile IDs, never Auth UUIDs.
- Public statistics exclude Solo History, progression, coins, inventory,
  settings, requests, and blocks.
- Spectator v4 remains limited to public, unranked, started Practice and does
  not return answers or seeds.

## Compatibility and replay

- Existing profile rows already satisfy the expanded flair constraint.
- Existing accent values remain valid; only the default/fallback changes.
- RPC names are versioned and do not replace caller-visible v3 signatures.
- `create index if not exists`, explicit constraint replacement, and
  `create or replace function` keep replay deterministic.
- The application continues using existing profile and private-request RPCs.

## Verification before authorization

- Application checkpoint:
  `fb46fe90e09e9df6d0509d656a6facf757a85f70`.
- `pnpm test:acceptance:local` is green: 69 domain, 14 browser-component,
  15 fixture E2E, and 9 visual E2E tests.
- `pnpm exec supabase db push --linked --dry-run` lists exactly this migration.
- Domain tests validate enum bounds, directory pagination, returned DTOs,
  COMBAT-only public stats, grants, and the spectator allow/deny boundary.
- The successor bootstrap verifier records 45 immutable migrations, one
  applied authorized additive migration, and this one reviewed pending file.
- All 237 parity rows remain truthful; 222 retain verified evidence and the 15
  affected clauses are marked implemented pending hosted proof.

## After authorization

Apply exactly this migration to `squqdstdvbsvhagfuzgj`, regenerate linked
types, verify 47/47 synchronized history, run the full local acceptance stack,
deploy the exact green commit to protected Preview, run serial disposable-user
hosted acceptance, prove zero residue, and produce paired reports/checklists.

No merge, Production release, default-branch change, old-shell mutation, real
account deletion, down migration, or paid service is included.

## Rollback

Code rollback is a forward Git revert to the last green v6.1 application
commit `7f33829803eb93b560307b4b859d8109e1998db7`. Preview rollback redeploys
that exact commit. A database defect receives an additive forward repair; no
down migration is permitted.
