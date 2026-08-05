# Amordle Post-v6.6 Visual Feedback and Stats Overhaul — Plan-Mode Alignment Prompt

Use `/Users/noir/Documents/amordle-final` as the project workspace.

Operate in Plan mode only. This is a read-only planning task. Do not modify or
create files, install dependencies, run artifact-generating builds or tests,
create commits or branches, push, deploy, mutate GitHub, Supabase, Vercel,
Storage, Auth, or Production, create users or games, inspect Git stash, invoke
Image Gen, or change provider configuration.

## Primary intake authority

Read completely before planning:

1. `reports/stage-2-post-v6.6-owner-visual-feedback-intake-2026-08-04.md`
2. `reports/stage-2-post-v6.6-owner-visual-feedback-intake-2026-08-04.html`
3. All twelve original screenshots listed in the intake’s Source Evidence
   Ledger, at their absolute paths and original resolution

The Markdown intake is the canonical searchable transcription. The screenshots
remain the primary visual evidence. If the transcription and a screenshot
appear inconsistent, stop and identify the exact discrepancy rather than
guessing.

## Starting state to revalidate

Do not assume these facts remain current:

- Private repository: `ryanjosephkamp/amordle`
- Branch:
  `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Golden checkpoint head:
  `16d7a510a15ab5eaf254bc2c163f77b9059854cc`
- Golden checkpoint tree:
  `a4a3a5a130d21d72444e60e09de4d7c30e4f5152`
- Golden tag:
  `amordle-stage2-v6.6-account-controls-combat-stats-responsive-golden-2026-08-02`
- Protected Preview recorded by v6.6:
  `https://amordle-j0a0ycuc0-ryanjosephkamps-projects.vercel.app`
- Preview deployment recorded by v6.6:
  `dpl_526Pf8MBtD2GionGGuX7y5ViyuGf`
- Frozen Production deployment:
  `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`
- Linked Supabase project: `squqdstdvbsvhagfuzgj`
- Migration state: 52 synchronized migrations—45 immutable baseline
  migrations plus seven separately authorized additive migrations
- Immutable bootstrap baseline: 107/107 files
- Functional contract: 237 clauses
- Multiplayer audit: 73 clauses
- Exactly three authoritative application API routes
- The working tree was clean before the post-v6.6 intake artifacts were
  created. The intake Markdown, HTML, and this prompt may now be the only
  intentional uncommitted files.

Stop and report meaningful repository, branch, commit, tag, migration,
bootstrap, GitHub, Supabase, Vercel, Preview, or Production drift.

The original `bootstrap/validate-bootstrap.mjs` is a pre-scaffold validator and
intentionally rejects an application tree. Use the activation receipt and
successor baseline verifier instead.

## Required reading

After the primary intake, read completely:

1. `AGENTS.md`
2. `bootstrap/CONSTITUTION.md`
3. `bootstrap/FUNCTIONAL-CONTRACT.md`
4. `bootstrap/BACKEND-AND-SERVICES-CONTRACT.md`
5. `bootstrap/TESTING-AND-ACCEPTANCE-CONTRACT.md`
6. `bootstrap/PRODUCT-BRIEF.md`
7. `bootstrap/BOOTSTRAP-INSTRUCTIONS.md`
8. Relevant bootstrap manifests, decision ledgers, and service authorities
9. `PRODUCT.md`
10. `DESIGN.md`
11. `README.md`
12. `progress/run_state.json`
13. `progress/events.jsonl`
14. `reports/stage-2-v6.6-account-controls-combat-stats-responsive-completion.md`
15. `acceptance/stage-2-v6.6-account-controls-combat-stats-responsive-manual-checklist.md`
16. `acceptance/parity-registry.json`
17. Current notification projections, alert popover, read-state, routing, and
    responsive tests
18. Current Active Solo domain, persistence, setup/list UI, Home attention,
    Resume/Abandon actions, and responsive tests
19. Current global color tokens, button/control variants, selected/hover/focus/
    disabled states, custom-accent resolver, forced-colors rules, and visual
    tests
20. Current Players directory form controls, filters, query ownership, list,
    and responsive tests
21. Current Stats projections, rating bucket types, History/progression/rating
    sources, charts/figures, empty/partial states, accessibility, and tests
22. Current dialog, modal, popover, menu, tooltip, disclosure, portal, focus,
    backdrop, scroll-lock, and z-index implementations
23. Current sign-in forms, callback/redirect/`returnTo` handling, Auth hydration,
    account switching, profile-name loading, Account navigation/menu, and tests
24. Every definition component/caller and Solo/COMBAT/Practice/Daily/ranked/
    unranked terminal result and answer-reveal path
25. Current fixture, browser, visual, hosted, cleanup, Preview, and reporting
    implementations

