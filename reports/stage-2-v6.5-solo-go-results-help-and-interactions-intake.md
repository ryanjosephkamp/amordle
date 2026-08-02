# Amordle Stage 2 v6.5 — Solo GO Results, Help, and Interaction Intake

## Purpose and authority

This intake records the owner’s August 1, 2026 review of the protected v6.4
Preview and the requested scope for the next planning cycle. It is a review and
planning artifact, not implementation authorization.

The owner largely accepts v6.4 as the next protected visual and functional
baseline, subject to continued manual review and later multiplayer testing. The
new requests below do not reopen the accepted v6.4 work except where a narrow
integration or demonstrated regression requires it.

Verified baseline when this intake was prepared:

- Repository: `ryanjosephkamp/amordle` (private)
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Accepted v6.4 repository head: `8ac37bd32dfa6b45cdd7b2fd7c84f36ade57216a`
- Accepted v6.4 golden tag:
  `amordle-stage2-v6.4-solo-continuity-golden-2026-08-01`
- v6.4 application candidate: `8a530fa9e76df25b03fee057ede7ffaa952d11a0`
- v6.4 evidence checkpoint: `d41326b931d2fb8a4a354719f464fe21933842dd`
- Protected Preview:
  `https://amordle-p2478e0c6-ryanjosephkamps-projects.vercel.app`
- Preview deployment: `dpl_3mETdjizULk7DPP9g6zSHn2s92f6` (`Ready`)
- Frozen Production deployment: `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`
- Linked Supabase project: `squqdstdvbsvhagfuzgj`
- Database authority: 51 synchronized migrations, comprising the 45 immutable
  baseline migrations and six separately authorized additive migrations
- Acceptance authority: 237 functional clauses, 73 multiplayer audit clauses,
  107 immutable bootstrap files, and exactly three application HTTP interfaces

No application, database, Storage, deployment, or Production mutation is
authorized by this intake.

## Owner-accepted v6.4 baseline

The following v6.4 areas are accepted and should be preserved:

- multiple active Solo session continuity and discovery;
- route-entry freshness and completed-game review scrolling;
- mobile menu frame repair;
- selectable keyboard sounds and opt-in touch haptics;
- public profile-image URL and local-file upload support;
- named and custom accents, accent-aware keyboard and alert styling;
- centered desktop framing and accepted mobile gameplay composition;
- Profile information hierarchy, Players, public profiles, Stats containment,
  Word Explorer, and definitions;
- game rules, scoring, evidence semantics, persistence envelopes, ratings,
  matchmaking, services, privacy boundaries, and current word authority.

This acceptance does not represent completion of the owner’s extensive manual
multiplayer review. Any later demonstrated defect may be reopened through a
separate, bounded repair.

## Source screenshots and observations

The review supplied four screenshots:

1. `1-Photo-1.jpg` shows the public Profile editor and the full avatar guidance
   paragraph beneath the image URL field.
2. `2-Photo-2.jpg` highlights that the same avatar guidance consumes substantial
   vertical space on a standard-width mobile screen.
3. `3-Photo-3.jpg` shows the Account popover with `View profile` and `sign out`;
   the requested Settings shortcut belongs between those actions.
4. `4-Photo-4.jpg` shows the expanded Solo `Evidence and game tools` surface
   containing Reveal Letter, Remove Letters, and Sound controls. The screenshot
   captures the stable surface; the owner separately reports that an activated
   control disappears until subsequent keyboard input.

The Daily Solo GO completion screenshot described by the owner was no longer
available. Its requested disclosure policy is recorded from the owner’s exact
examples below and must be verified against real repository state before
implementation.

## Requested v6.5 scope

### 1. Encountered-only Solo GO solution and definition review

At the terminal result of every **Solo GO** game—Practice or Daily—show an
ordered review of every puzzle the player actually encountered:

- order entries from puzzle 1 through the terminal puzzle;
- include the solution word, definition content, Copy Word, and Search Web for
  each disclosed puzzle;
