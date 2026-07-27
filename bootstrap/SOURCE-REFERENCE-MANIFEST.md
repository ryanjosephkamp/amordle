# Amordle Source Reference Manifest

## 1. Recovery application

| Field | Value |
|---|---|
| Repository | `ryanjosephkamp/amordle` (private) |
| Golden branch | `codex/pre-terminal-greenfield-golden-2026-07-26` |
| Golden tag | `amordle-pre-terminal-greenfield-golden-2026-07-26` |
| Golden commit | `43556d99e6e59ff77135ff347da3bc9be056fedf` |
| Golden tracked paths | 303 |
| Role | Recovery and historical inspection only |

The current clean lineage must not import source, tests, fixtures, APIs, visual
assets, or governance from this commit.

## 2. Locked behavioral shell

| Field | Value |
|---|---|
| Repository | `https://github.com/ryanjosephkamp/brrrdle-dev` |
| Commit | `062624b2fb7c8d039a2eba3aec5b059c26628a11` |
| Tag | `phase-58-final-functional-shell-golden-2026-07-13` |
| Live reference | `https://brrrdle-dev.vercel.app` |
| Tracked paths | 1,399 |
| Role | Read-only behavioral, rule, outcome, and edge-case authority |

Do not inspect an archived branch when the locked commit, retained contracts,
tests, migrations, or live shell resolve the behavior. Never mutate the shell
repository, deployment, data, configuration, or services.

## 3. Authoritative shell documents

SHA-256 values were calculated from the locked checkout.

| Path at shell commit | SHA-256 | Purpose |
|---|---|---|
| `BRRRDLE-OVERVIEW.md` | `e4b29c3afc1889c6df241a3bdd4555f20077452eb2d08b28673ecd33dd221ecc` | Product and route overview |
| `BRRRDLE-SPEC.md` | `3d93df73a11e9ac22ebb63c58880abb64d4593439a4000fd086fff3c542a2999` | Detailed behavior and rules |
| `SHELL-LOCK.md` | `8c8ee58a9b738b3cbf1d4db5f6fa10e9334f65ae751d8e95418275f78e617971` | Read-only lock |
| `planning/handoffs/PRE-PHASE-55-FUNCTIONALITY-PRESERVATION-INVENTORY-2026-07-09.md` | `1a6b117f9f804c648788be4f6c6baecfc5faae6e6eed8918eeabaedb2aedfe11` | APP/GAME/ACC/MP/SUP preservation IDs |
| `planning/testing/TESTING-SUITE.md` | `bd21c7886d1fd2df4f7b07d219e165ef839d1ab44e93d90b470066d662c66051` | Canonical testing topology |
| `planning/phase-58/REVIEW-CHECKLIST.md` | `8a4ab14b90023f1c979a774751ec9685674cb86efb9afc5f94e83f50f591b524` | Final acceptance evidence |
| `planning/phase-58/CHANGELOG.md` | `821cbe9fb33a130038ffe6a733394dbe0e2ea6a90dc6a069d011373ae859c467` | Final behavior changes |

## 4. Capability source routing

| Contract family | Primary shell source areas | Required evidence areas |
|---|---|---|
| APP | `src/app/`, `src/ui/`, `src/pwa/`, `src/index.css` | route/navigation/component tests; accessibility, mobile-scroll, refresh E2E |
| GAME | `src/game/`, `src/game/go/`, `src/data/`, `src/daily/`, `src/definitions/`, `src/sound/` | game/data/domain tests; Solo OG/GO/Daily E2E |
| ACC | `src/account/`, `src/progression/`, `src/history/`, `src/stats/`, `src/leaderboards/`, `src/marketplace/`, `src/calendar/` | account/economy/profile tests; authenticated Solo and account E2E |
| MP | `src/multiplayer/`, `src/notifications/` | reducer/repository/migration tests; two/three-client multiplayer E2E |
| SUP | `src/dashboard/`, `src/wordExplorer/`, `src/help/`, `src/feedback/`, `src/admin/` | route/component/API tests; public/admin browser scenarios |
| API | `api/` | method/auth/upstream/Blob tests |
| Backend | `supabase/migrations/` | migration contract, RLS/grant, RPC, privacy, and cleanup tests |

