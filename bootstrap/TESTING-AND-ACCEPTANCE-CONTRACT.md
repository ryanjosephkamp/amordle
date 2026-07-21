# amordle Testing and Acceptance Contract

**Status:** Canonical testing and acceptance contract for the fresh build.
**Date:** 2026-07-20
**Purpose:** Define the evidence required for confidence without forcing the fresh implementation to inherit the old test files, selectors, component boundaries, or architecture.

## 1. Principle

The old suite is evidence of what mattered, not the maximum or mandatory implementation shape of the new suite. The fresh implementation must create tests appropriate to its architecture and achieve at least the behavioral coverage below.

Do not:

- copy old tests wholesale merely to preserve file counts;
- weaken a behavioral assertion because the new architecture differs;
- preserve presentation-specific selectors when roles, labels, domain state, or durable data can assert behavior;
- rely on screenshots to prove persistence, authorization, privacy, settlement, or multiplayer convergence;
- rely only on mocks for behavior whose authority lives in Supabase/Vercel;
- treat a route without an existing test as permission to omit it;
- make the new suite a ceiling that prevents adding better coverage.

## 2. Required layers

### Layer A — pure domain tests

Fast deterministic tests should cover:

- guess normalization and validation;
- duplicate-letter tile scoring;
- keyboard evidence precedence;
- Hard Mode constraints;
- OG session creation, input, submit, win/loss, continuation, reset, serialization, and restoration;
- GO chain generation/versioning, progression, solved-row transition, prior answers, continuation, terminal results, serialization, and legacy restore;
- Practice length 2–35 and difficulty subsets;
- Daily local/UTC date selection, rollover, and anti-gaming behavior;
- progression XP/level, coins, past-Daily unlocks, pay-to-continue, consumables, inventory, and idempotency;
- COMBAT create/join/turn/guess/forfeit/cancel/timeout/terminal behavior;
- canonical player-owned sessions and shared visible move projections;
- scoring constants, points, winner precedence, ties, and summaries;
- Elo expected score, K factors, buckets, rank bands, eligibility, and transaction idempotency;
- ranked queue compatibility/FIFO/retry behavior;
- public/private identity and projection normalization;
- notification projection and action routing;
- storage schema/version normalization and account isolation.

Property or table-driven tests should cover large input spaces such as duplicate letters, word lengths, GO chain selection, date keys, rating vectors, and corrupt persisted payloads.

### Layer B — component/integration tests

Render real application components or feature assemblies to verify:

- semantic board/grid/cell and keyboard operation;
- physical and on-screen input equivalence;
- validation messages without layout corruption;
- dialog focus entry, containment, Escape, and restoration;
- navigation, More/menu, notifications, account menu, and Focus Mode;
- Solo Daily/Practice setup, gameplay, results, continuation, consumables, and re-entry projections;
- COMBAT hub, queue/lobby/private request, shared board, live scores, clocks, spectator, results, and action confirmation;
- authenticated/guest/loading/empty/offline/error/Admin states;
- accessible names, current/selected state, live-region restraint, and color-independent status;
- route-level error isolation and one clear Retry action;
- responsive content ordering and long-board containment.

### Layer C — service-free browser tests

Run the real built application in a browser with deterministic local/fixture authority where remote state is not the subject. Cover:

- all public routes and hidden compatibility routes;
- Back/Forward and intentional refresh-to-Home behavior;
- guest Solo OG/GO Daily/Practice;
- persistence and re-entry;
- Marketplace guest behavior;
- 2-, 3-, 5-, 8-, and 35-letter boards;
- desktop/mobile navigation and Focus Mode;
- no horizontal overflow at 320/360/390/412/tablet/desktop/wide desktop;
- 200% reflow;
- keyboard-only navigation and focus visibility;
- reduced motion and sound off;
- lazy routes, chunk/error recovery, PWA registration, and offline/local-play messaging;
- cold Home without eager answer-bank transfer;
- deterministic screenshot capture for concept comparison.

### Layer D — real Supabase browser E2E

Use the exact dedicated project, two or three isolated authenticated contexts, UI-driven actions, durable row probes, and exact cleanup.

Required flows:

