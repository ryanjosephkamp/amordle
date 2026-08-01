# Amordle Stage 2 v6.2 — Public Community Completion

## Outcome

The authorized public-community statistics repair is applied, synchronized, and review-ready on the existing protected Preview. Public directory filtering, public profile aggregates, definitions, private challenges, spectation, and account continuity now have complete local and disposable-user hosted evidence.

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Runtime application commit: `4a0dc068cebec52d60e80f7ee517fab04a8c1479`
- Repair and generated-types commit: `a6670fb7ee7fb25e2391f1fdb066d7f82e96f02a`
- Hosted parity evidence checkpoint: `05bf2e83b6d92371d3b2013895fb6cc47d463ef8`
- Protected Preview deployment: `dpl_21jNGxPqKEGBPcu67AiDwPZjH9qe`
- Protected Preview: <https://amordle-p7azfoby6-ryanjosephkamps-projects.vercel.app>
- Final hosted run: `e2e_20260801T052937627Z_d1b8e365_cc9d315f`
- Status: ready for owner review; not merged and not released to Production.

## Authorized repair

The owner authorized artifact `20260801050000_amordle_public_community_stats_repair.sql` with SHA-256 `7897de557bd118ce2ca7e5f23e260e6cf06e5d58f7d49915ee5668df956d5a22`.

Supabase assigned applied version `20260801051509`. The synchronized repository file is therefore `20260801051509_amordle_public_community_stats_repair.sql`; its SQL bytes retain the authorized SHA-256 exactly.

The repair:

- maps Practice directory filters to current v2 rating buckets;
- aggregates authoritative terminal unranked and ranked COMBAT without double counting legacy settlement rows;
- retains the existing bounded public DTOs and RPC signatures;
- preserves opaque public-profile lookup and excludes answers, seeds, drafts, requests, raw Auth IDs, and private records;
- retains fixed empty function search paths and existing grants;
- adds no table, column, route, HTTP interface, paid service, or runtime vendor.

Linked database types were regenerated after application. Linked/local migration history is synchronized at 48 migrations: 45 immutable baseline migrations plus three separately authorized additive migrations.

## Acceptance receipts

The complete local stack passed:

- `pnpm check`
- `pnpm test:domain`: 70 passed
- `pnpm test:browser`: 14 passed
- `pnpm test:e2e:fixture`: 15 passed across Chromium, Firefox, and WebKit
- `pnpm test:visual`: 9 passed
- `pnpm test:acceptance:local`: passed

The complete hosted command `pnpm test:acceptance` passed against the protected Preview:

- 15 fixture journeys passed;
- 2 real-service journeys passed serially;
- 9 visual/responsive journeys passed;
- 237/237 parity rows passed the acceptance-verified gate;
- 73/73 multiplayer audit rows remain proven.

Hosted evidence proved:

- public player directory search and current Practice rating filtering;
- public profile challenge configuration and request creation through visible UI;
- correct public COMBAT completion totals after an authoritative unranked match;
- sanitized public profile, participant, and spectator projections;
- Word Explorer, terminal result, and History definition behavior with cache reuse;
- private request, alternating-turn recovery, result/rematch, alerts, History, and Stats continuity;
- ranked timed Practice settlement, untimed GO queue cancellation, all four Daily lanes, and exact rating settlement.

Invariant receipts:

- bootstrap baseline: 107/107;
- migrations: 45/45 immutable plus 3/3 authorized additive;
- word assets: 34/34 and 6,097,886 deployment bytes;
- HTTP interfaces: exactly 3;
- Home: 182,310 B compressed JavaScript and 19,381 B CSS;
- gameplay: 188,730 B compressed JavaScript and 23,594 B CSS;
- Home requests no word bank; gameplay and Word Explorer request only the selected length.

## Final cleanup receipt

Run `e2e_20260801T052937627Z_d1b8e365_cc9d315f` completed cleanup on attempt 1:

- 3 disposable Auth users removed;
- 7 games removed;
- 3 ranked Practice and 3 ranked Daily queue records removed;
- 1 private request and 1 rematch request removed;
- all action, result, authority, reservation, rating, History, progression, economy, profile, preference, settings, and Auth probes returned zero.

Status: `zero-residue`.

## Preview deployment decision

A new Ready deployment was not required because this repair changed linked database authority and generated compile-time types, not application runtime behavior. The already-green runtime candidate remains the review Preview.

One clean-source Preview build attempt failed before publication because the Vercel project has a stale generic `dist` source-build output setting. It produced only failed deployment `dpl_H73KiGbSzn57z1z6qQcQXse1yrLs`; it did not replace the Ready protected Preview, change project settings, or affect Production. The project-wide output setting was deliberately left unchanged.

## Preserved boundaries

- Production remains Ready at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- No merge, Production release, default-branch change, down migration, real-account deletion, project setting change, paid service, or Blob-store deletion occurred.
- Real player/Auth data and the locked BRRRDLE-DEV shell remain unchanged.
- The current implementation branch was pushed with normal, non-force commits.

## Manual review gate

Review the protected Preview with the paired checklist. Merge and Production release remain separately authorized operations.