Every later plan should inspect the exact source and tests at the locked commit
before assigning implementation ownership. Paths are evidence, not files to
copy into the new application.

## 5. Canonical shell E2E anchors

- `e2e/gameplay/authenticated-two-client-smoke.spec.ts`
- `e2e/gameplay/daily-multiplayer-og.spec.ts`
- `e2e/gameplay/daily-multiplayer-go.spec.ts`
- `e2e/gameplay/daily-rotation.spec.ts`
- `e2e/gameplay/live-v1-spectator.spec.ts`
- `e2e/gameplay/multiplayer-reliability.spec.ts`
- `e2e/gameplay/practice-multiplayer-og.spec.ts`
- `e2e/gameplay/practice-multiplayer-go.spec.ts`
- `e2e/gameplay/private-matchmaking.spec.ts`
- `e2e/gameplay/private-request-center-phase56.spec.ts`
- `e2e/gameplay/ranked-daily-controls.spec.ts`
- `e2e/gameplay/solo-daily-go.spec.ts`
- `e2e/gameplay/solo-og.spec.ts`
- `e2e/gameplay/solo-practice-consumables-phase57-authenticated.spec.ts`
- `e2e/gameplay/solo-practice-consumables-phase57.spec.ts`
- `e2e/gameplay/solo-practice-go.spec.ts`
- `e2e/layout/functional-shell-accessibility.spec.ts`
- `e2e/layout/mobile-scroll.spec.ts`
- `e2e/navigation/refresh-route-persistence.spec.ts`

These tests describe scenarios. Passing copied tests against copied fixtures is
not successor evidence.

## 6. Retained backend

| Field | Value |
|---|---|
| Supabase project ref | `squqdstdvbsvhagfuzgj` |
| Local/remote migration count at bootstrap | 45 / 45 |
| Migration checksum-ledger SHA-256 | `f73fc5e4260585a93035c4dc2b5bb9216d5576124c55f652d4a66b1369fd14bf` |
| Public tables | 24 |
| Private authority tables | 8 |
| Browser authority | anon/publishable client plus current Auth session and RLS/RPC |
| Test authority | Node-only service role and bounded cleanup/inspection functions |

The 45 SQL files in this bootstrap are the executable source of truth for
tables, policies, grants, function signatures, ratings, Daily authority,
economy, cleanup, and spectator privacy.

## 7. Retained Vercel boundary

| Field | Value |
|---|---|
| Project | `amordle` |
| Project ID | `prj_8DsbwXWKUtUz7dQl9xoPCgFUuxzH` |
| Team ID | `team_0vEdA7fHR2HdGWr7QWWP2m6x` |
| Production domain | `amordle.vercel.app` |
| Frozen Production deployment | `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` |
| Git deployment | disabled |
| Cron | `GET /api/cron/refresh-word-lists`, `0 0 * * *` |

No token, environment value, or Preview bypass is recorded here.

## 8. Word-list source data

| Field | Value |
|---|---|
| Path | `bootstrap/source-data/word-lists/` |
| Manifest SHA-256 | `4dc7cd30e3972b94d4435096081ba3cfc0ca6fcd099e9971d2ce63d4b7382561` |
| Revision | `7cf03cea4eef62e8611e639d5d8afc2f42adfe0e` |
| Lengths | 2–35 plus manifest |
| Role | Bundled source authority, not automatically public web content |

The application plan must define how to load only one required length while
preventing current multiplayer/private answer authority from leaking.

## 9. Official-current stack research anchors

- Node releases: `https://nodejs.org/en/about/previous-releases`
- Next.js releases/docs: `https://nextjs.org/blog`, `https://nextjs.org/docs`
- React versions: `https://react.dev/versions`
- shadcn/ui Next.js: `https://ui.shadcn.com/docs/installation/next`
- Supabase type generation: `https://supabase.com/docs/guides/api/rest/generating-types`
- Vitest Browser Mode: `https://vitest.dev/guide/browser/`
- Playwright browser contexts: `https://playwright.dev/docs/browser-contexts`

The actual application plan must recheck primary sources and official package
registries immediately before locking exact versions.
