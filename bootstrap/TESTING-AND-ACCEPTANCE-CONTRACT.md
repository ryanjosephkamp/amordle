# Amordle Testing and Acceptance Contract

Version: 1.0

## 1. Principle

Every atomic clause in `FUNCTIONAL-CONTRACT.md` must map to implementation
ownership and either automated evidence or an explicitly bounded manual item.
A static route, mocked success, screenshot, unit suite, or copied shell test
cannot prove real functionality on its own.

The implementation must maintain a machine-readable parity registry with:

- requirement ID;
- implementation module/route;
- domain/component/repository/service owner;
- automated test IDs;
- hosted scenario IDs where required;
- screenshot/manual evidence;
- cleanup evidence;
- status and blocking reason.

The acceptance command fails if an item is missing an owner or required
evidence.

## 2. Required test layers

### Domain and property tests

Use pure TypeScript plus deterministic injected clock, random, word, identity,
and persistence dependencies.

Cover:

- duplicate scoring and keyboard precedence;
- validation order and rejected-guess immutability;
- Hard Mode evidence and multiplicity;
- lengths 2, 5, 7, 10, and 35 plus malformed boundaries;
- Daily selectors, cutoff, date zones, and stored-answer stability;
- GO budgets 5/7/10, seeded evidence, two-second hold, reload, and floor of two;
- scoring, terminal precedence, clocks, Elo, XP, economy, prices,
  continuation, and idempotency;
- local-envelope migration, corruption, account isolation, and reconciliation;
- queue compatibility, FIFO/races, claims, finalization, settlement, requests,
  rematches, blocks, and notifications.

Use fast-check properties where finite examples do not cover the invariant.

### Repository and RPC contract tests

Run against an isolated local Supabase stack or sanctioned disposable remote
data.

Cover:

- strict response parsing and timestamp canonicalization;
- auth/role/method matrices;
- RLS and grants for anonymous, owner, rival, nonparticipant, spectator,
  authenticated non-admin, admin, and service role;
- idempotency and payload conflict;
- stale version/move behavior;
- answer/private-field denial;
- public/private profile boundaries;
- concurrent queue, join, claim, action, terminal, and settlement calls;
- malformed/partial word data and manifest promotion failure;
- exact cleanup/probe RPC behavior.

No migration is applied remotely until local replay and dry-run show only the
separately authorized file.

### Browser component tests

Use Vitest Browser Mode with Playwright rather than DOM-only emulation for
interaction-critical components.

Cover:

- board, keyboard, tiles, status, clock, results, dialogs, menus, tabs, sheets,
  tables, forms, and navigation;
- pointer, touch, physical keyboard, assistive activation, focus, and Escape;
- loading, empty, pending, success, failure, conflict, offline, disabled, and
  terminal states;
- screen-reader announcements without poll/realtime repetition;
- reduced motion and forced colors;
- 44-pixel touch targets and 200% reflow;
- no document overflow at required widths.

### Fixture route E2E

Use a production-shaped application with an explicitly injected test
repository.

- Fixtures live in test-only modules.
- Production routes have no query flag, game ID, environment switch, or import
  path that selects fixtures.
- Import-boundary tests fail if production code imports test data.
- Fixtures verify route/state breadth, responsive structure, and error states;
  they do not satisfy real-service requirements.

### Protected hosted E2E

Run serially against the exact protected Preview and commit.

- Verify the Preview rejects an unauthenticated visitor at the platform
  boundary and is accessible with the test access mechanism.
- Create disposable users through the Node-only harness.
- Sign in through the real browser UI.
- Use isolated browser contexts for different users.
- Drive gameplay through visible controls.
- Probe service state only for durable evidence and cleanup, not as a
  replacement for UI behavior.
- Use one worker by default for stateful service scenarios.
- Fail rather than report success when required credentials or cleanup
  authority are missing.

## 3. Deterministic Node-only test authority

Every run receives a unique ID:

`e2e_<UTC>_<shortCommit>_<random>`

The Node harness may:

- read bundled test data;
- derive deterministic answer sequences for fixture/local tests;
- use bounded service-role inspection functions for games whose creation key
  begins with the exact registered run ID and whose participants are all
  registered disposable users;
- create/confirm/delete temporary Auth users;
- probe exact durable resources;
- drive wins, losses, draws, timeouts, forfeits, duplicate vectors,
  continuation, consumables, settlement, and GO transitions.

It must not:

- expose answers or service credentials to a browser context;
- write answers to screenshots, traces, logs, reports, or public projections;
- inspect unrelated users/games;
- select a fixture through a Production route;
- weaken Production behavior for test convenience.

## 4. Mandatory hosted journeys

### Authentication and account isolation

- Fresh registration, sign-in, sign-out, recovery, and session restore.
- Existing account with settings/progress restores through the real hydration
  gate.
- Fresh context restore.
- Account A → account B switch in one browser with no profile, settings,
  progress, draft, notification, or queue leakage.
- Public/private profile save, reload, lookup, and participant-name use.

### Solo

- Practice OG at representative lengths/difficulties/Hard Mode.
- Practice GO 5/7/10 with budgets, holds, seeded evidence, reload, continuation,
  consumables, completion, History, and rewards.
- Daily OG/GO current and past, insufficient coins, purchase, permanent unlock,
  replay/completion state, local-day boundary, and tampered URL.
