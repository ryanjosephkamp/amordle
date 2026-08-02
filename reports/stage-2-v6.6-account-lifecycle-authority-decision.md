# Amordle Stage 2 v6.6 account-lifecycle authority decision packet

## Decision status

**Awaiting exact owner authorization.**

The v6.6 application repairs and account-management client surfaces are implemented locally. The
new account-lifecycle database authority and Supabase Edge Function have been reviewed and hashed,
but neither artifact has been applied or deployed. Supabase, Vercel, Production, real users, and
provider configuration remain unchanged.

## Verified gate state

- Private repository: `ryanjosephkamp/amordle`.
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`.
- Owner-approved rollback checkpoint: `b3901e39d41f55b09b5faf8fe69d9b2a6d4c7b69`.
- Golden tag: `amordle-stage2-v6.5.1-owner-approved-golden-2026-08-02`.
- Existing protected Preview:
  `https://amordle-77f8b403z-ryanjosephkamps-projects.vercel.app`.
- Existing Preview deployment: `dpl_4QniuMyXds5vjRSqtVJxewtJ8ti1`.
- Linked Supabase project: `squqdstdvbsvhagfuzgj`.
- Current linked migration authority: 51 synchronized migrations—45 immutable baseline files and
  six separately authorized additive migrations.
- Pending result after authorization: 52 synchronized migrations.
- Immutable bootstrap: 107/107 files.
- Functional registry: 237/237 clauses.
- Multiplayer audit: 73/73 clauses.
- Next.js application HTTP interfaces: exactly three.
- Production, the default branch, real accounts, the locked shell, word authority, and existing
  visible test profiles remain outside this operation.

## Exact reviewed artifacts

| Artifact                                                              | SHA-256                                                            | State                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| `supabase/migrations/20260802193000_amordle_account_lifecycle_v1.sql` | `caad339a608a0a23f5589a25bed6a1f2d415d033e04db707fce214687192c9f3` | reviewed, pending, not applied  |
| `supabase/functions/account-lifecycle-v1/index.ts`                    | `fb961d9e60d39008c50492561a8fa2c04fde12e49264c0a534f3522709cb5dc1` | reviewed, pending, not deployed |
| `supabase/functions/account-lifecycle-v1/deno.json`                   | `fc9fc38c21441b7f67a91280ed28b8ca4ad67fc69d713db441f5c0fd9a6abf9f` | reviewed, pending, not deployed |

The bootstrap verifier recognizes the migration only as a reviewed pending additive artifact. It
does not count it among the six authorized additive migrations.

## Why new authority is required

Email and password changes can use the signed-in Supabase Auth client's existing `updateUser`
authority after reauthentication. Secure destructive account actions cannot.

A browser client must not receive the service-role key, delete an Auth user administratively,
mint its own destructive confirmation, or directly mutate shared opponent-side records. Existing
COMBAT tables also contain participant foreign keys whose current cascade behavior can remove
shared evidence when one Auth user is deleted. A narrowly bounded server authority is therefore
required to:

1. verify the current password;
2. issue one-time, account/action-bound, five-minute confirmations;
3. apply exact reset or deletion scopes transactionally;
4. preserve shared opponent-side results and rating facts;
5. remove the user's public avatar before Auth deletion; and
6. delete the Auth user without exposing administrative credentials.

No new Next.js `/api` route is required.

## Migration scope

### Private confirmation authority

The migration adds `brrrdle_private.amordle_account_lifecycle_challenges`:

- the browser never receives table access;
- only SHA-256 token hashes are stored;
- each challenge is bound to one Auth user and one enumerated action;
- the expiry is five minutes;
- one successful non-account-deletion confirmation marks the challenge used;
- permanent deletion enters a private cleanup-only processing state until Storage and Auth finish;
- issuing a new challenge revokes or expires the user's older pending challenge;
- a per-account advisory lock serializes destructive operations; and
- recent challenge issuance is bounded to five attempts in fifteen minutes.

### Competitive generations

`brrrdle_private.amordle_competitive_generations` records the requesting player's current personal
rating generation. Restarting increments the generation and creates fresh 1200/provisional/zero
W-L-D buckets without deleting settled shared match or rating evidence.

### Shared-fact preservation