- temporary account creation/sign-in/session restore/sign-out/password-recovery-safe coverage;
- authenticated Solo persistence and fresh-context hydration;
- signed-in economy purchase/use/idempotency/concurrency/privacy;
- Practice COMBAT OG and GO create/join/first turn/later turns/completion;
- Daily COMBAT OG and GO, ranked and unranked lane separation;
- ranked Practice OG/GO queueing, FIFO compatibility, cancellation, concurrent claim retry, search again, terminal settlement, and rating update;
- canonical five-minute timed ranked Practice and timeout precedence;
- private request create/list/accept/decline/cancel/expire, opt-out, blocking, anti-spam, created-game entry, and notifications;
- Active/Lobby/Live freshness and public/private spectator boundaries;
- same-tab hard refresh, Home reset, one-entry participant recovery, and five-second readiness budget;
- GO transition/keyboard/prior-answer/final-result synchronization on both clients;
- post-start forfeit precedence, pre-guess cancellation, compare-and-swap retry/failure, and exact terminal evidence;
- public leaderboards/profiles/site stats without answer or private-data leakage;
- Admin authorization-first behavior with disposable authorized test metadata only when safely configured.

Fixtures must never delete legitimate existing accounts or rows. Cleanup targets only run-marked objects created by that test.

### Layer E — Vercel/API/hosted verification

Against a private preview built from the exact verified source:

- static app and deep-route behavior;
- web manifest, icons, service worker, and offline shell;
- `GET /api/word-lists/manifest` status, shape, cache headers, and safe contents;
- Admin refresh method/auth/admin/failure/success contracts;
- cron unauthorized/authorized contracts without logging secrets;
- Blob manifest and object access plus atomic-swap failure behavior;
- Auth redirect and password recovery origins;
- browser console/network error sweep;
- responsive matrix and core flows;
- privacy and secret scans of HTML, JavaScript, source maps when present, API responses, logs, screenshots, and deployment metadata;
- confirmation that production was not promoted without explicit authorization.

### Layer F — accessibility

Automated checks are necessary but not sufficient:

- semantic roles/names/states and landmark count;
- axe or equivalent automated checks on representative routes/states;
- full keyboard walkthrough;
- focus visibility and no focus occlusion;
- dialogs/sheets/menus focus behavior;
- screen-reader review of navigation, board, keyboard, validation, turn, score, timer, results, notifications, and Admin state;
- 200% zoom/reflow;
- color-independent state meaning and measured contrast;
- reduced-motion behavior;
- touch targets and mobile safe-area clearance.

### Layer G — performance and resilience

Measure and record:

- production bundle/chunk sizes and compression;
- cold Home transferred resources;
- route lazy chunks;
- selected word-list loading rather than all-length loading;
- main-thread and interaction responsiveness on representative mobile hardware/emulation;
- board/keyboard input latency;
- realtime request/subscription behavior and burst coalescing;
- no runaway polling, listener duplication, browser contexts, dev servers, or timers;
- error/retry/offline behavior without state corruption;
- build reproducibility in a clean install.

## 3. Functional coverage matrix

| Capability | Domain | Component/integration | Service-free browser | Real service | Manual |
|---|:---:|:---:|:---:|:---:|:---:|
| Solo Practice OG | required | required | required | authenticated persistence | required |
| Solo Practice GO | required | required | required | authenticated persistence | required |
| Solo Daily OG/GO | required | required | required | account sync where relevant | required |
| Calendar/past Daily | required | required | required | economy authority | required |
| Practice COMBAT OG/GO | required | required | fixture layout only | two-client required | required |
| Daily COMBAT OG/GO | required | required | fixture layout only | two-client required | required |
| Ranked Practice/Daily | required | required | fixture state only | required | required |
| Timed Practice | required | required | fixture clock | two-client required | required |
| Private requests/rematches | required | required | fixture state | two-client required | required |
| Live spectator | projection required | required | public view | two/three-client required | required |
| Accounts/public profiles | validation required | required | guest states | authenticated required | required |
| Economy/Marketplace | required | required | guest required | authenticated required | required |
| History/Stats/Leaderboard | selectors required | required | required | freshness/privacy required | required |
| Notifications | projection required | required | interaction required | lifecycle required | required |
| Admin | authorization models | required | deterministic states | authorized API where safe | required |
| PWA/offline/retry | state models | required | required | hosted required | required |
| Responsive/accessibility | geometry helpers | required | required | hosted spot checks | required |

## 4. Minimum scenario details

### Solo

- solve and lose OG;
- solve every GO puzzle and verify final handoff;
- invalid, wrong-length, unsupported, and Hard Mode guesses;
- continuation and insufficient coins;
- consumable purchase/use/reload and scope exclusion;
- leave, refresh, return, complete, start new, and ensure no resurrection;
- Daily date rollover and past-Daily unlock;
- long-word input/scroll without page overflow.

### COMBAT

