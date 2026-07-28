# Amordle Stage 2 Completion Report

## Outcome

Quiet Workbench v2 is implemented and green as the Stage 2 visual authority.
The Stage 1 rules, routes, persistence, service authority, and all 237 clauses
remain intact. The final application candidate is available behind Vercel
Deployment Protection for manual review.

| Item                  | Final authority                                                                   |
| --------------------- | --------------------------------------------------------------------------------- |
| Branch                | `codex/amordle-terminal-greenfield-implementation-2026-07-27`                     |
| Application candidate | `ef8407216afde5bc4639411b210678b731090dee`                                        |
| Preview deployment    | `dpl_3jyBWjwVzFJLFU9rxHyuZhbgcbzV`                                                |
| Preview URL           | `https://amordle-f88bigwdu-ryanjosephkamps-projects.vercel.app`                   |
| Visual authority      | `design/references/stage2/v2-terminal-workbench-2026-07-27`                       |
| Supabase              | `squqdstdvbsvhagfuzgj`                                                            |
| Migration ledger      | 45/45; SHA-256 `f73fc5e4260585a93035c4dc2b5bb9216d5576124c55f652d4a66b1369fd14bf` |
| Bootstrap baseline    | 107/107 immutable files                                                           |
| Functional parity     | 237/237 verified rows                                                             |

## Delivered

- A cohesive terminal-derived application frame with compact command bar,
  route context rail, persistent status language, desktop navigation, mobile
  navigation, Focus Mode, and restrained system light/dark themes.
- Low-radius, one-rule work regions; fixed compact typography; tabular data;
  accessible focus; text-first actions; structural loading rows; and explicit
  offline, reconnecting, unavailable, unauthorized, recovery, empty, and error
  states.
- Redesigned Home and primary command hierarchy without a generic dashboard
  grid or decorative fake-shell theater.
- Complete Solo OG and GO game framing with evidence-aware tiles, non-color
  glyphs, board, keyboard, Practice tools, Daily status, results, sharing,
  definitions, and mobile-first playfield protection.
- Redesigned Daily Calendar, unlock confirmation, Marketplace purchase
  confirmation, progression, and economy language. No coins are spent before
  explicit confirmation.
- Redesigned COMBAT overview, lobby, waiting, participant boards, mobile turn
  priority, recovery, results/rematch, Active, notifications, and privacy-safe
  read-only spectation.
- Redesigned Auth, Profile, public player, Settings, History, Stats,
  Leaderboards, Word Explorer, Help, Feedback, About, Admin, and global route
  states.
- A cross-surface editorial pass that removes implementation-facing language
  and consistently describes asynchronous alternating-turn play.

## Professional visual acceptance

The final fidelity ledger is
`design/references/stage2/v2-terminal-workbench-2026-07-27/fidelity-ledger.json`.

- 35 major-surface concept comparisons: five per surface.
- 16 Home/Solo screenshots across 320, 360, 390, 412, 768, 960, 1440, and
  1920 widths.
- System light and dark, 320px stress, 390px mobile, 200% zoom, reduced motion,
  and forced-colors evidence.
- Every surface scores at least 43/50; no category is below 4/5; terminal
  authenticity is at least 4/5.
- No forbidden cyberpunk, fire/ice, atmospheric texture, glass, excessive glow,
  scanline, code-rain, or generic SaaS-card treatment.
- Native-size review records exact copy differences and intentional,
  contract-driven deviations.
- The final hosted run adds five resolved account/data captures and exact
  COMBAT waiting, mobile active, recovery, result/rematch, and spectator
  captures.

## Verification

| Gate                         | Result                                                   |
| ---------------------------- | -------------------------------------------------------- |
| `pnpm check`                 | Green                                                    |
| `pnpm test:domain`           | 4 files; 18 tests green                                  |
| `pnpm test:browser`          | 1 file; 3 tests green                                    |
| `pnpm test:e2e:fixture`      | 12 tests green; Chromium full, Firefox/WebKit core       |
| `pnpm test:e2e:services`     | 1 serial protected-Preview journey green                 |
| `pnpm test:visual`           | 4 tests green; 52 visual captures plus vitals            |
| `pnpm test:acceptance:local` | Green                                                    |
| `pnpm test:acceptance`       | Green at exact candidate commit and Preview              |
| Accessibility                | No serious or critical representative-route axe findings |
| Home bundle                  | 173,198 B compressed JavaScript; 9,220 B CSS             |
| Gameplay bundle              | 179,129 B compressed JavaScript; 11,135 B CSS            |
| Hosted mobile vitals         | LCP 380 ms; INP 32 ms; CLS 0                             |
| HTTP interfaces              | Exactly 3                                                |

Home continues to request no word bank. Game and Explorer contexts load only
the selected length. The required input, bundle, accessibility, overflow,
responsive, and Web Vitals budgets remain green.

## Protected service evidence and cleanup

The final hosted evidence root is:

`.codex-internal/evidence/e2e_20260728T041602844Z_ef840721_c179a917`

The run registered three disposable Auth users and one exact public Practice
game before mutation. It proved:

- real UI sign-in in three isolated contexts;
- candidate word publication with 34 bounded objects;
- five resolved signed-in account/data surfaces;
- public match creation and join;
- two alternating accepted turns and refresh recovery;
- a third terminal winning move and result/rematch state;
- sanitized read-only spectation with no answer/private identifier in the
  spectator RPC payload and no mutation control.

Contexts closed before deletion. Dependent database rows and the exact game
were deleted before the three disposable Auth users. Cleanup succeeded on the
first attempt with zero database residue and zero Auth residue. No real player
or Auth record was selected for deletion.

## Preview and operational boundaries

- Anonymous access to the candidate returns the expected Vercel SSO redirect.
- Deployment metadata resolves exactly to candidate commit
  `ef8407216afde5bc4639411b210678b731090dee`.
- Vercel project settings were restored after the Preview build to
  `Other / dist / automatic build`.
- Two failed Preview-only build attempts were never promoted: the first exposed
  Vercel’s Node 24.15 default, and the second exposed the frozen `dist` output
  setting. The successful build used the existing verified Node 24.18
  installer and a temporary Next.js packaging window, then restored settings.
- Production deployment `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` remains Ready and
  unchanged.
- Repository remains private; default branch remains
  `bootstrap/greenfield-2026-07-20`.
- Supabase remains 45/45 with no schema change.
- Locked shell commit remains
  `062624b2fb7c8d039a2eba3aec5b059c26628a11`.
- Existing recovery refs, ignored local secret custody, and commit-scoped
  Preview word manifests remain intact.

## Current gate

Stop at manual review of the protected Preview. This report does not authorize
a merge, Production release, default-branch change, schema change, branch
deletion, stash inspection, or real-account deletion.
