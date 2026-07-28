# Amordle Stage 2 v5 protected Preview candidate

## Review candidate

- Protected Preview:
  `https://amordle-8gcyb60r3-ryanjosephkamps-projects.vercel.app`
- Deployment: `dpl_9VdcV6VAY11cCpxrvd2G1zJLLmBQ`
- Application commit: `8b092bf002584bef402ab37efbdd8ef2b4c58852`
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Design authority:
  `design/references/stage2/v5-quiet-system-shell-responsive-play-2026-07-28`

The Preview is protected by Vercel SSO. Anonymous access receives the expected
protection redirect; authenticated project access returns 200.

## Candidate behavior

The v5 candidate removes the faux desktop-window frame and traffic lights,
reduces persistent chrome, quiets Calendar, and treats the browser viewport as
the application surface.

Active Solo and COMBAT games are contained within the available viewport. At
the initial six-row state, the complete board and keyboard are visible without
document scrolling across the tested portrait and landscape phone matrix.
Extended guess history scrolls internally and preserves manual review until the
player uses the visible `Latest row` recovery control. COMBAT uses one
chronological, actor-labelled transcript.

Game rules, controllers, persistence, service adapters, routes, APIs, RPCs,
migrations, and data authority are unchanged.

## Acceptance receipt

| Gate | Result |
| --- | --- |
| `pnpm check` | Green |
| `pnpm test:domain` | 18 passed |
| `pnpm test:browser` | 6 passed |
| Hosted fixture E2E | 12 passed across Chromium, Firefox, and WebKit |
| Hosted service E2E | 1 serial real-service journey passed |
| Hosted visual E2E | 6 passed |
| `pnpm test:acceptance` | Green at the exact application commit |
| Responsive play matrix | 9/9 green |
| Hosted mobile vitals | LCP 464 ms, INP 48 ms, CLS 0 |
| Contract integrity | 237/237 clauses, 107/107 bootstrap, 45/45 migrations, 3 APIs |

The hosted service journey verified real UI sign-in in three isolated contexts,
commit-scoped word publication, public Practice creation and join, alternating
accepted turns, refresh recovery, terminal settlement, rematch presentation,
privacy-safe spectation, and the mobile keyboard/status geometry.

## Cleanup

Final run:
`.codex-internal/evidence/e2e_20260728T233740175Z_8b092bf0_c47505e4`

Cleanup succeeded on the first attempt:

- three disposable Auth users removed;
- one disposable game and all dependent rows removed;
- database residue: zero;
- Auth residue: zero;
- browser contexts closed before deletion.

The first service attempt exposed a stale test selector: it searched for the
old exact accessible letter name while the shared keyboard now announces
letter and evidence state. The application remained operable, and that attempt
also cleaned up on its first try with zero residue. The selector was aligned
with the current accessible contract before the full green rerun.

## Operational boundaries

- Vercel project settings were restored to `Other / dist / automatic`.
- Frozen Production `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` remains Ready and
  unchanged.
- The private repository and default branch remain unchanged.
- Supabase remains healthy with 45/45 migration identity.
- Real players and Auth users were not selected for deletion.
- No merge, Production release, schema change, or locked-shell mutation was
  performed.

The previously exposed Preview-scoped Blob credential still requires rotation
or revocation by the account owner. Its value is not recorded in repository
evidence.

## Manual gate

This candidate is ready for manual review only. Review does not authorize a
merge, Production release, default-branch change, schema change, branch
deletion, or real-account deletion.