The migration changes participant Auth references on settled multiplayer facts to `ON DELETE SET
NULL`, provides stable seat-based primary keys where a nullable Auth identifier can no longer be a
key, and retains unique live-user constraints for existing upsert behavior. A deleted participant
is rendered from a sanitized `Deleted player` label. It does not retain email, raw Auth ID, avatar
URL, or other personal profile data.

Ephemeral queues, reservations, pending requests, and unfinished account-owned claims are cancelled
or removed before deletion. Settled results, rating transactions, opponent History, and
opponent-side rating integrity remain.

### Service-only procedures

All new lifecycle procedures are revoked from `public`, `anon`, and `authenticated` and granted
only to `service_role`. Existing browser RPCs, tables, projections, and grants are not renamed or
replaced.

## Exact destructive scopes

### Delete Solo history and progress

Deletes active Solo sessions, Solo History/statistical source records, Solo streak, and pending Solo
completion reconciliation. It preserves COMBAT data, settings, XP, level, coins, consumables,
purchased Daily access, and the immutable economy ledger. Local cleanup removes only Solo envelopes
and filters pending Solo completions while preserving pending COMBAT completions.

### Restart competitive profile

Refuses while an active COMBAT match exists. It cancels waiting queues and pending private/rematch
requests, hides the requesting player's earlier personal COMBAT History, and begins a new personal
rating generation at 1200 provisional with zero W-L-D in each existing bucket. It never removes
opponent records or settled shared evidence. Public career COMBAT totals remain truthful settled
facts; the reset applies to the requesting player's current personal History and rating generation.

### Delete account permanently

Refuses while an active COMBAT match exists. It cancels pending account-owned multiplayer state,
deletes private account/profile/settings/economy/history/progress data, detaches the user from
settled shared multiplayer evidence, removes the exact owned avatar through Storage, and deletes
the Auth user through administrative authority. The browser clears account-scoped caches and signs
out only after an authoritative success receipt.

## Edge Function contract

`account-lifecycle-v1` accepts authenticated `POST` requests with at most 4096 bytes and exactly two
operations:

- `prepare`: action plus current password;
- `confirm`: action plus one-time confirmation token.

The function validates the bearer session, reauthenticates in an isolated non-persistent Auth
client, hashes a cryptographically random 256-bit token, calls only service-role lifecycle
procedures, and returns bounded sanitized payloads. It has no logging statements. Errors are mapped
to ordinary player-safe messages.

For permanent deletion, successful database confirmation moves the challenge to a private
`processing` state before any external deletion and captures the exact avatar cleanup receipt.
Reusing that same account/action/token can retry only the idempotent Storage/Auth cleanup; it cannot
repeat database deletion. If that five-minute token expires or the player closes the dialog, a new
password-verified challenge securely inherits only the pending cleanup receipt. The function
validates that an avatar URL belongs to the linked project's exact public avatar bucket, retries
exact object deletion at most three times, then calls `auth.admin.deleteUser`. Wrong, expired,
used, cross-action, and cross-account tokens cannot initiate or broaden destructive work.

Cross-service deletion cannot be one database transaction. If Storage or Auth cleanup remains
incomplete after the bounded retry policy, the service fails closed, retains the Auth user where
possible, reports no false success, and blocks final completion for an exact forward repair or
cleanup decision.

## HTTP-interface contract reconciliation

The application continues to expose exactly these three Next.js interfaces:

1. `POST /api/admin-refresh`;
2. `GET /api/cron/refresh-word-lists`; and
3. `GET /api/word-lists/manifest`.

The proposed function is one new bounded authenticated Supabase service surface, not a Next.js
application route. The contract amendment authorizes only `account-lifecycle-v1`, only the two
operations above, and only the three enumerated destructive actions. It does not authorize a
general administrative API, another vendor, another Supabase project, Production mutation, or
service-role access in browser code.

## Replay and compatibility review

- Migration statements are deterministic and forward-only.
- Challenge/action checks and grants are explicitly bounded.
- Existing v1 browser RPC signatures and responses remain unchanged.
- Existing profile, settings, History, rating, game, economy, and public-community projections
  remain callable by the current Production client.
- Existing shared rows are not rewritten during migration application; only constraint authority is
  repaired until a player explicitly invokes a lifecycle action.
- Seat keys plus nullable Auth IDs preserve existing live-user uniqueness while allowing multiple
  anonymized participants across settled results.
- The application compiles without importing Deno-only `npm:` or `Deno` runtime types into the
  Next.js checker.
- Static authority tests lock all three exact hashes and verify confirm-before-Storage-before-Auth
  order.
