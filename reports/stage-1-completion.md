# Amordle Stage 1 Completion Report

## Outcome

Stage 1 is complete and green. The private branch contains the functional
terminal foundation, and the exact application candidate is available behind
Vercel Deployment Protection.

| Item               | Authority                                                                         |
| ------------------ | --------------------------------------------------------------------------------- |
| Branch             | `codex/amordle-terminal-greenfield-implementation-2026-07-27`                     |
| Candidate commit   | `cdde62caf7f3a0daf135efbe611cbb92393f54df`                                        |
| Preview deployment | `dpl_tfnrGgi2sAtugLJR69DDCjyyc9ks`                                                |
| Preview URL        | `https://amordle-p1qp5fpnk-ryanjosephkamps-projects.vercel.app`                   |
| Supabase           | `squqdstdvbsvhagfuzgj`                                                            |
| Migration ledger   | 45/45; SHA-256 `f73fc5e4260585a93035c4dc2b5bb9216d5576124c55f652d4a66b1369fd14bf` |
| Bootstrap          | 107/107 immutable files                                                           |
| Parity             | 237/237 verified rows                                                             |

## Delivered

- Complete canonical application shell, responsive navigation, Focus Mode,
  PWA update/offline behavior, accessibility foundations, and legacy redirects.
- Solo OG/GO, 2–35 letters, 5/7/10 chains, Daily selection, Hard Mode,
  duplicate scoring, consumables, definitions, sound, sharing, persistence,
  corruption handling, and reconciliation.
- Auth, isolated local/cloud account state, profiles, settings, progression,
  marketplace, Calendar, History, Stats, public statistics, and Leaderboards.
- Public, private, ranked, unranked, Practice, Daily, rematch, queue, clock,
  settlement, notification, recovery, and privacy-safe spectator COMBAT paths.
- Home attention, Word Explorer, Help, Feedback, About, authorized Admin, and
  word-list publication/status.
- Exactly three HTTP interfaces:
  `POST /api/admin-refresh`,
  `GET /api/cron/refresh-word-lists`, and
  `GET /api/word-lists/manifest`.

## Verification

| Gate                 | Result                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm check`         | Green                                                                                                |
| Domain               | 4 files, 18 tests                                                                                    |
| Browser components   | 1 file, 3 tests                                                                                      |
| Fixture E2E          | 12 tests; Chromium full, Firefox/WebKit core                                                         |
| Service E2E          | 3 real UI sign-ins; create/join; 2 accepted alternating turns; refresh recovery; sanitized spectator |
| Visual/performance   | 3 tests; 18 responsive screenshots plus reflow/forced-colors evidence                                |
| Accessibility        | No serious or critical representative-route axe findings                                             |
| Home bundle          | 172,104 B compressed JS; 7,386 B CSS                                                                 |
| Gameplay bundle      | 178,306 B compressed JS; 8,620 B CSS                                                                 |
| Hosted mobile vitals | LCP 356 ms; INP 24 ms; CLS 0                                                                         |
| API count            | Exactly 3                                                                                            |

The final complete hosted run is
`.codex-internal/evidence/e2e_20260727T225302895Z_cdde62ca_f93c8f87`.
The tightened exact-panel spectator evidence and latest zero-residue receipt
are in
`.codex-internal/evidence/e2e_20260727T225614646Z_cdde62ca_39e41df9`.

## Cleanup and custody

The final service run registered three disposable Auth users and one exact game
before mutation. Contexts closed first; the game and dependent rows were
deleted by exact identifiers; Auth users were deleted last. The first cleanup
attempt found zero database and Auth residue. No real player row or Auth user
was selected for deletion.

Automation, Supabase service, and browser credentials remain only in ignored
local custody. The protected Preview still returns Vercel SSO without the
private bypass. The candidate word manifest is commit-scoped; Production Blob
paths were not read or overwritten.

## Preserved boundaries

- Repository remains private; default branch remains
  `bootstrap/greenfield-2026-07-20`.
- Production deployment
  `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` remains Ready and unchanged.
- The Vercel project’s pre-existing global framework/output settings were
  restored after every Preview build.
- Supabase remains 45/45 with no schema mutation.
- Locked shell commit remains
  `062624b2fb7c8d039a2eba3aec5b059c26628a11`.
- No merge, Production release, default-branch change, stash inspection, or
  real player/Auth deletion occurred.

## Current gate

Three coordinated Stage 2 reference boards and a provenance manifest are ready
in `design/references/stage2/`. Stage 2 implementation is paused for explicit
approval of that manifest.
