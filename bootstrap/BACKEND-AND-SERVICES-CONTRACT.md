# Amordle Backend and Services Contract

Version: 1.0

Supabase project: `squqdstdvbsvhagfuzgj`
Vercel project: `prj_8DsbwXWKUtUz7dQl9xoPCgFUuxzH`

Project identifiers are provenance, not credentials.

## 1. Immutable migration baseline

- `supabase/migrations/` contains exactly 45 accepted SQL files.
- `supabase/migrations.sha256` is the byte-integrity ledger.
- Local and linked remote migration versions must match exactly before any
  application/service work.
- Applied files are never edited, reordered, deleted, down-migrated, or marked
  repaired to conceal a problem.
- No schema change is planned by this bootstrap.
- A demonstrated deficiency requires a separately authorized forward-only
  additive migration, isolated replay, dry-run, RLS/grant review, compatibility
  proof, and forward repair plan.

## 2. Data inventory

### Public schema tables

The retained ledger exposes 24 public tables:

1. `async_multiplayer_games`
2. `custom_game_lobbies`
3. `game_history`
4. `live_lobbies`
5. `live_match_events`
6. `live_match_participants`
7. `live_match_spectators`
8. `live_matches`
9. `multiplayer_daily_claims`
10. `multiplayer_match_results`
11. `multiplayer_matchmaking_queue`
12. `multiplayer_player_results`
13. `multiplayer_practice_rematch_requests`
14. `multiplayer_private_match_requests`
15. `multiplayer_private_request_blocks`
16. `multiplayer_private_request_preferences`
17. `multiplayer_rating_profiles`
18. `multiplayer_rating_transactions`
19. `player_economy_operations`
20. `player_economy_state`
21. `profiles`
22. `progress_snapshots`
23. `public_player_profiles`
24. `settings`

RLS remains enabled according to the accepted ledger. Browser access is limited
to documented policies and granted RPCs.

### Private authority tables

The retained `brrrdle_private` schema includes:

1. `ranked_daily_word_catalog`
2. `ranked_daily_pair_reservations`
3. `ranked_daily_game_authority`
4. `ranked_daily_action_ledger`
5. `amordle_word_catalogs`
6. `amordle_ranked_practice_reservations`
7. `amordle_combat_authority`
8. `amordle_combat_action_ledger`

Browser roles receive no direct private-schema access. Private state is exposed
only through bounded security-definer functions whose output is validated at
the application boundary.

## 3. Client and server authority

### Browser client