Use the repository as primary authority. Use only official browser-platform,
React/Next.js, Supabase, Vercel, and accessibility documentation for current
technical claims.

You may inspect the protected Preview read-only if secure access already
exists. Do not sign in, submit forms, start games, trigger private-answer
definition requests, or create service data during planning.

## Correct interpretation of the current baseline

Treat the v6.6 golden checkpoint as the accepted code rollback baseline while
acknowledging that the twelve owner annotations demonstrate unresolved UI and
experience defects.

Preserve unless a demonstrated regression requires a narrow change:

- game rules, scoring, evidence, answers, word authority, definitions service,
  persistence envelopes, economy, ratings, matchmaking, settlement, and
  privacy boundaries;
- multiple Active Solo sessions and their limits;
- v6.6 account lifecycle authority and opponent-data preservation;
- COMBAT GO chronological seed rows;
- existing mobile gameplay composition and centered desktop framing;
- named/custom accents and semantic evidence colors;
- Word Explorer, Players/public-profile semantics, Lobby authority, History,
  and existing notification behavior;
- Production, default branch, real users, existing visible E2E profiles,
  immutable migrations, and the locked shell.

Do not treat a visual annotation as authorization to widen answer disclosure,
invent rating data, add a migration/API/vendor, or redesign unrelated areas.

## Planning objective

Produce one decision-complete implementation plan for resolving every
ANNOT-01 through ANNOT-12 requirement in the canonical intake:

1. desktop notification status/date/time alignment;
2. a polished, aligned desktop Active Solo collection;
3. sitewide light-surface button/selected-control contrast using the existing
   Profile dark foreground as authority;
4. equal-height Players filter fields, selects, and Apply action;
5. a serious, truthful, accessible Stats visualization and layout overhaul;
6. centered, consistently and safely dismissible modal dialogs;
7. Home as the ordinary successful-sign-in destination;
8. an identity-aware Account toolbar label; and
9. a global invariant that every rendered definition names its word without
   leaking unrevealed answers.

The later separately authorized execution should proceed autonomously through
implementation, complete local acceptance, protected Preview deployment,
bounded disposable-user hosted acceptance, exact cleanup, parity/evidence
reconciliation, reporting, and a final private golden checkpoint. Do not
implement anything during this Plan-mode task.

## Required repository audit

For every ANNOT requirement, identify:

- exact route and reproduction state;
- owning component, hook/controller, domain type, query/cache authority, and
  CSS/token source;
- governing APP/GAME/ACC/MP/SUP/accessibility clauses;
- current automated and hosted evidence;
- actual root cause;
- whether the behavior is implemented correctly, defective, partial, missing,
  or only unproven;
- exact files/components/tests to retain or change;
- whether any public API, database, service, or provider change would truly be
  required.

Explicitly trace:

- the foreground cascade for primary, selected, hover, focus, disabled, and
  nested muted text on light surfaces;
- every route and reusable control that can produce light-on-light text;
- notification timestamp markup and desktop/mobile breakpoints;
- Active Solo row data, sorting, action state, and mobile/desktop layouts;
- shared field/control sizing in the Players filters;
- all durable Stats sources, exact rating bucket keys, initialized versus
  absent buckets, partial-source behavior, current figures, and available
  historical dimensions;
- every overlay primitive and which surfaces are dialogs, menus, popovers,
  tooltips, or disclosures;
- backdrop, Escape, focus, scroll-lock, z-index, pending-operation, and
  destructive-action behavior;
- successful sign-in callbacks, explicit safe destinations, verification and
  recovery routes, protected-route returns, and redirect-loop protections;
- profile-name/account-summary hydration, fallback identity, account switch,
  truncation, accessible naming, and cache isolation;
- every `WordDefinition` or equivalent caller and the reveal/terminal guard
  that permits its word.

Do not accept a generic parity row or passing screenshot as proof. Trace every
conclusion to source, contract, test behavior, or hosted evidence.

## Required functional decisions

### 1. Notifications presentation

Design a semantic row that keeps status, local date, and local time visually
separate and consistently aligned on desktop. Define responsive collapse or
stacking at narrower widths without clipping, misleading column headers, or
horizontal document overflow. Preserve read/unread styling, deterministic
event routing, polling/invalidation, and `Mark all read`.

### 2. Active Solo presentation

Design a desktop structure with explicit, consistently aligned fields for
session kind, OG/GO, word length, difficulty, accepted progress/current GO
puzzle, and Resume/Abandon actions where those fields are authorized. Resolve
compact versus table/card presentation from the actual data and route measure.
Preserve session ordering, limits, exact resume URLs, abandon semantics,
disabled/pending states, mobile behavior, and account/guest isolation.

### 3. Global light-surface contrast