- No local Deno or Docker-backed Supabase runtime is installed, so this packet does not claim local
  database/function execution. Linked verification, generated types, real disposable-user service
  tests, and replay evidence follow only after authorization.

## RLS, grants, and privacy review

- Both new tables live in `brrrdle_private` and have no browser grants.
- All lifecycle functions are `service_role` only.
- Confirmation tokens are returned once; only hashes persist.
- Passwords exist only in the bounded request and isolated reauthentication call; they are not
  stored, logged, placed in URLs, analytics, traces, or reports.
- Public deletion snapshots contain only sanitized participant labels and seat identifiers.
- No answer, seed, private draft, word-list, email, raw Auth identifier, service-role key, or avatar
  ownership identifier enters a public projection.
- Active COMBAT refusal prevents destructive ambiguity during a live shared game.
- Action-level advisory locking and idempotent confirmation prevent concurrent duplicate mutation.

## Cleanup and zero-residue impact

Hosted acceptance will register every disposable Auth user, avatar path, challenge, rating
generation, queue/request, game, history, economy, and operation identifier immediately. Cleanup
will:

1. stop mutations and close browser contexts;
2. remove exact disposable avatar objects;
3. remove dependent disposable game, request, rating, history, economy, notification, settings,
   profile, and lifecycle rows;
4. delete disposable Auth users last; and
5. probe exact identifiers through public, authenticated, database, Storage, function, and Auth
   boundaries.

Cleanup receives at most three exact retries. Residue blocks final checkpointing. Real accounts and
existing visible test profiles are never included in cleanup selectors.

## Pre-authorization evidence

- `pnpm check`: passed.
- Production build: passed with exactly three application API routes.
- Immutable bootstrap: 107/107.
- Migration verifier: 45/45 immutable + 6/6 authorized additive + 1/1 reviewed pending.
- Functional registry: 237/237.
- Multiplayer audit: 73/73.
- Domain tests: 120/120.
- Browser component tests: 21/21.
- Fixture E2E: 20/20 across Chromium, Firefox, and WebKit.
- Visual/responsive E2E: 13/13.
- Bundle budgets and selected-length word boundaries: passed.

This evidence proves the local application and reviewed artifacts. It deliberately does not claim
that the pending migration or function has executed against Supabase.

## Post-authorization execution

After exact authorization, the run will autonomously:

1. reverify linked project and migration identities;
2. apply only the exact hashed migration;
3. verify 52 synchronized migrations and exact remote identity;
4. deploy only the exact hashed `account-lifecycle-v1` function;
5. regenerate linked `public,brrrdle_private` TypeScript types;
6. run migration, grant, function, password, replay, deletion, and opponent-integrity probes;
7. rerun the complete local stack;
8. deploy the exact green commit to a protected Preview;
9. run serial disposable-user hosted acceptance;
10. prove exact database, Storage, function-test, and Auth zero residue;
11. reconcile parity, run state, evidence, paired completion reports, and manual checklists; and
12. create and push a final private golden checkpoint for owner multiplayer review.

## Rollback

Application rollback uses a forward Git revert and redeployment of exact known-good commit
`b3901e39d41f55b09b5faf8fe69d9b2a6d4c7b69`. The previous protected Preview remains available
until the new candidate is green. There is no down migration. A database or function defect receives
a separately reviewed additive forward repair. No Production rollback or mutation is included.

## Exact authorization text

> I authorize applying
> `20260802193000_amordle_account_lifecycle_v1.sql` with SHA-256
> `caad339a608a0a23f5589a25bed6a1f2d415d033e04db707fce214687192c9f3`
> to linked Supabase project `squqdstdvbsvhagfuzgj` and deploying Supabase Edge Function
> `account-lifecycle-v1` from `index.ts` with SHA-256
> `fb961d9e60d39008c50492561a8fa2c04fde12e49264c0a534f3522709cb5dc1` and `deno.json`
> with SHA-256
> `fc9fc38c21441b7f67a91280ed28b8ca4ad67fc69d713db441f5c0fd9a6abf9f`, followed by exact
> migration and function verification, type regeneration, account UI and adapter completion,
> complete local acceptance, protected Preview deployment, disposable-user hosted acceptance,
> exact database, Storage, function-test, and Auth cleanup, parity reconciliation, final reporting,
> and a private golden checkpoint. Do not merge or release Production.