- Uses only `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Authenticates as the current user and relies on RLS plus explicitly granted
  RPCs.
- Never receives service-role, database password, access token, Blob write
  token, cron secret, answer seed, private catalog, or test authority.
- Strictly parses every table/RPC response and rejects unexpected sensitive
  fields.

### Server/Node-only processes

- Route handlers use server-only environment names.
- Real-service E2E may use service role only inside the Node harness.
- Migration/operator credentials are process-scoped and never passed as shell
  arguments, written to reports, or exposed to browser contexts.
- Admin refresh authenticates the supplied Supabase bearer identity and checks
  application role before privileged work.

### Authority classes

- Solo rules are pure application domains with versioned local/cloud
  persistence.
- Economy mutations and retained authoritative COMBAT operations are final only
  after accepted RPC responses.
- Legacy shell-grade participant-authored multiplayer remains labeled honestly
  where the retained schema still uses that authority class.
- Ranked Daily and Amordle v2 COMBAT use their retained private authority and
  action-ledger functions.
- Realtime carries invalidation hints, never final authority.

## 4. Authentication and profiles

- Supabase Auth remains the identity provider.
- Support registration, sign-in, session restore, sign-out, password recovery,
  callback, and recovery completion through the real browser UI.
- Raw Auth UUIDs are internal keys and never public profile identifiers.
- `profiles` is owner/private application state.
- `public_player_profiles` is the sanctioned public projection.
- Public profile RPCs and participant identity RPCs are the only approved
  browser source for public identity summaries.
- PostgreSQL `timestamptz` boundaries accept RFC 3339 offsets and canonicalize
  to UTC before entering application state. Local envelopes retain a strict
  canonical UTC representation.
- Account hydration is epoch/user guarded so stale work cannot settle a
  different identity.

## 5. Multiplayer RPC families

The later repository layer must inventory the exact final signatures and grants
from the migration ledger. At minimum it owns typed wrappers for:

- unranked Practice create/list/join/cancel/save/recover;
- unranked Daily claim/create/list/join/cancel/save/recover;
- ranked Practice create/status/claim/finalize/cancel/settle/search-again;
- ranked Daily create/status/claim/finalize/cancel/action/settle;
- Active, Lobby, participant identity, and result projections;
- public/authenticated Live lists and exact read-only spectator projection;
- private request create/list/accept/decline/cancel, preferences, blocks, and
  anti-spam errors;
- Practice rematch create/list/accept/decline/cancel;
- rating, leaderboard, public site statistics, public profiles, and economy;
- bounded service-role inspection/cleanup/probe functions for registered E2E
  runs.

Repository rules:

- Zod schemas use strict objects at remote boundaries.
- Machine error codes map to player-facing categories without exposing SQL or
  internal detail.
- Idempotency keys are stable per logical operation and account scope.
- A repeated key with different payload fails as a conflict.
- Expected revision/version conflicts cause one durable reread; they never
  fabricate success.
- Date, lane, mode, length, difficulty, Hard Mode, GO count, clock, and rating
  bucket compatibility are validated before mutation.

## 6. Realtime and recovery

- Subscribe only to topics/rows allowed by the current viewer.
- Realtime invalidates TanStack Query or equivalent durable caches; payload
  contents do not replace repository reads.
- Active visible games use bounded five-second polling; inactive/list surfaces
  use thirty seconds.
- Route entry, visibility gain, reconnect, mutation success, state conflict,
  and GO hold expiry trigger immediate reread.
- Background polling does not toggle foreground mutation buttons, replay
  notices, clear drafts, or flash layout.
- Duplicate messages collapse safely.
- Account switch/sign-out closes subscriptions and cancels account-owned
  queries before rendering the next account.

## 7. Word-list authority and Blob

- Bundled source data lives outside the public application root until the
  application plan defines the minimum client boundary.
- Only the required length is loaded.
- The public manifest contains bounded revision/count/checksum metadata.
- Refresh validates all lengths 2–35 before publication.
- Immutable objects are uploaded under
  `word-lists/<revision>/words_length_<n>.json`.
- `word-lists/manifest.json` is promoted last.
- Concurrency uses the retained safe lease/conditional-write contract where
  available. A partial failure leaves the previous manifest pointer intact.
- Hosted testing uses a Preview-scoped Blob store or token and never overwrites
  Production data.
- Cleanup restores a prior Preview pointer only when the recorded current
  version/ETag still identifies the test revision.

## 8. HTTP boundary

Retain exactly three application APIs:

### `POST /api/admin-refresh`

- Other methods: 405.
- Missing/invalid Supabase bearer identity: 401.
- Authenticated non-admin: 403.
- Upstream/storage failure: 502.
- Success returns bounded refresh metadata without secrets or answer content.

### `GET /api/cron/refresh-word-lists`

- Requires `Authorization: Bearer <CRON_SECRET>`.
- Invalid/missing secret: 401.
- Refresh/storage failure: 502.
- Success: 200 with bounded idempotent metadata.
- Vercel schedule remains `0 0 * * *`.

### `GET /api/word-lists/manifest`

- Public bounded caching.
- Returns `{ "manifest": null }` when storage is intentionally unconfigured.
- Never returns private catalog authority, active answers, seeds, or service
  configuration.

No additional API is introduced without changing this contract.

## 9. Configuration and deployment

- Repository: private `ryanjosephkamp/amordle`.
- Vercel Git deployments remain disabled.
- Production stays on deployment
  `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` until a separate release approval.
- Greenfield development uses explicitly protected Preview deployments only.
- Preview protection is verified from an unauthenticated and authenticated
  context before real-service evidence is accepted.
- `vercel.json` contains the deployment freeze and cron only during bootstrap.
- Supabase local Auth examples target port 3000 for future Next.js planning.
- No environment value is committed. `.env.example` contains names and safe
  placeholders only.

## 10. Legacy compatibility

- The accepted shell and its deployment are read-only.
- The successor must remain compatible with retained versioned rows and
  projections required by the 45 migrations.
- Stored Solo/GO answers remain authoritative for restore.
- Historical completed results and ratings are not silently rewritten.
- Legacy routes redirect canonically.
- Any legacy multiplayer row the new app cannot safely mutate is labeled and
  handed off or excluded according to the functional contract; it is never
  treated as a new writable game accidentally.

## 11. Baseline protection

A formal security scan is not a release prerequisite. These checks are:

- browser bundle and source scan for server-only environment names;
- strict public/private projection tests;
- answer-leak probes before and during active games;
- RLS/grant and unauthorized RPC matrices for changed boundaries;
- secret scan of staged/tracked files and reports;
- exact destructive-target review;
- zero-residue cleanup.

Any credible leak or authority bypass blocks the affected checkpoint.