- preserve the existing overall result, copy/share, board-review, and Play Again
  actions;
- present repeated definition content compactly and accessibly on mobile and
  desktop without trapping scrolling or producing excessive layout noise.

The disclosure boundary is exact:

- **Win:** the terminal puzzle is the final puzzle, so all chain solutions and
  definitions are shown in order.
- **Loss on puzzle N:** show solutions and definitions for puzzles 1 through N,
  inclusive. This includes solved prior puzzles and the current puzzle on which
  the game ended.
- **Never disclose puzzles N+1 onward:** no word, definition request, definition
  cache key, DOM text, accessible label, share output, log, or prefetch may
  reveal an unreached future solution.

Examples:

- A five-puzzle chain lost on puzzle 2 shows exactly puzzle 1 and puzzle 2.
- A five-puzzle chain lost on puzzle 5 shows all five.
- A completed five-, seven-, or ten-puzzle chain shows the entire encountered
  chain.

This policy applies only to Solo GO. It does not change Solo OG results or
COMBAT GO. It does not change answers, game progression, scoring, attempts,
continuations, Daily authority, rewards, or definition lookup authority.

Current repository observation: the Solo result renders `WordDefinition` only
for `session.answers[session.puzzleIndex]`, while `GameSession` retains the
answer chain and current `puzzleIndex`. Planning must define one pure helper
that returns only the allowed encountered prefix and test it exhaustively.
Future answers must never be passed to definition components.

### 2. Collapsed avatar-upload guidance

Keep the avatar limits and privacy guidance, but remove the full paragraph from
the default Profile layout. Replace it with a concise, accessible help trigger
adjacent to the image URL/upload controls.

The complete guidance remains available on demand through a tooltip, popover,
or disclosure that:

- works by click/tap and keyboard, with hover as an enhancement rather than the
  only access method;
- has a clear accessible name and relationship to both URL and file upload;
- closes on Escape and outside interaction and restores focus;
- fits 320–412 px mobile widths without clipping or horizontal overflow;
- does not hide validation or upload errors;
- preserves the current 6 MiB, 4096×4096, accepted-format, public-image, and
  metadata disclosures without weakening them.

Current repository observation: the guidance is an always-visible
`p.field-help` in `src/features/account/profile-editor.tsx`.

### 3. Account popover Settings shortcut and copy consistency

Add a Settings link between View Profile and Sign Out in the Account popover.
Use consistent player-facing capitalization:

- `View Profile`
- `Open Settings`
- `Sign Out`

The new action routes to `/settings`, closes the popover, retains menu semantics,
and preserves focus, Escape, outside-dismissal, touch, and keyboard behavior.
The existing Settings entry in the general Menu remains.

Current repository observation: `src/components/account-menu.tsx` currently
contains only `View profile` and `Sign out` after the account summary.

### 4. Opt-in haptics for genuine button activation

When the existing Touch Haptics setting is enabled and the browser supports
vibration, extend the restrained feedback beyond game keyboard keys to genuine
pointer/touch activation of application buttons and button-like controls.

Planning must define a centralized event boundary that:

- produces at most one short vibration for one user activation;
- does not vibrate for disabled controls, prevented actions, rerenders,
  reconciliation, programmatic `.click()`, route hydration, or test setup;
- does not add vibration to physical-keyboard navigation unless repository and
  accessibility authority explicitly justify it;
- respects reduced-effects/system reduced-motion behavior and the existing
  saved guest/account preference;
- no-ops silently on unsupported browsers, desktop pointer input, denied APIs,
  and devices without vibration;
- covers native buttons, role/button controls, button-styled links, menu and
  popover actions, and primary/mobile navigation controls so every surface a
  player reasonably experiences as a button is consistent;
- does not vibrate for ordinary inline prose links, text inputs, tiles, or
  passive surfaces unless the later repository audit proves they are intentional
  button controls;
- does not regress touch latency, keyboard sound playback, or double-fire on
  pointer/click event pairs.

