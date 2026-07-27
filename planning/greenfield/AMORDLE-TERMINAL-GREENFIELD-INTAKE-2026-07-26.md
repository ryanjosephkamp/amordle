# Amordle Terminal Greenfield Intake

Date: 2026-07-26

Status: recorded product direction for a separately planned and authorized
greenfield restart

Current application disposition: preserve as a recovery checkpoint; do not
continue its visual architecture

## 1. Decision

The current Amordle implementation is not the foundation for the next product.
Its visual concept, layout system, player-facing voice, and frontend
architecture are rejected for future development.

The next attempt is a genuine greenfield rebuild in this same private GitHub
repository. It will retain the name Amordle, the existing Vercel project, the
existing Supabase project, and the complete functional behavior of the locked
`brrrdle-dev` shell. It will not retain the current fire/ice, cyberpunk,
concept-gallery, or ornamental visual direction.

This intake records the requested destination and the workflow required to
prepare it. It does not authorize repository stripping, service cleanup,
profile deletion, migration changes, deployment, or implementation. Those
actions require a decision-complete plan and a separate execution
authorization.

## 2. Recovery boundary

Before any cleanup or new implementation, preserve the current application as
a recoverable GitHub checkpoint.

Planned recovery references:

- reviewed runtime base:
  `24711a07e25341b98e24bbb2fb8f737a620c5f40`
- preservation branch:
  `codex/pre-terminal-greenfield-golden-2026-07-26`
- immutable tag:
  `amordle-pre-terminal-greenfield-golden-2026-07-26`
- repository: `ryanjosephkamp/amordle` (private)

The checkpoint must contain the complete current source, all 45 migrations,
tests, configuration templates, and this intake. It is a rollback reference,
not an endorsement of the current product.

Later cleanup must never rewrite or delete the preservation branch or tag.
Rollback must be possible with normal Git operations, without force-pushing or
recovering from a local stash.

## 3. Functional authority

The locked functional shell is the primary behavioral reference:

