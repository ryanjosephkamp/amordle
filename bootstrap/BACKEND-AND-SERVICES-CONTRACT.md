# amordle Backend and Services Contract

**Status:** Canonical backend and service continuity contract for the fresh build.
**Date:** 2026-07-20
**Purpose:** Preserve the accepted server authority, data ownership, privacy, deployment, and operational contracts while allowing the new application architecture to change.

## 1. Nonnegotiable service identity

The fresh build retains the existing dedicated amordle services:

| System | Exact target |
|---|---|
| GitHub | private repository `ryanjosephkamp/amordle` |
| Supabase | project `amordle`, ref `squqdstdvbsvhagfuzgj`, region `us-east-2` |
| Vercel | project `amordle`, ID `prj_8DsbwXWKUtUz7dQl9xoPCgFUuxzH` |
| Vercel team | `team_0vEdA7fHR2HdGWr7QWWP2m6x` |
| Production alias | `https://amordle.vercel.app` |
| Blob | dedicated public-read word-list store linked only to amordle |

Verify these identities before every mutation. Never substitute a similarly named project. Legitimate current users and rows are owner data and must be preserved.

## 2. Architecture responsibilities

### Browser application

- Renders all public, guest, account, gameplay, and protected state permitted to the viewer.
- Uses only browser-safe Supabase URL and publishable/anon credentials.
- Performs authenticated user actions through RLS-protected tables and authorized RPCs.
- Keeps answer-bearing and privileged data out of public projections and cold public routes.
- Never imports server-only Blob or service-role code into the client bundle.

### Supabase

- Auth tenant for email/password identity and session recovery.
- PostgreSQL authority for account progress, history, settings, economy, public profiles, multiplayer, queues, claims, ratings, settlement, private requests, spectators, and Admin aggregates.
- RLS and grants are primary privacy controls, not optional frontend filtering.
- Realtime propagation is an acceleration/convergence mechanism; durable rows remain authority.
- Storage supports authorized avatar behavior where configured.
- Private schema stores ranked Daily answers and action/settlement authority unavailable to browser roles.

### Vercel

- Hosts the web application and serverless API routes.
- Holds environment values per Production, Preview, and Development.
- Runs the scheduled word-list refresh.
- Hosts the dedicated Blob word-list data and manifest.
- Existing production must remain on the accepted shell until a replacement is explicitly approved.

### Public upstream word source

- Dataset: `ryanjosephkamp/english-openlist`.
- Current source paths retain the established `latest/brrrdle/` compatibility namespace.
- Upstream content is untrusted until every required length payload validates.

## 3. Environment contract

The repository may track names/placeholders in `.env.example`. Real values belong only in Vercel encrypted environment scope or an ignored local `.env.local` with mode `0600`.

| Name | Scope | Classification | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | browser | public | exact Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | public/publishable | browser-safe project key |
| `SUPABASE_URL` | server | public | server-side alias for the same project URL |
| `SUPABASE_ANON_KEY` | server | public/publishable | server-side alias for the browser-safe key |
| `CRON_SECRET` | server | secret | authenticates the scheduled refresh endpoint |
| `BLOB_READ_WRITE_TOKEN` | server | secret | writes/reads the dedicated Vercel Blob store |
| `E2E_SUPABASE_URL` | Node test process | public | optional explicit test alias |
| `E2E_SUPABASE_ANON_KEY` | Node test process | public/publishable | optional explicit test alias |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | Node test process only | privileged secret | temporary-user/row creation, probes, and cleanup |
| `SUPABASE_ACCESS_TOKEN` | migration/operator process only | privileged secret | management/CLI authorization when explicitly required |
| `SUPABASE_DB_PASSWORD` | migration/operator process only | privileged secret | version-preserving migration connection when explicitly required |

Rules:

- Never put a service-role, DB password, access token, Blob token, or cron secret in a `VITE_*` variable.
- Never print values or interpolate them into logs, reports, screenshots, URLs, shell history, or chat.
- Verification reports may state only variable name, presence, environment coverage, and nonprinting identity match.
- A new local workspace may receive an allowlisted nonprinting copy of the existing ignored configuration only after exact source/target identity proof.

## 4. Migration ledger

The future bundle must carry these 42 files byte-for-byte, in original order:

1. `20260526012500_phase8_accounts.sql`
2. `20260604024500_phase23_live_multiplayer.sql`
3. `20260604033000_phase23_competitive_multiplayer.sql`
4. `20260604050824_phase23_online_multiplayer_fixes.sql`
5. `20260604202631_phase23_multiplayer_grants_reset_forfeit.sql`
6. `20260604210000_phase23_live_policy_recursion_fix.sql`
7. `20260604211000_phase23_live_join_policy_fix.sql`
8. `20260604211500_phase23_live_matched_lobby_visibility.sql`
9. `20260604223000_phase23_daily_multiplayer_claims.sql`
10. `20260605043000_phase23_stage4_lobby_cancel_spectators.sql`
11. `20260605223500_phase23_stage6_daily_claim_release.sql`
12. `20260615235440_phase26_live_v1_authenticated_spectator_projection.sql`
13. `20260616054019_phase27_trusted_settlement_ranked_queue.sql`
14. `20260616055149_phase27_settlement_rpc_unambiguous_profile_upsert.sql`
15. `20260616165434_phase27_ranked_queue_game_finalization.sql`
16. `20260618004638_phase28_live_spectator_v2_daily_terminal_hold.sql`
17. `20260621003033_phase29_public_profile_rls.sql`
18. `20260623011923_phase30_public_ranked_leaderboard_rpc.sql`
19. `20260623235121_phase31_practice_rematch_requests.sql`
20. `20260624233635_phase32_participant_identity_rpc.sql`
21. `20260626000925_phase33_timed_ranked_practice.sql`
22. `20260627230835_phase35_ranked_live_identity_spectator_profiles.sql`
23. `20260630215141_phase38_public_spectator_projection.sql`
24. `20260630220251_phase38_daily_claim_rpc_anon_revoke.sql`
25. `20260701221500_phase40_private_match_requests.sql`
26. `20260701232434_phase40_private_match_accept_contract_repair.sql`
27. `20260703152720_phase42_site_stats_dashboard_rpc.sql`
28. `20260703154556_phase42_browser_grant_rls_repair.sql`
29. `20260703160756_phase42_ranked_result_rls_recursion_repair.sql`
30. `20260703230106_phase43_ranked_queue_matching_fairness.sql`
31. `20260708202000_phase50_ranked_practice_fifo_matchmaking.sql`
32. `20260710061039_phase55_ranked_daily_multiplayer.sql`
33. `20260710180608_phase55_ranked_daily_contract_repair.sql`
34. `20260710183654_phase55_ranked_daily_queue_matched_at_repair.sql`
35. `20260710184116_phase55_ranked_daily_cleanup_orphan_repair.sql`
36. `20260710184922_phase55_ranked_daily_finalization_authority_repair.sql`
37. `20260711001811_phase56_private_request_center_and_anti_spam.sql`
38. `20260711051818_phase57_solo_practice_marketplace_and_consumables.sql`
39. `20260711212934_post_phase57_spectator_termination_transparency.sql`
40. `20260712175405_phase58_go_chain_selector_v2.sql`
41. `20260712190338_phase58_go_chain_selector_v2_bigint_overflow_repair.sql`
42. `20260719212914_post_phase58_ranked_practice_claim_idempotence.sql`

The current remote project already has this ledger. A fresh repository reset must not reapply it. Future schema changes are additive, versioned migrations; never rewrite, reorder, squash, or silently repair old files.

## 5. Database catalog

The exact columns, constraints, policies, grants, triggers, and function bodies are defined by the 42 SQL files. Prose below explains ownership and purpose without replacing SQL authority.

### Public account and progress tables

| Table | Authority and privacy |
|---|---|
| `public.profiles` | account-owned profile/role record; owner access with protected Admin read |
| `public.progress_snapshots` | account-owned synchronized product progress |
| `public.game_history` | account-owned durable history |
| `public.settings` | account-owned preferences and privacy settings |
| `public.public_player_profiles` | owner-managed public-profile projection; public access only through sanctioned RPC/visibility contract |

### Public economy tables

| Table | Authority and privacy |
|---|---|
| `public.player_economy_state` | owner-readable coin/inventory/revision state |
| `public.player_economy_operations` | owner-readable idempotency/operation ledger |

### Public asynchronous and competitive tables

| Table | Authority and privacy |
|---|---|
| `public.async_multiplayer_games` | participant-owned durable Practice/Daily game projection; ranked Daily writes are RPC-authorized |
| `public.multiplayer_daily_claims` | authenticated Daily participation lanes and claim state |
| `public.multiplayer_matchmaking_queue` | authenticated ranked queue requests and match state |
| `public.multiplayer_rating_profiles` | rating bucket summaries |
| `public.multiplayer_match_results` | durable match-level settlement evidence |
| `public.multiplayer_player_results` | participant result evidence |
| `public.multiplayer_rating_transactions` | immutable/idempotent rating deltas |
| `public.custom_game_lobbies` | authenticated custom/public lobby foundation |
| `public.multiplayer_practice_rematch_requests` | participant-only postgame Practice rematch lifecycle |
| `public.multiplayer_private_match_requests` | participant-only private request lifecycle and created-game link |
| `public.multiplayer_private_request_preferences` | owner-only request opt-in/out preference |
| `public.multiplayer_private_request_blocks` | owner-only directional block state |

