# Amordle Stage 2 v6.5 — Solo GO Results, Help, and Interaction Polish

## Outcome

Amordle v6.5 is review-ready on a protected Preview. Solo GO results disclose
only encountered solutions, avatar guidance is compact and accessible, Account
navigation is consistent, touch haptics cover genuine button surfaces, Help has
code-native teaching aids, Focus Mode is documented and discoverable, and Solo
game tools update without disappearing or shifting the game.

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Intake checkpoint: `79f0e89dbfcd0c3b9c50e68e56c80bf2e260ffd0`
- Application candidate: `7716ba72afdbb54ba9152a69f3e90bf205e4b20d`
- Acceptance evidence checkpoint: `2cc32ba966102d31bd7f1357dd15f63824f9748e`
- Deployment: `dpl_F98YqGocuoGPMM9KWYXqkMX4FybD`
- Protected Preview: <https://amordle-h4q2k6xo0-ryanjosephkamps-projects.vercel.app>
- Hosted run: `e2e_20260802T013849885Z_7716ba72_0d863be5`
- Planned golden tag: `amordle-stage2-v6.5-solo-go-results-help-interactions-golden-2026-08-01`
- Status: ready for owner review; not merged and not released to Production.

No database migration, Storage mutation, provider-setting change, dependency,
media asset, or new HTTP interface was required.

## Delivered experience

### Encountered-only Solo GO review

- One pure, fail-closed selector determines the terminal prefix that may be
  disclosed. A win reveals puzzles 1 through the final puzzle; a loss on puzzle
  N reveals only puzzles 1 through N inclusive.
- The selector validates GO mode, terminal state, supported 5/7/10 chain sizes,
  answer length and uniqueness, puzzle bounds, solved prior rows, and final-win
  evidence. Contradictory, malformed, legacy, active, or OG state yields no
  multi-answer review.
- Practice losses require the current answer to have been authoritatively
  revealed. Daily terminal losses may disclose the reached puzzle but never a
  later puzzle.
- Each encountered block contains its sequence number, solution, definition,
  Copy Word, and Search Web. Only two definition lookups run concurrently, and
  later encountered entries unlock as earlier requests settle.
- Unreached answers are never passed to the definition component, query cache,
  accessible tree, share string, log, or render path. Solo OG and COMBAT result
  behavior remains unchanged.

### Profile and Account polish

- The technical avatar-upload guidance is closed by default behind an
  accessible `Profile image help` control. It supports click, touch, keyboard,
  Escape, outside dismissal, focus restoration, and narrow mobile containment.
- The complete existing guidance remains available: public HTTPS URL support;
  PNG, JPEG, WebP, and animated GIF; 6 MiB; 4096×4096 and the existing megapixel
  cap; public-image notice; still-image metadata removal; and possible GIF
  metadata retention.
- The Account popover now reads, in order: `View Profile`, `Open Settings`, and
  `Sign Out`. Existing Profile and Settings entries in the general Menu remain.

### Central touch haptics

- One AppShell event boundary handles trusted touch-origin activation for
  enabled native buttons, role/button and menu controls, summaries, primary
  navigation, and button-styled links.
- Passive content, ordinary prose links, disabled controls, prevented actions,
  programmatic clicks, mouse clicks, physical-keyboard activation, rerenders,
  hydration, and automated tests do not vibrate.
- Pointer/click deduplication produces one pulse per activation. Reduced
  effects and unsupported browsers remain silent no-ops. Guest and account
  preference ownership is preserved.
- The GameKeyboard-specific haptic path was removed so no key can double-pulse.
  Keyboard sounds are unchanged.

### Help and Focus Mode

- Help now distinguishes core tutorials from the advanced mouse-free manual.
  The advanced section is a semantic disclosure collapsed by default.
- Compact React/CSS teaching aids cover GO chain progression, Practice versus
  Daily, Hard Mode constraints, Coins and Tools with authoritative prices,
  Access and Navigation, and public/private data boundaries.
- The aids contain no active answer, private data, network media, Remotion,
  generated video, or new runtime dependency. They remain readable in reduced
  motion, forced colors, print, mobile layouts, and at 200% zoom.
