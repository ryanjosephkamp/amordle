# Amordle Stage 2 v6.6 — Account Controls, COMBAT GO, Stats, and Responsive Hardening

## Outcome

Amordle v6.6 is green on a protected Preview and ready for owner multiplayer review. The release
adds secure account maintenance and lifecycle controls, repairs legacy Settings hydration, integrates
GO seed evidence into the chronological COMBAT transcript, adds an invalid-guess cue, separates the
Lobby's public and private workspaces, fixes selected-surface contrast and intermediate-width
collisions, and expands Stats with accurate accessible visualizations.

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Owner-approved rollback checkpoint: `b3901e39d41f55b09b5faf8fe69d9b2a6d4c7b69`
- Application candidate: `f0a3a10c116530641cb23bafce0aea22f8ba53e5`
- Acceptance evidence checkpoint: recorded by the commit containing this report
- Deployment: `dpl_526Pf8MBtD2GionGGuX7y5ViyuGf`
- Protected Preview: <https://amordle-j0a0ycuc0-ryanjosephkamps-projects.vercel.app>
- Hosted run: `e2e_20260803T010541643Z_f0a3a10c_110a3c24`
- Status: ready for owner review; not merged and not released to Production

## Delivered experience

### Account and Settings

- Settings now normalizes older, partial, nullable, extra-field, and malformed preference payloads
  property by property. Valid stored values survive; only invalid or missing values receive defaults.
- Signed-in players can change email or password through current-password reauthentication and the
  existing Supabase Auth update authority. Password fields clear on close and success.
- The Settings Danger Zone exposes exactly three password-gated, two-step actions:
  - delete Solo history and progress while preserving economy and COMBAT;
  - restart the personal competitive generation while preserving opponent evidence;
  - permanently delete the account after avatar cleanup and settled-shared-fact anonymization.
- Challenges are user-bound, action-bound, one-time, hash-backed, five-minute records. Wrong
  passwords, replay, expiry, account switching, concurrent actions, and active-COMBAT conflicts fail
  closed.

### Account-lifecycle authority

- Migration `20260802193000_amordle_account_lifecycle_v1.sql` was applied with authorized SHA-256
  `caad339a608a0a23f5589a25bed6a1f2d415d033e04db707fce214687192c9f3`.
- Edge Function `account-lifecycle-v1` was deployed from the authorized `index.ts` SHA-256
  `fb961d9e60d39008c50492561a8fa2c04fde12e49264c0a534f3522709cb5dc1` and `deno.json` SHA-256
  `fc9fc38c21441b7f67a91280ed28b8ca4ad67fc69d713db441f5c0fd9a6abf9f`.
- Function ID `8e75a009-e375-4a6e-8de6-6ebb92e1e2c0` is ACTIVE at version 1 with JWT verification.
  Its deployed bundle SHA-256 is
  `02abfe93956535d9de1c26c227dba0245e25b7522eb61de0b6a2b609ca991031`.
- Browser callers receive bounded sanitized receipts. Service-role authority remains outside browser
  bundles. Existing v1 browser RPC behavior and exactly three Next.js API routes are preserved.

### COMBAT, sound, and Lobby

- COMBAT GO now renders validated prior answers as the first rows of the shared chronological
  transcript, followed by current-puzzle guesses. They remain evidence—not moves, turns, points, or
  new persistence records.
- Seed rows are unique, ordered, word-length compatible, and strictly earlier than the current
  puzzle. Malformed or future rows fail closed and never reach rendering or keyboard evidence.
- Genuine dictionary, length, Hard Mode, and authoritative rule rejection now use the existing
  synthesized reject cue. Transport, authentication, stale-version recovery, disabled actions, and
  rerenders do not.
- The Lobby separates Open public games from Private matches with distinct bordered sections.
  Join actions use a bounded rail and panels stack from available container width before collision.

### Contrast, responsive layout, and Stats

- Light selected and hover surfaces now carry explicit primary and muted foreground tokens. Both
  meet ordinary-text contrast requirements without changing semantic evidence colors.
- Toolbar context shrinks and ellipsizes before Alerts, Account, or Menu; the full label remains
  available accessibly. Major grids and forms now stack before their minimum usable widths collide.
- Rating cards auto-fit at usable widths and use stable 2x2 details, keeping status, W-L-D, and dates
  readable.
- Stats adds textual-equivalent, accent-aware level progress, result composition, completed-game
  comparison, attempt distribution, and service-confirmed rating comparison. No chart dependency,
  invented time series, canvas-only content, or fabricated data was introduced.

## Acceptance receipts

The exact application candidate passed the complete local stack:

- `pnpm check`
- `pnpm test:domain`: 121 passed
- `pnpm test:browser`: 21 passed
- `pnpm test:e2e:fixture`: 20 passed across Chromium, Firefox, and WebKit
- `pnpm test:e2e:services`: 3 passed against the protected Preview
- `pnpm test:visual`: 13 passed
- `pnpm test:acceptance:local`: passed
- `pnpm test:acceptance`: passed

Invariant receipts:

- functional parity: 237/237;
- multiplayer audit: 73/73;
- bootstrap: 107/107;
- migrations: 45/45 immutable plus 7/7 authorized additive, 52 synchronized;
- application API routes: exactly 3;
- word authority: 34/34 same-deployment assets, selected-length-only loading, and no Home word-bank
  request;
- no serious or critical axe findings, unexpected console/page/network errors, or horizontal
  document overflow;
- protected hosted performance and interaction budgets remained green.

## Hosted lifecycle proof and cleanup

Run `e2e_20260803T010541643Z_f0a3a10c_110a3c24` used six isolated disposable accounts and visible
player controls. It proved:

- wrong passwords do not create an actionable challenge;
- Solo reset removes Solo sources and active Solo sessions while preserving COMBAT and economy;
- competitive reset cancels waiting authority, starts generation 2, resets all six rating buckets to
  1200 provisional with zero W-L-D, and hides prior personal competitive History;
- permanent deletion removes Auth, avatar, profile, settings, economy, personal history, presets,
  challenges, and public projection while preserving and sanitizing opponent-side settled facts;
- confirmation replay and cross-action misuse fail closed.

Cleanup completed on attempt 1. The run removed exactly 6 Auth users, 7 games, 3 v2 Practice queue
rows, 1 lifecycle-created queue row, 3 ranked Daily queue rows, 1 private request, 1 rematch request,
25 accent presets, 2 avatar objects, and 1 lifecycle result. All database, Storage, private COMBAT,
function-test, and Auth residue probes returned zero.

Two service-harness defects were found without leaving residue and then corrected: asynchronous
avatar URL readiness and the lifecycle-reset queue's legacy authority version. The final run also
uses the database contract's `win`/`loss` vocabulary. These corrections are test-only and do not
weaken product authority or cleanup checks.

## Annotation and visual ledger

| Owner annotation | Accepted v6.6 result | Evidence |
| --- | --- | --- |
| Account settings and Danger Zone | Security dialogs plus three scoped two-step destructive actions | domain authority tests; hosted lifecycle journey |
| Gray on white | selected primary and muted text use contrast-safe foregrounds | selected-surface contrast test |
| Lobby separation and Join width | distinct public/private regions; bounded responsive Join rail | container collision test |
| COMBAT GO seed evidence | seed answers are chronological transcript rows | domain, component, fixture, and spectator privacy tests |
| Invalid guess sound | distinct reject cue only for rule rejection | domain/browser rejection matrix |
| Match code overlap, incorrect state | long context truncates before topbar actions | intermediate toolbar collision test |
| Match code overlap, correct state | narrow-state ellipsis retained with accessible full label | responsive fidelity matrix |
| Ranked Stats overlap | auto-fit cards and 2x2 detail grids | mobile/desktop rating containment tests |
| Settings unavailable for some accounts | tolerant property-level normalization | legacy settings fixture and hosted account coverage |
| Better Stats figures | truthful code-native accessible figures | Stats accuracy and accessibility tests |
| Site-wide zoom overlap | container-aware stacking and pairwise collision assertions | 320-1920 and 200% reflow suites |

Hosted screenshots are retained in the ignored evidence run for Profile, Settings, Stats, History,
Leaderboard, active COMBAT, waiting/result/spectator COMBAT, participant recovery, sanitized
spectation, and custom-accent gameplay. The repository visual suite records the stable public
comparisons without committing disposable private-player evidence.

## Parity, security, and preserved boundaries

- The 237-row parity registry and 73-row multiplayer audit remain fully verified. Evidence was made
  more specific; no unrelated clause was promoted or weakened.
- Passwords, confirmation tokens, service-role credentials, raw Auth identifiers, private account
  data, answers, and seeds are absent from reports, URLs, client bundles, and public projections.
- Production remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- The default branch, real accounts, existing visible test profiles, immutable migrations, word
  authority, Vercel project settings, and locked BRRRDLE-DEV shell remain unchanged.
- No merge, Production release, force push, paid capability, new vendor, or down migration occurred.
- Application rollback is a forward revert and redeployment of
  `b3901e39d41f55b09b5faf8fe69d9b2a6d4c7b69`. Database repair, if ever required, must be a separately
  reviewed forward migration.

## Manual review gate

Use the paired checklist on the protected Preview. Do not exercise destructive actions on a real
account. Merge and Production release require separate authorization.