Adopt the exact existing Profile dark foreground used for selected named accents
and Save Profile as the canonical foreground for light/white controls.
Centralize the rule in shared tokens/variants and remove route-specific
contradictions.

Cover:

- primary light buttons;
- selected accents and navigation;
- hover/focus/active controls;
- disabled light controls, including Active Solo Resume;
- Marketplace purchases;
- Choose-how-to-play actions;
- Lobby and form actions;
- nested descriptions/icons/muted labels;
- every named/custom accent, system light/dark, and forced colors.

Require at least 4.5:1 for ordinary text and 3:1 for large text, meaningful
icons/borders, and focus indicators. Disabled controls must remain readable and
visibly disabled. Semantic correct/present/absent/removed/warning/danger colors
must not be replaced.

### 4. Players filter rhythm

Make Player Name, Rating Lane, Minimum Rating, Maximum Rating, Sort, and Apply
the same visual height and baseline while retaining semantic labels, native
behavior, keyboard/touch targets, validation, focus rings, and graceful
responsive wrapping.

### 5. Stats overhaul

Produce a source-grounded information architecture before choosing charts.
Map all current durable and explicitly pending data, then plan useful charts
and figures that explain real relationships. At minimum resolve:

- progression and next-level movement;
- result composition and sample size;
- Solo/COMBAT, Practice/Daily, OG/GO, ranked/unranked comparisons;
- attempt distribution;
- every actual service-confirmed ranked bucket with an unambiguous Practice/
  Daily and OG/GO label, rating, games, W/L/D, provisional state, and update
  time where authorized;
- recent activity only to the granularity durable History supports.

Normalize section widths so Ranked Ratings does not occupy a narrow left strip
with unused space. Provide truthful zero, unavailable, partial, and pending
states. Do not fabricate a time series, interpolate missing values, or display
nonexistent buckets as real ratings.

Prefer accessible SVG/CSS/semantic-HTML figures with textual equivalents. If a
chart dependency is recommended, prove why existing code-native primitives are
insufficient and include bundle, license, maintenance, accessibility, and
zero-cost analysis; do not add it during planning.

All figures must be keyboard and touch accessible, printable, accent-aware,
responsive at 320–1920 widths and 200% zoom, and readable in forced colors and
reduced motion.

### 6. Overlay and dialog contract

Define a shared taxonomy and implementation contract:

- modal dialogs: centered in the viewport, close button, Escape, safe backdrop
  dismissal, focus trap/restoration, appropriate scroll lock and z-index;
- anchored menus: remain anchored to triggers with outside/Escape dismissal;
- tooltips/disclosures: retain their correct nonmodal semantics.

Apply the modal contract to Change Email, Change Password, Danger Zone actions,
and equivalent dialog-like surfaces. Do not blindly center Account/Menu
popovers or tooltips.

Define when backdrop/close/Escape is temporarily blocked or requires explicit
confirmation because a destructive or submitted operation is pending. Outside
dismissal may never perform an action, lose an authoritative success receipt,
or leave an ambiguous account state.

### 7. Successful sign-in routing

Make Home the default destination after ordinary interactive sign-in. Preserve
only repository-authorized explicit destinations, such as a safe protected
route return, when doing so is intentional and validated. Define behavior for
email verification, password recovery, expired callbacks, already-signed-in
visits, deep links, browser Back, and malicious/foreign `returnTo` values.

### 8. Account toolbar identity

Define a deterministic label priority:

1. signed-in player name;
2. bounded privacy-conscious email-derived fallback when no name is available;
3. `guest` or another concise owner-approved signed-out label.

Choose and justify a maximum visible length based on actual toolbar geometry,
then ellipsize before collision. Preserve a useful accessible name/title without
causing public identity exposure. Handle loading, profile edits, failed profile
reads, account switching, sign-out, hydration, and cross-tab changes without
showing stale data from another account.

### 9. Definition-word invariant

Create one reusable presentation contract: if a definition is rendered, the
same definition region visibly names the associated word. Apply it to every
authorized Solo and COMBAT result, Practice and Daily, OG and GO, ranked and
unranked, all terminal reasons including forfeit, and any non-game definition
surface where the component contract applies.

This is a presentation invariant, not new answer authority. No word may be
added to the DOM, accessibility tree, request, cache key, prefetch, share text,
log, or error before existing rules authorize its definition/reveal. Audit and
test both allowed display and prohibited early disclosure.

## Explicit non-goals and authority boundary

- No game-rule, answer-generation, scoring, evidence, price, reward, rating
  algorithm, matchmaking, word-list, persistence-envelope, or settlement
  change.
- No broad redesign of Word Explorer, Profile semantics, Players ranking
  semantics, COMBAT gameplay, or the shell.
