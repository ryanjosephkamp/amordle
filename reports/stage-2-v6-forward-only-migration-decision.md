# Amordle Stage 2 v6 COMBAT authority decision packet

## Decision

Authorize one additive, forward-only migration that extends the existing
authoritative COMBAT v2 model to public unranked Practice, accepted private
requests, accepted Practice rematches, and privacy-safe Ranked Daily
finalization.

This is the minimum safe route to the remaining COMBAT acceptance work. The
current 45-migration backend cannot satisfy the answer, seed, raw-identity,
server-validation, and spectator boundaries for those lanes. The migration is
not included in the current checkpoint and has not been applied locally,
remotely, or to Preview.

Recommended authorization:

> Authorize the additive v6 COMBAT authority migration described in this
> packet, followed by the remaining implementation, protected Preview
> acceptance, bounded cleanup, and evidence work. Do not authorize a down
> migration, Production promotion, merge, default-branch change, or deletion of
> real accounts.

## Verified pre-migration checkpoint

- Branch:
  `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Truthful MP audit commit:
  `d285084ab8252cd296379bb99b42e8b30bfb7244`
- Ranked Practice hardening commit:
  `7b71bdcba897c4717afcf7560fbe9a1022e7d6fe`
- Rollback application commit:
  `31be382e50fa451a9a8a961780f317f9555ed408`
- Supabase project: `squqdstdvbsvhagfuzgj`
- Existing migrations: 45/45, unchanged
- Bootstrap baseline: 107/107, unchanged
- HTTP interfaces: exactly three, unchanged
- Frozen Production:
  `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`, unchanged
- Current protected Preview:
  `https://amordle-1bj4496rq-ryanjosephkamps-projects.vercel.app`
  at the v5.3 application commit, unchanged

The exact commit hashes above are completed private checkpoints. This report
commit is intentionally separate.

## What was completed without a migration

### Truthful MP evidence

`acceptance/mp-v6-clause-audit.json` now has one detailed record for every
MP-01 through MP-21 atomic clause. Each record identifies its frontend entry
point, domain/controller owner, adapter and database authority, relevant
migrations, actual automated and hosted evidence, known gap, proposed work,
and schema requirement.

The current audit is deliberately conservative:

| Status | Clauses |
| --- | ---: |
| Proven | 1 |
| Implemented but not acceptance-proven | 43 |
| Partial or defective | 10 |
| Missing | 5 |
| Migration-blocked | 14 |
| Total | 73 |

The 237-row parity registry no longer treats generic multiplayer mappings as
acceptance proof. It records 72 MP clauses as implemented and only the one
currently sufficient clause as verified. The ordinary repository gate validates
truthful status. Final hosted acceptance uses the stricter verifier and cannot
pass until all 237 clauses have clause-specific verified evidence.

### Ranked Practice hardening

The existing Ranked Practice authority was usable without schema work, so the
application now:

- offers untimed and five-minute-per-player ranked lanes;
- persists the complete queue configuration in an account-scoped,
  tab-scoped, strict session record;
- preserves stable creation, claim, and finalize action identifiers;
- restores queue intent only to its owning account;
- treats queued, matched, expired, cancelled, conflict, and failure states
  explicitly;
- polls only while visible and refreshes on reconnection or visibility return;
- prevents a recovered queue from silently changing word length or settings;
- parses the settlement receipt strictly and propagates its rating delta into
  History, Stats, rating, and Leaderboard cache invalidation;
- exposes authoritative cancellation before play and forfeit only after play;
- keeps expected-version recovery authoritative without changing the accepted
  match controller.

No database, RPC, public route, persistence envelope, or public HTTP interface
changed.

## Exact backend deficiency

The public shell already recognizes `public_lobby`, `private_request`, and
`rematch` source kinds, but
`brrrdle_private.amordle_combat_authority.source_kind` accepts only
`ranked_queue` and `daily_lobby`.

Consequently:

1. Public unranked Practice still uses a legacy browser-readable projection
   containing answer authority and browser-side validation.
2. Accepting a private request creates the same answer-bearing legacy game.
3. Accepting a rematch creates the same answer-bearing legacy game.
4. Ranked Daily queue status/finalization exposes raw participant Auth UUIDs
   to the browser and relies on client construction of part of the game
   projection.