Current repository observation: haptic invocation is localized to
`GameKeyboard` touch `pointerdown` handlers through
`src/application/keyboard-feedback.ts`. The requested expansion should reuse a
single bounded utility rather than scatter handlers across every component.

### 5. Help information architecture and code-native teaching aids

Preserve the TUI visual system and the existing accurate prose, but improve the
Help page’s hierarchy:

- keep the current OG/scoring tile example as the quality reference;
- keep the COMBAT shared-board example;
- visually separate general rules/tutorial material from the advanced
  keyboard-only material;
- make `Mouse-free mode — for keyboard diehards` collapsed by default with a
  clear accessible disclosure control;
- add restrained, responsive teaching aids for sections that benefit from a
  visual explanation.

Required visual teaching scopes:

1. **GO chains:** demonstrate solving one puzzle, carrying seeded evidence, and
   advancing into a later puzzle without revealing a real active answer.
2. **Practice and Daily:** clarify selectable Practice configuration versus
   date-bound Daily play, including Solo-local-date and COMBAT-UTC distinctions
   where useful.
3. **Hard Mode:** demonstrate rejection for moving a proven green letter,
   omitting required proven-positive multiplicity, and using a letter known only
   as absent, followed by an accepted compatible guess. Do not invent a yellow
   position ban.
4. **Coins and tools:** demonstrate Reveal One Letter, Remove Incorrect Letters,
   past Daily unlock, and a Practice continuation/extra attempt without
   implying free use or changing authoritative prices.
5. **Access and navigation:** teach Tab, Shift+Tab, Enter/Space, Escape, and the
   existing direct navigation shortcuts with code-native key visuals.
6. **Privacy:** add a visual only if it materially explains public versus private
   information or spectator boundaries; omit it if it would be decorative.

Preferred implementation qualities:

- code-native React/CSS sequences or compact declarative diagrams rather than
  screenshots of real games or large autoplaying media assets;
- silent, self-running demonstrations only when motion materially improves
  understanding;
- Pause/Play where needed, no audio, no network fetch, no active/private answer,
  no raw identity, and no test-player data;
- static equivalent content under `prefers-reduced-motion`, forced colors, print,
  and assistive technology;
- responsive containment at 320–1920 px and 200% zoom;
- no new runtime vendor, paid tool, Image Gen requirement, or Remotion dependency
  unless a later evidence-backed plan proves it necessary and separately
  authorizes it.

Current repository observation: Help is a static server component in
`src/app/help/page.tsx`. Only OG/scoring and COMBAT currently have visual
examples.

### 6. Focus Mode authority audit

The Help page currently says that Focus Mode removes surrounding navigation.
The owner could not find a visible way to enter it and prefers removing the
reference—and possibly the feature—if it is not a real, useful player feature.

Do not delete it based on the mobile observation alone. Current source still
implements `?focus=1` for Solo and COMBAT game routes and applies `is-focus`
shell/CSS behavior. The next plan must trace:

- every route, link, shortcut, test, contract clause, and accessibility behavior
  that can enter or leave Focus Mode;
- whether the state is discoverable, complete, and required;
- browser Back behavior and a guaranteed exit path;
- whether removal would simplify Help without breaking an accepted contract.

Recommend one decision: either make the existing feature deliberately
discoverable and teach it, or remove it completely with exact contract/test
reconciliation. Do not leave a hidden, undocumented half-feature.

### 7. Immediate, stable game-tool control feedback

Repair the owner-reported transient disappearance of the Solo Practice controls
for Reveal Letter, Remove Letters, and Sound On/Off.

Required behavior:

- Sound toggles immediately between `Sound On` and `Sound Off` and remains
  available without requiring a letter input.
- Reveal and Remove remain stable after activation, update their authoritative
  counts immediately after success, and can be activated again when inventory
  and game rules permit.
- A pending state prevents duplicate activation and duplicate consumable spend
  while preserving the control’s occupied layout.