- Focus Mode was retained because it is an existing contractual application
  behavior. Games now expose `Enter Focus Mode` from More; the focus rail keeps
  a guaranteed `Exit Focus Mode`, alerts, and Account path. Existing query
  parameters, controller identity, browser Back behavior, and keyboard routes
  are preserved.

### Stable Solo game tools

- Sound changes label and state immediately and remains visible.
- Reveal Letter and Remove Letters keep their layout while pending, announce
  status, update counts after authoritative success, and allow sequential use
  while rules and inventory permit.
- Tool identities are independent and stable for idempotent retries. Duplicate
  activation cannot duplicate spending or game revisions.
- The Evidence and game tools disclosure remains open. Success, no-op,
  unavailable, pending, and failure states do not require a keyboard input to
  restore a control and do not move the board or keyboard.

## Acceptance receipts

The complete local stack passed for the exact application candidate:

- `pnpm check`
- `pnpm test:domain`: 109 passed
- `pnpm test:browser`: 20 passed
- `pnpm test:e2e:fixture`: 19 passed across Chromium, Firefox, and WebKit
- `pnpm test:visual`: 11 passed
- `pnpm test:acceptance:local`: passed

The complete hosted command `pnpm test:acceptance` passed against the exact
protected Preview candidate:

- 19 fixture journeys across Chromium, Firefox, and WebKit;
- 2 serial real-service journeys using disposable accounts;
- 11 visual and responsive journeys;
- 237/237 functional clauses acceptance-verified;
- 73/73 multiplayer audit clauses remain proven.

Targeted tests additionally prove all 5/7/10 Practice wins, every five-puzzle
Daily loss position, Practice answer reveal, malformed-state fail-closure,
future-answer definition privacy, avatar disclosure behavior, haptic eligibility
and exclusions, Focus entry/exit, exact Account order, stable repeated tool use,
and unchanged OG/COMBAT boundaries.

Invariant receipts:

- bootstrap: 107/107;
- migrations: 45/45 immutable plus 6/6 authorized additive (51 synchronized);
- word assets: 34/34 and 6,097,886 deployment bytes;
- HTTP interfaces: exactly 3;
- Home bundle: 191,258 B compressed JavaScript and 23,012 B CSS;
- gameplay bundle: 197,126 B compressed JavaScript and 27,499 B CSS;
- Home requests no word bank; gameplay and Word Explorer load only the selected
  length.

## Hosted regression and cleanup

Run `e2e_20260802T013849885Z_7716ba72_0d863be5` proved the unchanged hosted
account, public-community, avatar, accent, definition, Solo completion, History,
notification, public Practice, spectator, ranked Practice, and all four Daily
COMBAT authorities. The Account popover test exercised the new Settings route
through visible player controls.

Cleanup completed on attempt 1:

- 1 disposable avatar object removed;
- 25 disposable accent-preset rows removed;
- 3 disposable Auth users removed;
- 7 games, 3 ranked Practice queue records, 3 ranked Daily queue records, 1
  private request, and 1 rematch request removed;
- every dependent game, action, result, authority, reservation, rating,
  History, progression, economy, profile, preference, preset, Storage, and Auth
  residue probe returned zero.

Status: `zero-residue`.

## Parity reconciliation

The parity registry remains 237/237 verified. No requirement status was promoted
or weakened. v6.5 adds more specific automated evidence under the existing GAME
result/definition, APP interaction/accessibility, ACC feedback/profile, and SUP
Help obligations. The 73-clause multiplayer audit remains unchanged and green.

## Preserved boundaries and rollback

- Production remains Ready at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- The private default branch, real players, existing visible E2E profiles,
  migrations, Storage authority, Vercel project settings, word authority, Word
  Explorer, game rules, scoring, prices, economy, ratings, matchmaking, and the
  locked BRRRDLE-DEV shell remain unchanged.
- No merge, Production release, default-branch change, force push, paid service,
  dependency, generated media, or down migration occurred.
- Rollback is a forward revert and redeployment of intake checkpoint
  `79f0e89dbfcd0c3b9c50e68e56c80bf2e260ffd0` or application rollback point
  `8a530fa9e76df25b03fee057ede7ffaa952d11a0`.

## Manual review gate

Review the protected Preview with the paired checklist. Any merge or Production
release requires separate authorization.