5. Safe public spectation cannot include authoritative public Practice while
   excluding Daily, private, rematch, custom, and waiting games with the
   required exactness.
6. Unranked Practice cannot use the documented authoritative untimed or
   five-minute clock behavior.

These are authority defects, not presentation gaps. Hiding fields in React,
adding a route handler, or trusting client-side validation would not satisfy
the functional or privacy contracts.

## Affected clauses

The audit identifies schema dependency in:

- MP-01.a-b: public Practice creation, join, configuration, and clock authority;
- MP-02.a-d: all four Daily lanes, UTC authority, isolation, and rollover;
- MP-03.a: shared board with private drafts across every lane;
- MP-06.a-b: server-side Hard Mode and authoritative clocks;
- MP-10.a, MP-10.c-d: private request settings, accepted-game authority, and
  first turn;
- MP-12.a-b: safe public lobby projection and join/cancel races;
- MP-17.b: rematch acceptance and exactly-one new game;
- MP-18.a-c: Ranked Daily privacy, claim/finalization, recovery, and
  settlement.

The migration also unlocks the complete spectator allow/deny proof required by
MP-15 and strengthens the terminal/recovery evidence required by MP-05,
MP-07, MP-08, MP-09, MP-19, and MP-20.

## Existing authority to retain

The migration should extend, not replace:

- `brrrdle_private.amordle_combat_authority`;
- the private accepted-action ledger, answer catalogs, clocks, and projections;
- `get_amordle_combat_game_v2`;
- `apply_amordle_combat_action_v2`;
- `cancel_amordle_combat_game_v2`;
- `forfeit_amordle_combat_game_v2`;
- the existing Ranked Practice queue, claim, finalize, and settlement RPCs;
- the existing Daily lobby and matchmaking tables;
- private-request preferences, blocks, pair locks, expiry, and anti-spam data;
- Practice rematch request lifecycle and its uniqueness constraints;
- rating profiles, match results, player results, and rating transactions.

The original 45 migrations remain immutable.

## Minimum additive migration

Create migration 46 only after authorization. It should:

1. Extend the private authority `source_kind` check to
   `public_lobby`, `ranked_queue`, `daily_lobby`, `private_request`, and
   `rematch`.
2. Add private source-link columns or a narrow private source-link table only
   where needed to bind a public lobby, private request, rematch request, or
   Daily reservation to exactly one authority row.
3. Add idempotent security-definer RPCs that create or finalize private
   authority rows and return the existing sanitized v2 participant projection.
4. Replace browser-visible Ranked Daily status with a participant-safe
   projection containing opaque request/game identifiers, status, timestamps,
   compatible configuration, and player-relative roles—never raw Auth UUIDs.
5. Add an anonymous/authenticated spectator projection for active or completed
   public unranked Practice only. It must deny waiting, Daily, private,
   rematch, custom, and restricted games by list and exact-ID lookup.
6. Preserve the existing command, clock, terminal, and settlement functions
   once an authority row exists.
7. Revoke all new helpers from `public` and `anon` by default. Grant only the
   narrow public spectation reader to `anon`; grant participant mutations to
   `authenticated`.

Recommended public RPC surface:

| RPC | Purpose |
| --- | --- |
| `create_amordle_public_practice_v3(mode, word_length, difficulty, hard_mode, go_puzzle_count, time_limit_ms, creation_key)` | Create one waiting public Practice authority row without exposing answers. |
| `list_amordle_public_practice_v3(limit)` | Return joinable, non-stale, block-compatible lobbies with safe creator identity. |
| `join_amordle_public_practice_v3(game_id, expected_version, action_id)` | Atomically join one waiting lobby and return the participant projection. |
| `accept_private_multiplayer_match_request_v3(request_id, action_id)` | Reuse existing request policy while creating exactly one private authority row. |
| `accept_practice_multiplayer_rematch_v3(request_id, action_id)` | Reuse the rematch pair lock while creating exactly one new authority row. |
| `get_amordle_ranked_daily_status_v3(request_id)` | Return account-relative, sanitized queue/match status without raw Auth IDs. |
| `finalize_amordle_ranked_daily_v3(request_id, game_id, action_id)` | Atomically finalize a Daily reservation and return the participant projection. |
| `get_amordle_public_practice_spectator_v3(game_id)` | Return a read-only safe projection for an eligible public Practice game. |