- repository:
  [ryanjosephkamp/brrrdle-dev](https://github.com/ryanjosephkamp/brrrdle-dev)
- locked checkpoint:
  `062624b2fb7c8d039a2eba3aec5b059c26628a11`
- golden tag:
  `phase-58-final-functional-shell-golden-2026-07-13`
- live reference:
  [brrrdle-dev.vercel.app](https://brrrdle-dev.vercel.app)

The shell repository and deployment are permanently read-only. The greenfield
agent may inspect the locked checkpoint and live site, but it must never
commit, push, deploy, configure, delete, or otherwise mutate them.

The shell is authoritative for capabilities, rules, flows, edge cases, and
outcomes—not for frontend architecture or visual design. The next build may
port or adapt proven behavior, tests, and backend contracts, but it must not
copy the shell's visual layout.

The handoff package must turn the shell's complete behavior into a
decision-complete functional contract. That inventory must include, at
minimum:

- Solo OG and GO Daily and Practice;
- every supported word length, difficulty, Hard Mode rule, duplicate-letter
  rule, validation order, GO chain, attempt budget, continuation, consumable,
  definition, History, sharing, progression, and economy behavior;
- local and authenticated persistence, recovery, account switching, public
  profiles, privacy boundaries, settings, and notifications;
- public, ranked, private, rematch, Daily, timed, untimed, OG, and GO
  multiplayer;
- matchmaking creation, polling, cancellation, expiry, claiming,
  finalization, recovery, turns, clocks, scoring, settlement, Elo, result
  hydration, repeated opponents, and search again;
- Active, Lobby, Live, read-only spectation, participant identities, blocks,
  preferences, private requests, and rematches;
- Calendar, Marketplace, Leaderboards, Stats, Word Explorer, Definitions,
  Help, Feedback, About, Admin, PWA, offline Solo, APIs, and word-list refresh;
- legacy route compatibility and every shell edge case still required by the
  retained contracts.

No capability may be represented by a fictional production fixture, disabled
placeholder, static statistic, or interface that merely looks complete.

## 4. New product direction

### 4.1 A web application that feels like a terminal

Amordle remains a browser application hosted on Vercel. It is not a literal
terminal program.

Its interface should feel like a polished combination of a terminal user
interface and a graphical user interface:

- macOS Terminal and high-quality developer-tool polish;
- a Grok Build-like sense of speed, clarity, restraint, and directness;
- monospace-led typography and text-forward hierarchy;
- terminal prompts, commands, panels, tables, status lines, and shortcuts used
  where they improve comprehension;
- restrained color, subtle liquid-glass depth, smooth focus and transition
  behavior, and no excessive gradients, glow, shading, texture, or 3D effects;
- lightweight, precise, and professional rather than cyberpunk, robotic,
  theatrical, or ornamental.

The terminal metaphor must never make the game harder to understand. A new
player should be able to use the site without knowing a CLI.

### 4.2 Interaction model

Every important flow should support both:

- complete keyboard navigation with clear shortcuts, focus, command handling,
  and accessible announcements; and
- ordinary mouse, pointer, and touch interaction.

The virtual letter keyboard should be intentionally lightweight, responsive,
and visually consistent with the terminal system. It should retain correct
game evidence, sound, touch, physical-keyboard, disabled-state, and
accessibility behavior. It should remain modular enough for later layouts,
themes, cues, and effects without becoming a separate visual attraction.

### 4.3 Layout

Use Lichess as a layout and information-architecture reference, not a visual
copy:

- desktop navigation at the top;
- clear dropdown access to major product areas;
- a gameplay-first center with useful contextual information around it;
- dense, readable Leaderboards, Stats, History, and result surfaces;
- mobile navigation at the bottom when that produces the best reachability;
- a responsive game stage that sizes tiles, spacing, board history, status,
  and keyboard to the actual usable viewport;
- no document scrolling that separates active gameplay from the keyboard;
- controlled internal scrolling for long histories, long words, and GO
  evidence;
- strong behavior at 320, 360, 390, 412, tablet, desktop, wide desktop, and
  200% reflow.

The first greenfield implementation should establish a clean functional TUI
shell and acceptable responsive structure. A later polish pass may deepen the
visual system after all functionality is proven.

### 4.4 Voice and content

Write for human beings and a general audience.

- Avoid robotic, legalistic, self-congratulatory, or implementation-facing
  phrases.
- Do not expose internal terms such as namespace, projection, authority,
  capability boundary, durable reread, sanctioned identity, or fallback
  required in ordinary UI.
- Prefer short, specific language: what happened, what the player can do, and
  what happens next.
- Keep information rich where players benefit. Leaderboards, Stats, History,
  results, game metadata, and records should contain substantial useful data.
- Content density is welcome; awkward technical wording is not.
- Error messages must preserve context and explain the actual problem without
  blaming the player.

The implementation plan should include a copy inventory and a human-language
review gate, not merely ad hoc text cleanup at the end.

## 5. Preferred technical foundation

The user wants the next plan to evaluate and, unless a demonstrated
incompatibility exists, use:

- Next.js;
- React;
- shadcn/ui;
- modern React components;
- the Impeccable frontend skill;
- TypeScript and a component architecture suited to a reusable TUI/GUI design
  system.

The planner must research current stable versions from official primary
sources and lock exact versions. It may recommend additional free,
repository-local dependencies when they materially improve accessibility,
testing, data visualization, terminal interaction, or reliability.

No paid vendor, paid feature, purchase, or infrastructure expansion is
authorized. The agent may not buy anything or enable a billable service.

The design system should make terminal primitives reusable: window frame,
command/menu surface, prompt, status line, pane, data table, dialog, form,
notification, board, keyboard, result, and responsive navigation. Product
logic must remain independent of those visual components.

## 6. Backend and service continuity

The next application must continue using:

- the existing private GitHub repository;
- the existing Vercel project;
- the existing Supabase project;
- the retained migrations and backend capabilities unless a later plan proves
  that an additive change is necessary.

The next planning phase must verify those identities without exposing secrets.
It must distinguish:

- browser-safe configuration;
- Node-only testing/cleanup authority;
- service-role and administrative secrets;
- Preview and Production scope.

Production must remain unchanged until a separately approved release.
Greenfield development uses protected Preview deployments.

The user is willing to discard current player-profile data before the new
build, but “player profiles” needs an exact inventory before deletion:
public-profile rows, private profile rows, related preferences/settings, and
Auth users are not automatically the same scope. The cleanup plan must list
exact targets, dependencies, recovery consequences, and the service identity
proof. No profile or account deletion occurs from this intake.

## 7. Testability is a product requirement

The next application must be designed so the agent can truly exercise it, not
merely inspect code or mock happy paths.

### 7.1 Required test layers

The handoff must specify:

- pure domain and property tests for every game rule;
- repository and contract tests for every Supabase/RPC boundary;
- real-browser component tests;
- service-free routed fixture tests;
- protected hosted end-to-end tests against the actual Preview;
- multi-user tests with two and three isolated browser contexts;
- responsive visual assertions and screenshots;
- accessibility, keyboard-only, reduced-motion, forced-color, zoom, network,
  console, performance, offline, update, privacy, and cleanup gates.

Every named shell capability must map to an automated assertion or a clearly
bounded manual review item. A passing unit suite does not establish functional
parity.

### 7.2 Disposable accounts and credentials

Real sign-in, profiles, matchmaking, Leaderboards, persistence, and account
isolation must be tested with disposable accounts.

Preferred order:

1. create temporary users through a Node-only service harness;
2. register every created resource under a unique run ID;
3. drive sign-in and game flows through the real browser UI;
4. clean exact resources in dependency order;
5. delete disposable Auth users last;
6. prove zero residue.

If owner-created accounts are ever needed, credentials must be entered through
a local ignored secret mechanism or protected environment configuration.
Passwords, access tokens, service keys, and share credentials must never be
placed in chat, prompts, tracked files, command arguments, screenshots, traces,
or reports.

### 7.3 Deterministic game authority for testing

Tests need a safe way to know answers and drive exact outcomes.

The new design should provide a Node-only, run-scoped test authority that can:

- create deterministic answer sequences or inspect answers for exact
  disposable games;
- work only for registered E2E run IDs and disposable participants;
- stay unavailable to production browser code and public projections;
- avoid writing answers into screenshots, browser logs, traces, reports, or
  bundles;
- support invalid guess, duplicate scoring, Hard Mode, solve, loss, draw,
  timeout, forfeit, continuation, settlement, and GO transition scenarios.

Test-only fixtures must be injected explicitly and must be impossible to
select from a normal production route.

### 7.4 Autonomous completion standard

After the implementation plan is approved, the execution agent should continue
through ordinary implementation and debugging failures without returning
prematurely.

Completion requires:

- every functional-contract item implemented;
- local and protected hosted suites green;
- real temporary-account multiplayer and account flows;
- responsive screenshots and visual review;
- exact service cleanup with zero residue;
- an interactive protected Preview;
- a completion report and human manual checklist;
- no Production deployment or merge without separate approval.

## 8. Security priority

Functionality, reliability, testability, and usable design are the immediate
priorities. Do not make an elaborate standalone security program or broad
security scan a prerequisite for ordinary greenfield development.

Necessary safety remains non-negotiable:

- do not expose credentials, private account data, raw identifiers, active
  answers, or administrative capabilities;
- preserve existing RLS and service-role separation;
- keep test authority out of browser bundles;
- protect Preview deployments;
- perform exact cleanup;
- stop for a critical leak, destructive ambiguity, or unavoidable migration.

Deeper hardening may be planned after the functional candidate works.

## 9. Conservative handoff package

The next Plan-mode task should design, but not yet execute, a compact tracked
bootstrap package. It should contain only what the new agent needs, such as:

- a deliberately conservative starting `AGENTS.md`;
- a short constitution centered on scope, safety, autonomy, and completion;
- a complete functional contract derived from the locked shell;
- backend/service continuity and migration contracts;
- a testing and acceptance contract;
- a responsive terminal-product brief and reference manifest;
- a source-reference and bundle manifest with checksums;
- bootstrap and cleanup instructions;
- a decision ledger for unresolved choices;
- a short activation prompt for the new Codex project.

The package must explicitly retire the current visual contracts, gallery,
fire/ice concept, and frontend architecture. Those materials may remain
reachable through the golden checkpoint but must not enter the new lineage or
new agent's governing context.

The package should maximize implementation autonomy while keeping only the
boundaries that prevent destructive work, service drift, secret exposure,
Production changes, shell mutation, paid costs, and false completion.

## 10. Cleanup and new-lineage planning requirements

Repository stripping happens only after the golden checkpoint and a separately
approved cleanup plan.

The plan must:

1. classify every tracked path as retain, transform, archive-through-golden,
   or remove;
2. prove the golden branch and tag exist remotely at exact expected commits;
3. preserve the shell reference, all required migrations, safe service
   metadata, and configuration templates;
4. exclude prior concepts, screenshots, visual rules, dead source, stale
   reports, and obsolete tests from the new application lineage;
5. decide whether the new implementation begins on an orphan branch or another
   clean-history structure;
6. prevent old source or fixtures from silently satisfying new acceptance;
7. define Preview, PR, rollback, and eventual Production gates;
8. include a targeted, separately confirmed profile-data cleanup procedure;
9. avoid inspecting or relying on any Git stash;
10. stop for user alignment before deleting or mutating anything.

The planning task should ask only questions whose answers materially change
the architecture, data cleanup scope, or visual direction. The user expects
the planner to make strong evidence-based recommendations and resolve ordinary
implementation details autonomously.

## 11. Inspiration status

No new terminal, Grok Build, macOS Terminal, liquid-glass, or Lichess reference
images accompanied the message that created this intake. The next Plan-mode
task should accept those attachments when supplied, inventory them by checksum,
and use them only as visual references.

The old Concept Gallery and current-site screenshots are explicitly not
binding visual authority for the terminal rebuild.

## 12. Ordered next workflow

1. Finish and verify the remote golden checkpoint.
2. Enter Plan mode using the activation prompt supplied with the checkpoint
   handoff.
3. Read this intake and inspect the locked shell and current repository
   read-only.
4. Produce a decision-complete cleanup, bootstrap-package, service-reset, and
   new-lineage preparation plan.
5. Stop for alignment.
6. After separate authorization, execute the cleanup and create the tracked
   handoff package.
7. Open a new Codex project/task, clone the prepared repository, attach the new
   reference images, and activate greenfield implementation planning.
8. Approve the implementation plan separately.
9. Execute the functional TUI candidate autonomously, validate it end to end,
   and return only with a protected review candidate and evidence.

This sequence keeps the current game recoverable while giving the final
greenfield attempt a clean, conservative, function-first starting point.