- Offline local Solo and later reconciliation.

### COMBAT

- Public Practice create/wait/join/cancel and OG/GO completion.
- Invalid guess leaves move, turn, clock, and draft correct.
- Ranked Practice two-user match, concurrent claim, repeat opponent, cancel,
  finalization, settlement, rating, reload, and search again.
- Ranked and unranked Daily OG/GO lane separation and UTC rollover.
- Timed game, sleep/reconnect, timeout-versus-guess, post-start forfeit, and
  terminal idempotency.
- Private request opt-out/block/anti-spam/create/accept/decline/cancel/expire.
- Rematch lifecycle and postgame routing.
- Active/Lobby/Live convergence and participant-first five-second recovery.
- Anonymous and authenticated public spectation with Daily/private/rematch/
  custom/waiting exact-ID denial.

Use a third context for queue races, spectator convergence, and privacy tests
where two contexts cannot establish the invariant.

### Supporting routes

- Real Home attention and recent results.
- Calendar current-day focus and past-Daily selection.
- Marketplace authority.
- History and Stats after representative activity.
- Leaderboard freshness and public profile routing.
- Word Explorer lengths 2, 5, 7, 10, and 35 without active-answer disclosure.
- Help, Feedback issue preview, About, Settings, notifications, and authorized/
  unauthorized Admin.
- All three API status/auth/method matrices and word-list publication failure.

## 5. Visual and responsive evidence

Assert state before every screenshot.

Capture affected states at:

- reference desktop: 1440×1024;
- reference mobile: 390×844;
- structural widths: 320, 360, 412, 768, 960, and 1920;
- 200% zoom.

Required visual states include:

- Home and navigation;
- Solo OG/GO active, transition, and result;
- Calendar and past-Daily purchase;
- COMBAT waiting, active, conflict/reconnect, timeout, forfeit, and result;
- Live and read-only spectator;
- profile, Leaderboards, Stats, History, Marketplace, and Settings;
- Focus Mode;
- long 35-letter and ten-puzzle GO stress cases;
- reduced motion and forced colors.

Acceptance is structural and perceptual, not a brittle full-page pixel match.
Record hierarchy, density, legibility, interaction state, viewport fit, and
reference alignment.

## 6. Accessibility and performance

Required:

- one main landmark and logical headings per route;
- keyboard-only completion of every essential journey;
- visible focus and correct focus return;
- semantic buttons/links/forms/tables/dialogs;
- status announcements that fire once per meaningful transition;
- no color-only state;
- reduced motion, forced colors, and 200% reflow;
- no horizontal document overflow;
- board/status/keyboard usable in the gameplay viewport;
- no flashing or layout shift from polling;
- key-to-tile response below 100 ms p95;
- mobile LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 on the protected Preview;
- explicit JavaScript/CSS budgets locked by the application plan;
- no word-bank request on Home;
- no forbidden Cache Storage entries;
- no unexpected console/page/network errors.

## 7. Cleanup contract

The harness writes each created resource immediately to:

`.codex-internal/evidence/<runId>/resources.jsonl`

Record:

- Auth users;
- profiles, public profiles, settings, progress, History;
- economy operations/state;
- queue requests, claims, lobbies, games, participants, events, spectators;
- private requests, preferences, blocks, rematches;
- results, player results, rating transactions/profiles;
- idempotency and creation keys;
- Supabase Storage objects;
- Blob revision, object paths, prior manifest version/ETag, and lease objects.

Cleanup order:

1. Stop mutations, timers, polling, and subscriptions; close browser contexts.
2. Delete exact events, spectators, participants, matches, and lobbies.
3. Delete exact rematches, private requests, blocks/preferences, queues, claims,
   games, results, rating transactions, and disposable rating profiles.
4. Use bounded private cleanup functions for registered Daily/authoritative
   rows.
5. Delete exact economy, History, progress, settings, public-profile, and
   private-profile rows.
6. Restore a Preview Blob manifest only when its recorded current ETag/version
   still points to the test revision; then delete exact revision/lease objects.
7. Delete disposable Auth users last.
8. Probe all 24 public tables, private cleanup results, Auth, Storage, and
   Preview Blob for every registered identifier.

Retry exact cleanup at most three times. Wildcard, truncate, email-prefix,
unscoped user, shared-account, stale-lobby bulk deletion, or unrelated-row
inspection is forbidden.

Any residue blocks checkpointing and completion.

## 8. Required commands

The later application must provide:

- `pnpm check`
- `pnpm test:domain`
- `pnpm test:browser`
- `pnpm test:e2e:fixture`
- `pnpm test:e2e:services`
- `pnpm test:visual`
- `pnpm test:acceptance:local`
- `pnpm test:acceptance`

`test:acceptance` fails unless the exact commit, protected Preview, Supabase
project, 45-entry migration ledger (or separately accepted successor count),
required service flags, Node-only authority, and cleanup evidence match the run.

## 9. Completion

Completion requires:

- every functional item mapped and green;
- all required commands green;
- two- and three-context hosted journeys green;
- no production fixture path;
- no secret/private/answer leak;
- zero registered service residue;
- responsive/accessibility/performance gates green;
- an interactive protected Preview;
- paired Markdown/HTML completion reports;
- paired Markdown/HTML manual checklists;
- Production and the locked shell unchanged.