Exact SQL argument types and overload handling must be verified against the
generated database types before writing the migration. Existing incompatible
overloads should be revoked rather than dropped when compatibility is needed.

## RLS and grant review

Mandatory migration tests:

- `brrrdle_private` remains inaccessible to `public`, `anon`, and
  `authenticated`;
- answer arrays, seeds, catalogs, raw participant IDs, clocks, private drafts,
  action ledgers, rating snapshots, and request-private fields never appear in
  a browser projection;
- only participants can read or mutate participant projections;
- only the creator can cancel a waiting public lobby;
- join is atomic, block-compatible, and cannot claim a full/stale lobby;
- private request and rematch accept are opponent-only and idempotent;
- anonymous spectation can read only active/completed public unranked Practice;
- exact-ID lookup cannot bypass list eligibility;
- Daily and private games remain invisible to spectator roles;
- service-role access is reserved for bounded setup, cleanup, and invariant
  probes.

## Replay and compatibility proof

The migration must be additive and replay-safe:

- `create or replace function`, guarded constraints, and idempotent indexes;
- existing authority v2 Ranked Practice and unranked Daily rows remain valid;
- legacy rows remain readable for continuity but no new accepted flow creates
  an answer-bearing legacy projection;
- all creation/finalization actions use stable idempotency keys;
- a retry returns the same game/projection or a deterministic conflict;
- existing in-progress legacy games are not rewritten;
- adapters temporarily parse legacy and v3 projections until the protected
  Preview proves the cutover;
- generated database types are refreshed only after linked migration identity
  is verified.

## Cleanup impact

The resource ledger must register queue requests, reservations, authority
games, public game rows, private/rematch requests, match results, player
results, rating transactions, History, economy, and Auth users immediately.

Cleanup order:

1. stop mutations and close browser contexts;
2. remove rating transactions and player/match results;
3. remove History, progression, economy, and notification test rows;
4. remove private/rematch requests, queue reservations, and claims;
5. delete public game rows so private authority rows cascade;
6. delete disposable profile/settings rows;
7. delete disposable Auth users last;
8. probe every exact identifier through public, participant, private,
   Auth, Storage, and Blob boundaries.

Cleanup may retry the exact sequence at most three times. Any residue blocks
checkpointing.

## Rollback

There is no down migration.

- Code rollback: forward-revert to the last green checkpoint.
- Preview rollback: redeploy exact v5.3 commit
  `31be382e50fa451a9a8a961780f317f9555ed408`.
- Database correction: ship a separately reviewed forward-only repair
  migration.
- Existing data is retained; no real player or Auth row is deleted.

## Verification completed at this gate

| Command | Result |
| --- | --- |
| `pnpm check` | Green |
| `pnpm test:domain` | 32 passed |
| `pnpm test:browser` | 8 passed |
| `pnpm test:e2e:fixture` | 14 passed across Chromium, Firefox, and WebKit |
| `pnpm test:visual` | 9 passed |
| MP audit verifier | 73/73 truthful records |
| Ordinary parity verifier | 237/237 truthful implementation/evidence statuses |
| Bootstrap and migrations | 107/107 and 45/45 |
| HTTP interfaces | Exactly three |
| Bundle budgets | Home 180044 B JS / 16706 B CSS; game 185749 B JS / 20848 B CSS |

`pnpm test:e2e:services`, `pnpm test:acceptance:local`, and
`pnpm test:acceptance` are intentionally not claimed at this gate. The final
strict parity verifier correctly blocks acceptance until the remaining MP
clauses have real clause-specific evidence. No hosted mutation or deployment
was performed.

## Post-authorization execution

After explicit migration authorization, continue autonomously:

1. implement and statically validate migration 46;
2. link/apply it only to the verified Supabase project;
3. regenerate types and cut public Practice, private acceptance, rematches, and
   Ranked Daily over to the authority projection;
4. complete Daily, GO, clocks, terminal precedence, conflict, requests,
   rematches, spectation, rating, History, Stats, alerts, and privacy tests;
5. run the complete local command stack;
6. deploy one exact green protected Preview;
7. run serial real-UI hosted journeys with at least three disposable accounts;
8. clean to zero residue;
9. publish paired final reports and checklists;
10. stop for manual review, merge, and release authorization.

The previously exposed Preview-scoped Blob credential still requires owner
rotation or revocation. Its value is not stored in this packet.
