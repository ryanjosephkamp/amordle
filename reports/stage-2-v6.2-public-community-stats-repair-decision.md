# Amordle Stage 2 v6.2 public community repair decision

## Decision requested

Authorize the single additive, forward-only repair migration:

`20260801050000_amordle_public_community_stats_repair.sql`

SHA-256:
`7897de557bd118ce2ca7e5f23e260e6cf06e5d58f7d49915ee5668df956d5a22`

The migration is prepared locally and has **not** been applied. A linked
Supabase dry run identifies this file as the only pending migration.

## Current verified state

- Linked project: `squqdstdvbsvhagfuzgj`.
- Applied migration history: 47/47 synchronized through
  `20260801032334_amordle_public_community_v1.sql`.
- Applied v6.2 migration SHA-256:
  `ee1885032983b79577b08afbe7f989221dbe264f09401849f78f5e9b34d11d52`.
- Exact deployed application commit:
  `4a0dc068cebec52d60e80f7ee517fab04a8c1479`.
- Protected Preview deployment: `dpl_21jNGxPqKEGBPcu67AiDwPZjH9qe`.
- Protected Preview:
  `https://amordle-p7azfoby6-ryanjosephkamps-projects.vercel.app`.
- Production remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` and was not
  changed.

## Defects proven by hosted acceptance

### 1. Public COMBAT totals omit authoritative unranked games

A disposable public Practice match completed through two real signed-in UI
contexts. Both participant History rows existed, private Stats reflected the
COMBAT completion, and the match authority was terminal. The anonymous public
profile still reported `completed 0` instead of `completed 1`.

Cause: `get_public_player_profile_stats_v1` reads
`multiplayer_match_results` and `multiplayer_player_results` only. Those tables
are settlement authority for ranked matches. Current unranked COMBAT is
authoritative in `brrrdle_private.amordle_combat_authority` and its accepted
action ledger, so an unranked completion can never enter the original public
aggregate.

### 2. Directory ratings reference legacy Practice buckets

`list_public_player_directory_v1` maps public Practice filters to
`async:og` and `async:go`. Current Ranked Practice writes the approved v2
buckets `async:og:amordle:v2` and `async:go:amordle:v2`. Consequently, a
current Practice rating can be absent from directory search, filtering, and
sorting even after successful settlement.

The independent hosted Ranked Practice journey reached an exact one-result,
two-player, symmetric rating settlement. This confirms the defect is in the
public projection, not rating settlement.

## Minimum additive repair

1. Replace `list_public_player_directory_v1` in place, retaining its exact
   signature, bounds, public DTO, grants, and deterministic ordering while
   mapping Practice filters to the current v2 storage buckets.
2. Replace `get_public_player_profile_stats_v1` in place, retaining its exact
   signature and DTO.
3. Count current terminal COMBAT directly from the private authoritative game
   and accepted-action ledger:
   - participant-relative outcome only;
   - accepted guess count;
   - solved-puzzle count;
   - Practice/Daily, OG/GO, ranked/unranked breakdowns;
   - no answer, seed, draft, request, Auth ID, or raw action output.
4. Retain legacy settled result rows only when no authoritative Amordle game
   exists for that source match, preventing double counting.
5. Read only the four already-approved public rating buckets, using current v2
   Practice storage names and existing Daily storage names.
6. Reassert the existing function grants and private-table revocations.

No table, column, public HTTP interface, browser route, RPC signature, game
rule, matchmaking rule, rating calculation, persistence envelope, or paid
service is added or changed.

## Privacy and compatibility

- Both RPCs remain `security definer` with an empty fixed search path.
- Direct access to `brrrdle_private` remains revoked from `public`, `anon`, and
  `authenticated`.
- The public profile lookup still begins with an active, public, opaque public
  profile ID.
- Only aggregate counts and sanctioned public rating values leave the
  function.
- Legacy result rows are preserved as a compatibility fallback and excluded
  when their source is already represented by authoritative COMBAT.
- The existing strict browser schemas require no change.

## Verification already completed

- `pnpm test:acceptance:local` passes in full:
  - `pnpm check` green, including the production build and all contract gates;
  - 70/70 domain tests;
  - 14/14 browser component tests;
  - 15/15 fixture E2E journeys across Chromium, Firefox, and WebKit;
  - 9/9 responsive and visual acceptance journeys.
- 70/70 domain tests pass, including the new repair-boundary assertions.
- Successor baseline verification passes:
  - 107/107 immutable bootstrap files;
  - 45/45 immutable migrations;
  - 2/2 applied authorized additive migrations;
  - 1/1 reviewed pending additive repair.
- `supabase db push --linked --dry-run` lists exactly
  `20260801050000_amordle_public_community_stats_repair.sql`.
- Every hosted diagnostic run completed exact cleanup with zero database and
  Auth residue, including:
  - `e2e_20260801T045310418Z_4a0dc068_b2579e03`;
  - `e2e_20260801T045755237Z_4a0dc068_4e13a83d`.
- The 237-row parity registry remains truthful at 222 verified and 15
  implemented pending complete hosted proof.

## After authorization

Apply exactly this repair to `squqdstdvbsvhagfuzgj`, regenerate linked types,
verify 48/48 synchronized history, rerun the complete local stack, redeploy the
exact green application commit if code changes require it, run the full serial
protected hosted suite, prove zero residue, promote the 15 affected parity
rows only after proof, and produce the paired final report/checklist.

No merge, Production release, default-branch change, down migration, real-user
deletion, Blob-store deletion, or locked-shell mutation is included.

## Rollback

Code rollback remains a forward Git revert to the last green checkpoint.
Preview rollback redeploys exact known-good commit
`4a0dc068cebec52d60e80f7ee517fab04a8c1479` or the prior v6.1 candidate as
appropriate. Any database defect receives another separately reviewed
forward-only repair; no down migration is permitted.