### Public Live tables

| Table | Authority and privacy |
|---|---|
| `public.live_lobbies` | authenticated waiting lobbies with constrained visibility/update ownership |
| `public.live_matches` | participant-owned Live match state |
| `public.live_match_participants` | participant identity/state rows |
| `public.live_match_events` | participant-visible ordered match events |
| `public.live_match_spectators` | viewer-owned spectator membership/status with read-only game capability |

### Private ranked Daily tables

The browser roles must have no direct access to:

| Table | Purpose |
|---|---|
| `brrrdle_private.ranked_daily_word_catalog` | server-private curated Daily word material |
| `brrrdle_private.ranked_daily_pair_reservations` | pair/lane concurrency authority |
| `brrrdle_private.ranked_daily_game_authority` | answer, version, and server terminal authority |
| `brrrdle_private.ranked_daily_action_ledger` | idempotent ordered guess/forfeit/cancel evidence |

The `brrrdle_private` name is a compatibility identifier, not public branding, and must not be renamed casually.

## 6. RPC and trigger capability groups

### Ranked matchmaking and settlement

- create/cancel/claim/status/finalize ranked asynchronous requests;
- Practice untimed and canonical timed bucket mapping;
- FIFO and compatibility rules;
- idempotent already-matched claim return for valid owned requests;
- trusted settlement, rating profiles, transactions, and result rows;
- ranked Daily v2 request, status, finalize, action-save, settlement, and cleanup contracts.

Representative public RPC names retained by the ledger include:

- `create_ranked_async_matchmaking_request` and `_v2`;
- `cancel_ranked_async_matchmaking_request`;
- `claim_ranked_async_matchmaking_pair`;
- `get_ranked_async_matchmaking_status` and `_v2`;
- `finalize_ranked_async_matchmaking_game` and `_v2`;
- `save_ranked_daily_async_multiplayer_action`;
- `settle_ranked_async_multiplayer_match` and `_v2`;
- `cleanup_ranked_daily_multiplayer_for_users`.

### Daily participation

- `claim_daily_multiplayer_participation` and `release_daily_multiplayer_claim`;
- triggers that prevent async/Live Daily rows from bypassing claim authority;
- distinct ranked/unranked and OG/GO lanes.

### Private requests and rematches

- create/list/accept/decline/cancel Practice rematches;
- create/list/accept/decline/cancel private match requests;
- v2 private request creation/acceptance;
- request preference and directional block retrieval/update;
- expiry, uniqueness, pair locking, and anti-spam guard triggers.

### Public profiles and public projections

- owner get/upsert profile;
- sanitized single/multiple public-profile lookups;
- validation/normalization for visibility, accent, flair, avatar URL, and text;
- participant identity summaries;
- authenticated and anonymous Live spectator projections;
- public ranked leaderboard;
- public site stats.

### Economy

- ensure/get player economy state;
- credit/spend coins;
- purchase/consume Solo Practice consumables;
- operation-id idempotency and revision-aware mutation.

### Admin

- protected aggregate operational dashboard;
- no raw private rows or secrets in the Admin projection.

### Private ranked Daily helpers

Server-private functions implement deterministic answer selection/versioning, tile scoring, Hard Mode validation, action-ledger reconstruction, lane locks, answer-generation version stamping, and the Phase 58 GO selector. They must not become public RPCs or browser data.

## 7. RLS, grants, and authority rules

- Every public application table must have RLS enabled.
- Owners can read/write only the exact account-scoped rows allowed by the ledger.
- Participants can read and mutate only eligible games/requests/actions.
- Public projections are explicit RPC results, never broad table grants.
- `anon` and `authenticated` have no direct grants on private-schema tables.
- Security-definer functions must retain safe search paths, explicit authorization, bounded result shapes, and revokes/grants defined in the ledger.
- Frontend filtering does not compensate for a missing policy.
- Realtime subscriptions do not broaden row visibility.
- A fresh implementation must add contract tests for grants, RLS, answer leaks, ownership, and sanitized public projections.

## 8. Auth contract

The accepted dedicated project is configured for:

- Site URL `https://amordle.vercel.app`;
- production redirect `https://amordle.vercel.app/**`;
- Vercel preview patterns for the amordle project/team;
- local `localhost:5173` and `127.0.0.1:5173` redirects.