- Success, no-op, unavailable-inventory, and failure/retry states receive concise
  visible and accessible feedback.
- Retrying reuses the same idempotency identity where current economy authority
  requires it.
- The `Evidence and game tools` disclosure stays open, and the board/keyboard do
  not shift when a control changes state.
- Sound persistence remains correct for guest and signed-in players.

Current repository observation: all three buttons are rendered in
`src/features/solo/solo-game.tsx`; Reveal and Remove perform asynchronous
economy operations, and Sound saves asynchronously. The exact disappearance
cause remains unproven and must be reproduced before choosing the fix.

## Retained boundaries and non-goals

- Do not redesign the accepted shell, Profile, game board, keyboard, active Solo,
  Stats, Word Explorer, Players, public profiles, COMBAT, or desktop/mobile frame.
- Do not change Solo or COMBAT rules, answers, word lists, scoring, evidence,
  prices, economy, rewards, ratings, matchmaking, persistence envelopes, or
  settlement behavior.
- Do not extend the Solo GO disclosure policy to COMBAT GO or OG.
- Do not expose unreached Daily/Practice answers through UI, definition requests,
  caches, share strings, logs, accessibility content, tests, or previews.
- Do not delete existing E2E profiles or any real account, avatar, game, or
  service data.
- Do not add a database migration, Storage mutation, public HTTP interface,
  provider configuration, paid dependency, or vendor without a separately
  justified and authorized decision packet.
- Do not modify the default branch, merge, release Production, alter the locked
  BRRRDLE-DEV shell, inspect Git stash, force-push, or rewrite history.

## Planning questions to resolve from repository authority

The next read-only plan must resolve, rather than defer, these ordinary design
and implementation questions:

1. the pure encountered-answer selector and exact terminal indices for win,
   revealed loss, Daily loss, continuation, reload, and legacy sessions;
2. whether definition lookups should load sequentially, concurrently with a
   bound, or on disclosure, while never requesting future words;
3. the compact result layout and heading hierarchy for 5-, 7-, and 10-word
   chains on mobile;
4. the accessible avatar-help primitive and its interaction model;
5. the centralized haptic activation boundary and exact eligible control set;
6. whether Help demonstrations are static diagrams, CSS state sequences, or a
   small reusable teaching component, including reduced-motion behavior;
7. the retain-and-expose versus fully-remove Focus Mode decision;
8. the root cause of game-tool disappearance and the smallest stable repair;
9. every affected functional clause, parity row, browser test, fixture journey,
   visual scenario, hosted check, and cleanup path.

## Acceptance direction for later authorized execution

Later implementation should prove at minimum:

- Solo GO win and loss disclosure at every terminal puzzle for 5, 7, and 10
  Practice chains and five-puzzle Daily chains;
- zero unreached-answer definition requests or rendered/accessibility leakage;
- current Solo OG and COMBAT result behavior unchanged;
- Profile avatar guidance hidden by default but fully accessible by mouse,
  keyboard, and touch;
- Account menu order, capitalization, routing, dismissal, and focus restoration;
- exactly one eligible haptic pulse per supported touch activation, with clean
  disabled, programmatic, reduced-effects, and unsupported behavior;
- readable Help visuals and advanced disclosure in light/dark, forced colors,
  reduced motion, mobile, desktop, and 200% zoom;
- stable, repeatable game-tool activation with idempotent economy operations and
  no board/keyboard layout shift;
- no new HTTP interface, no answer/private-data exposure, no serious or critical
  accessibility finding, no horizontal overflow, and no unexpected console,
  page, or network error;
- the complete existing local and protected hosted acceptance stack, truthful
  parity reconciliation, exact disposable-resource cleanup, paired completion
  report/checklist, and a final private golden checkpoint.

## Next authorized action

The next action is a read-only Plan-mode audit and decision-complete plan grounded
in this intake, the repository, current contracts, and current protected Preview.
Implementation, service mutation, deployment, merge, and Production release
remain unauthorized until separately requested.