- No deletion of existing E2E profiles or real data.
- No migration, new public API, Supabase function, Storage/provider change,
  paid capability, vendor, or chart dependency is currently authorized.
- No modification of the locked BRRRDLE-DEV shell.
- No merge, default-branch change, Production release, force push, stash
  inspection, or history rewrite.

If a mandatory behavior cannot be implemented with current authority, isolate
the exact minimum additive change in a separate forward-only decision packet
and make later execution stop for exact authorization. Do not propose a down
migration.

## Verification plan

Retain the complete command stack:

- `pnpm check`
- `pnpm test:domain`
- `pnpm test:browser`
- `pnpm test:e2e:fixture`
- `pnpm test:e2e:services`
- `pnpm test:visual`
- `pnpm test:acceptance:local`
- `pnpm test:acceptance`

Add targeted evidence for:

- notification status/date/time alignment and responsive collapse;
- Active Solo desktop structure, all session kinds/progress states,
  Resume/Abandon pending/disabled states, and unchanged mobile behavior;
- a route-wide contrast matrix for every light control state, named/custom
  accent, light/dark system scheme, and forced colors;
- no white-on-white or low-contrast muted descendant on any route;
- equal Players filter heights at desktop, intermediate, mobile, and 200% zoom;
- Stats source-to-figure arithmetic, all actual ranked bucket labels, zero/
  partial/pending states, textual equivalents, print, keyboard/touch, and no
  fabricated data;
- consistent widths and no stranded Ranked Ratings blank-space defect;
- centered Settings/Profile/destructive dialogs, outside/X/Escape dismissal,
  focus trap/restoration, pending-operation safeguards, and unchanged anchored
  menus/tooltips;
- ordinary sign-in to Home, safe explicit return behavior, recovery/
  verification handling, and redirect/open-redirect protections;
- account label name/guest/fallback/truncation, hydration, profile edits,
  account switching, failures, zoom, and no cross-account flash;
- every definition surface naming its word after authorized reveal;
- no unrevealed-answer definition, word, query key, prefetch, DOM/accessibility
  content, share output, screenshot, or log;
- no horizontal overflow or pairwise collision at 320, 360, 390, 412, 768,
  960, 1024, 1280, 1440, and 1920 widths and 200% zoom;
- system light/dark, forced colors, reduced motion, keyboard, mouse, touch,
  Chromium, Firefox, and WebKit;
- no serious or critical axe findings;
- no unexpected console, page, or network failures;
- exact disposable-resource registration and zero residue.

Preserve:

- 237/237 truthful functional evidence;
- 73/73 truthful multiplayer audit evidence;
- 107/107 bootstrap integrity;
- all synchronized migration identities;
- exactly three application API routes;
- Home’s no-word-bank behavior and selected-length-only loading;
- existing bundle, interaction, and hosted-performance budgets;
- Production and locked-shell isolation.

## Future execution checkpoints

Plan cohesive private commits and non-force pushes at:

1. revalidated v6.6 golden baseline and failing regressions;
2. global contrast tokens, Players filters, Notifications, and Active Solo;
3. overlay/dialog standardization;
4. Auth redirect and identity-aware Account label;
5. definition-word invariant and privacy tests;
6. source-grounded Stats overhaul;
7. complete local acceptance;
8. exact protected Preview deployment;
9. bounded disposable-user hosted acceptance and privacy probes;
10. exact cleanup and zero-residue proof;
11. parity, run-state, evidence, paired reports, and paired manual checklist;
12. final private golden checkpoint for owner review.

Rollback uses forward reverts and redeployment of the exact known-good v6.6
golden checkpoint:

`16d7a510a15ab5eaf254bc2c163f77b9059854cc`

No down migration is permitted.

## Plan-mode output

Return only one decision-complete implementation plan containing:

- verified starting state;
- honest diagnosis and root cause for ANNOT-01 through ANNOT-12;
- retained architecture and exact authority map;
- global contrast-token and control-state design;
- Notifications, Active Solo, and Players layout designs;
- source-to-visualization Stats architecture and exact chart inventory;
- overlay taxonomy and dialog behavior contract;
- sign-in redirect and Account-label state machines;
- definition-word presentation and answer-privacy invariant;
- exact retained-versus-changed file/component map;
- functional-clause and parity impact;
- test and hosted-evidence matrix;
- privacy, security, accessibility, performance, responsive, bundle, cost, and
  quota criteria;
- any required authority decision packet;
- checkpoints, Preview, cleanup, rollback, and final delivery;
- autonomy policy;
- assumptions;
- explicit stop conditions.

Resolve ordinary implementation decisions from repository authority. Ask
questions only if a genuinely material decision cannot be derived safely.

Do not implement anything. Do not modify the repository or services. Stop
after the plan for owner alignment and separate execution authorization.