The rebuild may use a different local port or preview hostname only after adding the exact narrow redirect under explicit service authorization. Do not broaden wildcard redirects beyond the project’s requirements.

Authentication flows:

- sign up and sign in with email/password;
- session restoration;
- password recovery and reset;
- sign out;
- role/app-metadata check for protected Admin;
- no public exposure of service-role functionality.

## 9. Vercel API contract

The fresh architecture may rename files or use another supported function framework, but it must preserve these HTTP behaviors or a documented compatible replacement.

### `POST /api/admin-refresh`

- Any non-POST method: 405.
- Missing/invalid bearer token: 401.
- Authenticated non-admin: 403.
- Admin: fetch upstream metadata, validate all word lists, perform atomic store swap, and return a bounded nonsecret summary.
- Upstream/validation/persistence failure: 502 with stage and safe failure details.
- Success: accepted response with revision, generation/fetch times, per-length counts, and persistence result.

### scheduled `/api/cron/refresh-word-lists`

- Requires `Authorization: Bearer <CRON_SECRET>`; otherwise 401.
- Runs daily under Vercel schedule `0 0 * * *` unless a later accepted plan changes cadence.
- Fetches and validates all supported lengths.
- Uploads revisioned files before changing the manifest pointer.
- Returns 502 on an incomplete atomic refresh and preserves the previous set.
- Returns 200 with bounded nonsecret success metadata on full success.

### `GET /api/word-lists/manifest`

- Any non-GET method: 405.
- Public by design because dictionary metadata is public.
- Returns 200 with manifest, or 200 with `manifest: null` and fallback note when no store is configured.
- Returns 502 only for store I/O failure.
- Uses bounded public caching and contains no privileged token or private answer authority beyond the intentionally public curated dictionaries.

## 10. Blob atomicity

- Object path: `word-lists/<revision>/words_length_<n>.json`.
- Manifest pointer: `word-lists/manifest.json`.
- Upload every validated length first.
- Only then overwrite the manifest pointer.
- A length-upload failure leaves the old manifest untouched.
- A manifest-write failure leaves the old manifest visible.
- Public read access is intentional for public word files; write access is token-protected and server-only.
- Current accepted inventory is 34 length objects plus one manifest.

## 11. Word-data client behavior

- Bundled word data is a fallback and supports local gameplay.
- The client may consult the public manifest to discover a newer served revision.
- Data is normalized and validated before becoming authoritative.
- Invalid upstream payloads never partially replace a known-good set.
- Cold Home and unrelated routes must not preload all answer data.
- Answer-bearing ranked Daily authority remains private even though general curated dictionaries are public.

## 12. Deployment and repository safety

- The accepted production deployment must remain live during the clean-repository bootstrap.
- Before making a bootstrap-only branch the GitHub default, guard Vercel so that branch cannot replace production.
- Recommended: freeze the current app on a recovery branch and point Vercel production authority to that branch until the new build is accepted.
- A documentation-only/bootstrap-only tree must not be promoted to production.
- Preview deployments are permitted only under explicit deployment authorization and after secret/publication scans.
- Git checkpoints exclude `.env*`, local service metadata, browser auth, test output, internal prompts/reports, private screenshots, and credentials.

## 13. Real-service test and cleanup contract

- Use only project `squqdstdvbsvhagfuzgj` and exact amordle Vercel targets.
- Preserve legitimate manual-testing users and data.
- Generate unique test-run markers for temporary identities and rows.
- Use the service-role credential only in Node test process scope.
- Track every created user, queue request, game, claim, rating/result row, request/block/preference row, history/progress/economy row, and storage object.
- Cleanup in `finally` blocks, retry boundedly where the accepted harness permits it, and run exact post-cleanup probes.
- A cleanup failure is a blocker and must not be hidden as flaky test output.
- Never delete “all rows” or infer that pre-existing state is disposable.

## 14. Backend completion criteria

Backend readiness requires evidence that:

1. local migration checksums equal the retained 42-file bundle;
2. remote ledger remains exactly those 42 versions before any new migration;
3. new migrations, if any, apply only after dry-run and identity proof;
4. all public application tables retain RLS;
5. grants and private-schema isolation pass;
6. Auth redirects, browser environment mapping, Blob, cron, and APIs pass in preview;
7. participant, public, spectator, economy, matchmaking, settlement, Daily, and Admin authority tests pass;
8. no answer/private-data/secret leak is found;
9. temporary test residue is exactly zero;
10. legitimate users/data and the accepted production shell remain intact.
