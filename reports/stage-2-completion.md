# Amordle Stage 2 v4 Completion Report

## Outcome

The Alt-Screen TUI v4 functional shell is implemented, protected, and
review-ready. It replaces Quiet Workbench v2 as the active presentation
authority while preserving the complete Stage 1 application behavior.

| Item                  | Final authority                                                                   |
| --------------------- | --------------------------------------------------------------------------------- |
| Branch                | `codex/amordle-terminal-greenfield-implementation-2026-07-27`                     |
| Application candidate | `59517db8a47da2740f286ae8e93b6a73fc2715f1`                                        |
| Preview deployment    | `dpl_5oQcXaBsCf8uUDLGeSnV3BnfMaYN`                                                |
| Protected Preview     | `https://amordle-pu5o7yxl5-ryanjosephkamps-projects.vercel.app`                   |
| Visual authority      | `design/references/stage2/v4-alt-screen-shell-2026-07-28`                         |
| Service evidence      | `.codex-internal/evidence/e2e_20260728T200719276Z_59517db8_4a8bd4f6`              |
| Supabase              | `squqdstdvbsvhagfuzgj`                                                            |
| Migration ledger      | 45/45; SHA-256 `f73fc5e4260585a93035c4dc2b5bb9216d5576124c55f652d4a66b1369fd14bf` |
| Bootstrap baseline    | 107/107 immutable files                                                           |
| Functional parity     | 237/237 verified rows                                                             |

## Delivered

- One literal alternate-screen terminal composition with a Mac Terminal-like
  titlebar, route path, textual navigation, main terminal buffer, and compact
  status line.
- SF Mono-compatible system typography, box-drawing rules, prompt markers,
  inverse-video selection, aligned transcript/data rows, restrained cursor
  behavior, and rectangular terminal controls.
- A command-line launcher on Home that preserves ordinary-language route
  descriptions and real account attention without requiring typed commands.
- Numbered Solo and COMBAT game rows, contiguous cells, active-cursor
  treatment, evidence glyphs, compact HUD/status language, and a terminal key
  grid.
- A mobile translation that removes the route dock during gameplay, preserves
  the menu, keeps 44px touch controls, and places the status line after the
  complete on-screen keyboard instead of over it.
- Shared terminal framing for Daily, Calendar, economy, COMBAT, account/data,
  Word Explorer, support, Admin, and exceptional states.
- Forced-colors and reduced-motion fallbacks that preserve hierarchy without
  relying on translucency, color, or cursor animation.

## Preserved behavior and boundaries

The v4 work changes presentation only. It does not change game or GO rules,
Daily selection, controllers, persistence envelopes, word-bank loading, Auth,
Supabase, Realtime, Blob publication, routes, APIs, RPCs, migrations, or
service authority.

- All 237 parity clauses remain mapped and green.
- Exactly three HTTP interfaces remain.
- Home requests no word bank.
- Game and Explorer contexts retain selected-length-only loading.
- Production, the default branch, the 45 migrations, real accounts/player
  data, recovery refs, and locked shell remain unchanged.

## Verification

| Gate                         | Result                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm check`                 | Green                                                                                                       |
| `pnpm test:domain`           | 4 files; 18 tests green                                                                                     |
| `pnpm test:browser`          | 1 file; 3 tests green                                                                                       |
| `pnpm test:e2e:fixture`      | 12 tests green across Chromium, Firefox, and WebKit                                                         |
| `pnpm test:e2e:services`     | 1 serial protected-Preview journey green                                                                    |
| `pnpm test:visual`           | 5 tests green                                                                                               |
| `pnpm test:acceptance:local` | Green for the v4 presentation; final repair rechecked with `pnpm check`, domain, browser, and visual suites |
| `pnpm test:acceptance`       | Green at the exact final application commit and Preview                                                     |
| Accessibility                | No serious or critical representative-route axe findings                                                    |
| Home bundle                  | 173,586 B compressed JavaScript; 13,383 B CSS                                                               |
| Gameplay bundle              | 179,475 B compressed JavaScript; 15,777 B CSS                                                               |
| Hosted mobile vitals         | LCP 368 ms; INP 32 ms; CLS 0.0003232403939022726                                                            |
| HTTP interfaces              | Exactly 3                                                                                                   |

Hosted acceptance also proves that the mobile game status line begins after
the complete keyboard. All Submit/Delete controls remain visible and
unobstructed at 390 × 844.

## Visual evidence

The final fidelity ledger is
`design/references/stage2/v4-alt-screen-shell-2026-07-28/fidelity-ledger.json`.

- Seven concept-to-browser comparison points covering terminal frame,
  alternate-screen hierarchy, selection, game anatomy, mobile translation,
  dense/support surfaces, and accessibility fallbacks.
- 35 visual-matrix captures: five states for each of seven major surface
  groups.
- 16 Home/Solo captures across 320, 360, 390, 412, 768, 960, 1440, and 1920
  widths.
- System light and dark, 320px stress, 390px mobile, 200% zoom, reduced motion,
  and forced-colors evidence.
- 11 protected-service captures for signed-in account/data surfaces and COMBAT
  waiting, active, recovery, result/rematch, and privacy-safe spectation.
- Native-size inspection, above-the-fold copy comparison, and documented
  intentional deviations.

## Protected service evidence and cleanup

The final hosted evidence root is:

`.codex-internal/evidence/e2e_20260728T200719276Z_59517db8_4a8bd4f6`

The run registered three disposable Auth users, one public Practice game, and
one non-disposable commit-scoped Preview manifest before mutation. It proved:

- real UI sign-in in three isolated contexts;
- candidate word publication with 34 bounded objects;
- five resolved signed-in account/data surfaces;
- public match creation and join;
- two alternating accepted turns and refresh recovery;
- a third terminal winning move and result/rematch state;
- sanitized read-only spectation with no answer/private identifier in the
  spectator RPC payload and no mutation control;
- mobile keyboard/status geometry with no overlap.

Contexts closed before deletion. Dependent database rows and the exact game
were deleted before the three disposable Auth users. Cleanup succeeded on the
first attempt with zero database residue and zero Auth residue. No real player
or Auth record was selected for deletion. The commit-scoped Preview manifest
is retained intentionally as candidate evidence.

## Preview and operational boundaries

- Anonymous access receives the expected Vercel SSO protection response.
- Deployment metadata resolves exactly to application commit
  `59517db8a47da2740f286ae8e93b6a73fc2715f1`.
- Vercel project settings were restored after the Preview build to
  `Other / dist / automatic build`.
- Production deployment `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` remains Ready and
  unchanged.
- Repository remains private; default branch remains
  `bootstrap/greenfield-2026-07-20`.
- Supabase remains 45/45 with no schema change.
- Locked shell commit remains
  `062624b2fb7c8d039a2eba3aec5b059c26628a11`.
- Existing recovery refs and ignored local secret custody remain intact.

## Security follow-up

A Preview-scoped Vercel Blob read/write credential was exposed in local tool
output during deployment preparation. Its value is intentionally absent from
all repository artifacts. OIDC replacement was attempted but the existing Blob
connection rejected it as not enabled for that environment.

The owner explicitly authorized this hosted run before rotation. The
credential still must be rotated or revoked afterward. Do not paste it into
chat, URLs, screenshots, issues, commits, or logs.

## Current gate

Stop at manual review of the protected Preview. This report does not authorize
a merge, Production release, default-branch change, schema change, branch
deletion, stash inspection, or real-account deletion.