- different actors’ guesses appear in one shared ordered board;
- canonical sessions remain different where appropriate;
- only active player can submit;
- correct points after every turn;
- OG solve; GO chain progression; extended/final puzzle behavior;
- points win/draw; timeout win; post-start forfeit; pre-guess cancellation;
- ranked settlement exactly once;
- transient conflict retry and repeated-conflict honest failure;
- queue/search-again races;
- refresh/re-entry and realtime convergence;
- spectator read-only and Daily exclusion;
- 3-letter timed OG, 5-letter standard, 8-letter GO, and 35-letter geometry stress.

### Privacy

- anonymous cannot read account/private/Admin tables;
- one account cannot read another’s progress/settings/economy/private requests or participant-only rows;
- public profiles contain only sanctioned fields;
- public spectator data contains no answer/private identifier/mutation authority;
- ranked Daily private schema is unavailable to browser roles;
- API responses and browser bundles contain no privileged environment value;
- screenshots/reports redact or avoid legitimate private data.

## 5. Test data and cleanup

- Generate a unique run ID.
- Prefix or tag every temporary email, game, request, operation, and row where the schema permits it.
- Record created identifiers only in process memory or ignored artifacts.
- Close browser contexts before deleting users.
- Delete dependent rows in safe order, then temporary Auth users.
- Probe every relevant table/storage collection for that run ID.
- Report counts, never secret values or unrelated row content.
- If exact cleanup cannot be proven, stop. Never broaden deletion to “clean the project.”

## 6. Screenshot and concept-comparison loop

The new implementation should not wait until final review to discover visual drift.

At coherent internal milestones:

1. run functional assertions for the state being captured;
2. capture canonical 1440×1024 and 390×844 screenshots, plus structural checks at 320/tablet/1920;
3. place evidence in an ignored internal directory;
4. compare side-by-side with the relevant locked concept(s);
5. record concrete differences in composition, hierarchy, density, spacing, typography, atmosphere, color, and responsive adaptation;
6. refine before proceeding;
7. link representative screenshots in progress reports.

Concept comparison is qualitative and evidence-backed. Do not create brittle pixel-diff tests against generated art.

## 7. Verification ladder

The fresh implementation plan should choose commands appropriate to its stack, but every cohesive change follows this logic:

1. establish clean scope and current checkpoint;
2. add/adjust focused tests with the behavior;
3. run focused domain/component tests;
4. run lint/static analysis/type checks;
5. run the complete fast suite;
6. build from a clean dependency install into a temporary output directory;
7. run service-free browser tests;
8. run real-service tests only with current authorization and exact identity proof;
9. run hosted verification only on the exact private preview;
10. capture internal visual evidence and accessibility outputs;
11. run secret/privacy/path/diff/publication scans;
12. clean processes, output, browser state, temporary users/rows/objects;
13. create an authorized checkpoint and non-force private backup when the execution prompt permits it.

## 8. Existing reference-suite lessons

The accepted shell previously demonstrated:

- 147 unit-test files / 1,044 tests and a 95-scenario authority-enabled browser gate at the final Phase 58 shell;
- 149 files / 1,052 tests plus complete hosted verification at accepted Wave 00;
- real two/three-client Supabase testing with one worker;
- Chromium full authority coverage and representative Firefox/WebKit recovery coverage;
- explicit migration, RLS, grants, privacy, API, Blob, cron, responsive, PWA, and cleanup probes.

These numbers are historical evidence, not numeric pass criteria for the fresh architecture. The new suite may have fewer broader tests or more focused tests, but it must not provide less behavioral confidence.

## 9. Formal review deliverables

At final implementation readiness and any separately agreed major review gate, produce:

1. canonical Markdown completion report;
2. content-equivalent lightweight mobile HTML report;
3. canonical Markdown manual-review checklist;
4. content-equivalent lightweight mobile HTML checklist;
5. direct links to the private preview and every required screenshot/evidence item;
6. test/coverage matrix with exact pass/fail/skipped counts;
7. known limitations and deferred work;
8. cleanup proof;
9. exact Git checkpoint/backup identities if authorized;
10. one copy-ready next authorization prompt when a real next action exists.

The HTML files use black text on white, system fonts, minimal inline CSS, no JavaScript or remote dependency, content parity with Markdown, and 320/360/390/412 containment.

## 10. Acceptance gate

Do not call the fresh build complete until:

- every required contract row has evidence;
- all blocking tests pass;
- real-service cleanup is exact;
- a private preview is interactive;
- concept alignment is visibly credible across the complete route/state gallery;
- accessibility and responsive manual review pass;
- Ryan accepts the manual checklist;
- production, publication, domain, and public visibility remain unchanged unless separately authorized.
