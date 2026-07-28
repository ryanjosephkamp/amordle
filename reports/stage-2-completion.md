# Amordle Stage 2 v4 Delivery Report

## Current outcome

The Alt-Screen TUI v4 functional shell is implemented and locally green. It
replaces Quiet Workbench v2 as the active presentation authority while
preserving the working Stage 1 application behavior.

The v4 candidate is **not yet deployed**. A Vercel Blob read/write credential
was exposed in local tool output during deployment preparation. A fresh,
read-only pull of the Preview environment at `2026-07-28T16:46:53Z` confirmed
that the credential had not been rotated. Preview deployment, hosted service
tests, and final hosted evidence remain halted until the account owner rotates
or revokes it.

| Item                  | Current authority                                                                 |
| --------------------- | --------------------------------------------------------------------------------- |
| Branch                | `codex/amordle-terminal-greenfield-implementation-2026-07-27`                     |
| v4 application commit | `813bbe13711349feafd5d7c170f4f814d71f1994`                                        |
| Current evidence head | `f04c81a95aaea17d890f260064521634445d5fd4`                                        |
| v4 visual authority   | `design/references/stage2/v4-alt-screen-shell-2026-07-28`                         |
| Existing Preview      | `dpl_3jyBWjwVzFJLFU9rxHyuZhbgcbzV` (superseded v2 candidate)                      |
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
  the menu, keeps 44px touch controls, and leaves the on-screen keyboard
  unobstructed.
- Shared terminal framing for Daily, Calendar, economy, COMBAT, account/data,
  Word Explorer, support, Admin, and exceptional states.
- Forced-colors and reduced-motion fallbacks that preserve hierarchy without
  relying on translucency, color, or cursor animation.

## Preserved behavior and boundaries

The v4 change is presentation-only. It does not change game or GO rules, Daily
selection, controllers, persistence envelopes, word-bank loading, Auth,
Supabase, Realtime, Blob publication, routes, APIs, RPCs, migrations, or
service authority.

- All 237 parity clauses remain mapped and green.
- Exactly three HTTP interfaces remain.
- Home requests no word bank.
- Game and Explorer contexts retain selected-length-only loading.
- Production, the default branch, the 45 migrations, real accounts/player
  data, recovery refs, and locked shell remain unchanged.

## Local verification

| Gate                         | Result                                                     |
| ---------------------------- | ---------------------------------------------------------- |
| `pnpm check`                 | Green                                                      |
| `pnpm test:domain`           | 4 files; 18 tests green                                    |
| `pnpm test:browser`          | 1 file; 3 tests green                                      |
| `pnpm test:e2e:fixture`      | 12 tests green across Chromium, Firefox, and WebKit        |
| `pnpm test:visual`           | 5 tests green                                              |
| `pnpm test:acceptance:local` | Green                                                      |
| `pnpm test:e2e:services`     | Not run against v4; requires the blocked protected Preview |
| `pnpm test:acceptance`       | Pending the blocked protected Preview                      |
| Accessibility                | No serious or critical representative-route axe findings   |
| Home bundle                  | 173,586 B compressed JavaScript; 13,379 B CSS              |
| Gameplay bundle              | 179,475 B compressed JavaScript; 15,773 B CSS              |
| Local mobile vitals          | LCP 120 ms; INP 32 ms; CLS 0.0003232403939022726           |
| HTTP interfaces              | Exactly 3                                                  |

Local browser review covered Home, Solo, COMBAT, Stats, and Word Explorer.
Evidence includes 320px dark mode, 390px mobile gameplay, 1440px dark mode,
200% zoom, forced colors, reduced motion, and every required responsive width.
A real local Solo guess entered through the on-screen keyboard was accepted.

The fidelity ledger is
`design/references/stage2/v4-alt-screen-shell-2026-07-28/fidelity-ledger.json`.
It records native-size inspection, seven cross-surface comparison points,
above-the-fold copy comparison, and intentional behavior-preserving
deviations.

## Hosted evidence still required

After confirmed credential rotation, the remaining authorized sequence is:

1. refresh ignored local Preview secret custody without printing values;
2. deploy the exact private v4 candidate to a protected Preview;
3. run `pnpm test:e2e:services` and `pnpm test:acceptance` against that exact
   deployment;
4. register every disposable resource, close contexts, perform bounded exact
   cleanup, and prove zero residue;
5. record the exact deployment ID, hosted screenshots, service identities,
   cleanup receipt, final evidence commit, and known-good rollback target.

The existing Preview and its earlier zero-residue receipt remain valid
historical v2 evidence, but they are not evidence for the v4 candidate.

## Security stop and review boundary

The exposed credential value is intentionally absent from repository
artifacts. Do not paste it into chat, URLs, screenshots, issues, commits, or
logs. The account owner must rotate or revoke the Amordle Vercel Blob
read/write credential and confirm completion before any Preview or hosted
mutation resumes.

This report does not authorize a merge, Production release, default-branch
change, schema change, branch deletion, stash inspection, or real-account
deletion.
