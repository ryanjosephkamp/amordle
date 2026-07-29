# Amordle Stage 2 v5.1 protected Preview candidate

## Review candidate

- Protected Preview:
  `https://amordle-gve0ekzaa-ryanjosephkamps-projects.vercel.app`
- Deployment: `dpl_9ykWPY3nhuWzmcG1pf5aUZkpaz2X`
- Application commit: `098bdb5ef2335fff86d04a89acdbd122414246fb`
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Feedback authority:
  `design/references/stage2/v5.1-ux-continuity-2026-07-29`

The Preview is protected by Vercel authentication. Anonymous access receives
the expected protection redirect; an authenticated request returns 200.

## Implemented outcome

COMBAT now uses one chronological, centered guess board. Each accepted row
retains its actor label, and the active turn remains explicit. The same row
geometry is used for participant play, results/rematch, and privacy-safe live
spectation.

Routine Solo persistence telemetry is silent. Real backup failures remain
visible, player-facing, and retryable. The full route matrix no longer creates
horizontal document scrolling at standard widths.

Word Explorer controls have distinct field surfaces and selected definitions
open in a focus-managed dialog. Calendar is a minimal Sunday-first month grid
with arrow and swipe navigation. Home contrast is repaired, Help has code-native
examples, and the shell has a universal Account menu.

Existing schema 1–11 account state remains readable. The adapter normalizes
legacy progress, history, Daily access, and entitlements without exposing
legacy answer fields. New account progress writes to a successor state row
instead of overwriting the source snapshot. Profile, Stats, History,
Leaderboards, Settings, and Home attention now fail independently and recover
with bounded player-facing states.

Game rules, controllers, routes, persistence envelopes, RPCs, migrations, and
the three HTTP interfaces are unchanged.

## Acceptance receipt

| Gate                         | Result                                                              |
| ---------------------------- | ------------------------------------------------------------------- |
| `pnpm check`                 | Green                                                               |
| `pnpm test:domain`           | 21 passed                                                           |
| `pnpm test:browser`          | 6 passed                                                            |
| Local fixture E2E            | 13 passed across Chromium, Firefox, and WebKit                      |
| Local visual E2E             | 7 passed                                                            |
| `pnpm test:acceptance:local` | Green                                                               |
| Hosted fixture E2E           | 13 passed across Chromium, Firefox, and WebKit                      |
| Hosted service E2E           | 1 serial real-service journey passed                                |
| Hosted visual E2E            | 7 passed                                                            |
| `pnpm test:acceptance`       | Green at the exact application commit                               |
| Hosted mobile vitals         | LCP 304 ms, INP 40 ms, CLS 0                                        |
| Contract integrity           | 237/237 clauses, 107/107 bootstrap, 45/45 linked migrations, 3 APIs |
| Compressed budgets           | Home 174656 B JS / 14972 B CSS; game 180828 B JS / 18729 B CSS      |

The visual matrix covers 320, 360, 390, 412, 768, 960, 1440, and 1920 widths,
200% zoom, light/dark modes, reduced motion, forced colors, keyboard, mouse,
and touch-oriented controls. It includes a 92-route/width horizontal-overflow
matrix and 35 durable fidelity comparisons.

## Service and continuity evidence

Final run:
`.codex-internal/evidence/e2e_20260729T050504977Z_098bdb5e_d2f9f0ed`

The protected service journey used three disposable accounts and proved:

- real UI sign-in in isolated contexts;
- commit-scoped word publication;
- public Practice creation/join and alternating accepted turns;
- refresh recovery, terminal result, rematch presentation, and read-only
  spectation;
- schema-v11 account continuity across Profile, Stats, History, Leaderboard,
  and signed-in Solo progression;
- creation of the successor state row while preserving the legacy snapshot.

Cleanup succeeded on attempt one. One game, three Auth users, and all dependent
game, profile, rating, economy, settings, history, and progress rows were
removed. Database residue and Auth residue are zero.

## Packaging notes

The first direct remote build selected Vercel Node 24.15.0 and failed the
governed 24.18.0 check. Subsequent diagnostic Preview packages established the
correct prebuilt routing and environment envelope. They created no disposable
service data and are superseded by the exact green deployment above.

The final package was built locally with Node 24.18.0, deployed as Vercel Build
Output API artifacts, and verified against commit `098bdb5`. The temporary
Preview packaging setting was restored before deployment.

## Operational boundaries

- Frozen Production `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` remains Ready and
  unchanged.
- Vercel project settings are restored to `framework: null`,
  `outputDirectory: dist`, automatic build/install, and Node 24.x.
- The private repository and default branch remain unchanged.
- Supabase remains `squqdstdvbsvhagfuzgj` with 45/45 migration identity.
- The locked BRRRDLE-DEV shell remains
  `062624b2fb7c8d039a2eba3aec5b059c26628a11`.
- Real players and Auth users were not selected for deletion.
- No merge, Production release, schema change, default-branch change, or shell
  mutation was performed.

The previously exposed Preview-scoped Blob credential still requires rotation
or revocation by the account owner. Its value is not recorded in repository
evidence.

## Manual gate

This candidate is ready for manual review only. Review does not authorize a
merge, Production release, default-branch change, schema change, branch
deletion, or real-account deletion.
