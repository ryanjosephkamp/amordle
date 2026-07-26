# Amordle “Lichess of Wordle” Improvement Brief

- Date: 2026-07-26
- Repository checkpoint reviewed: `94c0d7df6a211c39f6c5480212fdbace94896a93`
- Branch reviewed: `codex/shell-functional-parity`

## 1. Purpose and authority

This brief converts the user’s 2026-07-26 written feedback and all 25 annotated
screenshots under `.codex-internal/inspiration/` into one traceable product
backlog. It also records the initial code-level diagnosis and the recommended
delivery sequence.

Authority, highest first:

1. The current user request and annotations.
2. `PRODUCT.md`.
3. The Amordle constitution and functional, backend/services, testing/acceptance,
   privacy, cleanup, and Concept Gallery contracts.
4. The current Amordle implementation.
5. The locked `brrrdle-dev` shell as read-only functional behavior evidence.
6. Lichess and React Spectrum as inspiration and implementation references, not
   copy targets.

The screenshots are private design evidence. They must not be shipped, embedded
in the public build, or treated as fixture truth.

## 2. Desired outcome

The work will proceed in two deliberately separate parts.

### Part 1 — bugs, wording, and layout

Repair current functionality and presentation without attempting the complete
visual redesign. Part 1 must end with a stable, real-service-tested candidate in
which:

- two compatible accounts can pair in Ranked Daily;
- search state is visually stable and never flashes;
- rejected actions never show false turns or technical error copy;
- COMBAT lifecycle, history, tabs, profiles, and result surfaces reflect durable
  state correctly;
- gameplay uses the available viewport and keeps the relevant board state and
  keyboard usable;
- player-facing language sounds natural;
- every issue identified in the “fixes” screenshots has an explicit disposition.

### Part 2 — professional “Lichess of Wordle” redesign

After Part 1 is green, redesign the product around Lichess-like product qualities:
immediate play, strong competitive identity, dense but readable information,
variant-aware ratings and leaderboards, useful profiles and statistics, and a
gameplay-first composition.

This is not permission to copy Lichess’s visual assets, source code, information
verbatim, or chess-specific metaphors. Amordle keeps its background, graphite
ledger, fire/ice identity, word-game semantics, privacy boundaries, and working
core behavior.

## 3. Confirmed Ranked Daily diagnosis

### 3.1 Two accounts cannot pair

The current UI creates this key:

```text
amordle-ranked-daily:<UTC date>:<mode>:<hard mode>
```

It does not include an account-specific operation identity. Consequently, two
different accounts entering the same lane submit the same globally unique
`multiplayer_matchmaking_queue.idempotency_key`.

The retained `create_ranked_async_matchmaking_request_v2` implementation rejects
the second account because that key already belongs to the first account. The
second request therefore never reaches a compatible queued state, so matching
cannot occur.

The database already supplies an account-scoped default key when the caller omits
the optional key. The current application defeats that protection by supplying a
cross-account key.

**Recommended rough fix:** introduce a versioned, account-scoped Ranked Daily
search intent. Its stable operation ID belongs to one account namespace, UTC
date, mode, and Hard Mode choice. Pass a unique opaque key—or deliberately use
the server’s account-scoped default—while preserving same-account retry
idempotency. Clear it only after authoritative terminal, cancellation, expiry, or
successful game handoff. Do not expose raw Auth IDs in the DOM, logs, storage
keys visible to other accounts, or reports.

Required regression proof:

- two compatible disposable accounts enter through the real UI and pair;
- same-account double activation produces one request;
- two accounts never collide;
- cancelled/expired searches can restart;
- account switching cannot adopt the previous account’s request;
- queue, game, result, rating, notification, and Auth cleanup leaves zero residue.

### 3.2 Queue controls flash

The Ranked Daily claim loop runs about every 750 ms and toggles the page-wide
`busy` flag before and after each background claim. `DailyPanel` uses that same
flag to disable both “Create unranked Daily lobby” and “Cancel search.” The
buttons therefore repeatedly switch enabled/disabled appearance as polling runs.

The same pattern exists in Ranked Practice and must be audited across every
polling/reconciliation path.

**Recommended rough fix:** separate foreground mutation state from background
reconciliation:

- model the search lifecycle explicitly (`idle`, `creating`, `searching`,
  `matching`, `finalizing`, `cancelling`, `failed`);
- keep unrelated controls visually stable during background polling;
- show one non-layout-shifting searching indicator and concise status;
- disable Cancel only while its own cancellation mutation is in flight;
- coalesce repeated status announcements so screen readers are not spammed;
- provide a static reduced-motion equivalent;
- forbid opacity, visibility, label, width, or disabled-state flashing caused by
  polling anywhere in the application.

## 4. Complete annotated-fixes ledger

Every image in `.codex-internal/inspiration/fixes/` was reviewed at its original
resolution.

| Evidence     | User requirement                                                                                                                                               | Part 1 disposition and rough recommendation                                                                                                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.09.54 PM` | Desktop COMBAT shows only three of six empty starting rows at 100% zoom.                                                                                       | Render the full base capacity of six shared rows in the gameplay viewport. Size the board from available height rather than letting fixed tiles push controls below the fold.                                                                                                                                                                     |
| `1.12.55 PM` | The latest multiplayer guess can move out of view.                                                                                                             | Give the move region controlled internal scrolling. Auto-scroll only enough to keep the newest accepted row and keyboard visible after a committed move, while preserving manual access to earlier current-puzzle rows.                                                                                                                           |
| `1.16.22 PM` | “Move accepted by the server…” and the long capability disclosure are irrelevant technical UI.                                                                 | Replace the primary status with concise human feedback such as “Guess accepted.” Move durable-authority/privacy explanation to Help or a compact contextual disclosure.                                                                                                                                                                           |
| `1.20.15 PM` | Invalid guesses do not explain why, briefly make it appear to be the rival’s turn, and show a technical save error.                                            | Preserve the local draft, visible turn, and board until the backend accepts. Map rule errors to actionable copy such as “Not in the word list” or the exact Hard Mode requirement. Reconcile without an optimistic false-turn flash.                                                                                                              |
| `1.23.20 PM` | “Review trusted result” is robotic.                                                                                                                            | Use “Review results.” Rewrite nearby terminal copy around the player’s outcome and next action.                                                                                                                                                                                                                                                   |
| `1.30.29 PM` | Results are barren and omit the exact variant; loser score should be red; players should link to profiles; definitions and useful postgame actions are needed. | Add a complete variant label (ranked/unranked, Daily/Practice/private, OG/GO, length, difficulty, clock/Hard Mode where relevant), winner/draw/loss treatment independent of color, sanctioned profile links, answer definition/fallback, rating delta when applicable, rematch/search-again/history/share/back actions, and compact match facts. |
| `1.33.51 PM` | Completed Unranked Daily OG is missing from History.                                                                                                           | Trace terminal finalization and history projection ownership. Record the completed lane exactly once, distinguish its variant, and prove persistence across reload/account contexts.                                                                                                                                                              |
| `1.35.55 PM` | Leaderboards are too minimal, small, and poorly organized.                                                                                                     | Part 1: fix readability, typography, loading/empty/error states, clickable identities, and real data correctness. Reserve the full multi-column, multi-variant redesign for Part 2.                                                                                                                                                               |
| `1.38.03 PM` | Stats are sparse and need meaningful interactive graphs.                                                                                                       | Part 1: remove placeholders and verify accurate metrics. Define the graph-ready data contract. Implement the substantial interactive visualization system in Part 2.                                                                                                                                                                              |
| `1.39.59 PM` | Definition fallback language is robotic.                                                                                                                       | Use direct copy: “No definition is available for this word. Search the web to learn more.” Keep an explicit user-initiated external search.                                                                                                                                                                                                       |
| `1.43.20 PM` | Verify that Word Explorer contains all sanctioned words, not only a 5-letter subset; support length sorting/filtering without exposing answers.                | Audit the catalog and count by length/difficulty/source. Add length filter, search, sort, pagination/virtualization, and safe definition access. Never classify active answers or expose private answer authority.                                                                                                                                |
| `1.45.04 PM` | Definitions unexpectedly defaults to “crane” and duplicates Word Explorer.                                                                                     | Stop presenting an arbitrary default word. Consolidate definition lookup into Word Explorer in the long-term information architecture; Part 1 may redirect or turn Definitions into an intentional search entry without losing legacy deep links.                                                                                                 |
| `1.47.36 PM` | Settings is robotic, small, and wastes width.                                                                                                                  | Rewrite labels/help text, group related settings, use accessible controls, improve responsive width and typography, and keep irreversible reset operations explicit. Full Spectrum-based form redesign belongs to Part 2.                                                                                                                         |
| `1.50.34 PM` | Top account control says “ACCOUNT” instead of the signed-in profile name.                                                                                      | Show the sanctioned display name with a sensible private/fallback label, maintain compact mobile behavior, and link to the correct owner/account menu without exposing raw identity.                                                                                                                                                              |
| `1.51.44 PM` | Play page looks basic; “identity namespace” is technical and irrelevant.                                                                                       | Replace technical empty-state language with a player action. Improve information hierarchy and attention counts in Part 1; comprehensively redesign discovery/play entry in Part 2.                                                                                                                                                               |
| `1.54.05 PM` | Desktop Solo has excessive side rails and whitespace, shrinking the board and keyboard.                                                                        | Make gameplay the dominant column. Collapse or move secondary information, use contextual disclosures, and establish viewport-aware max widths that enlarge the board and keyboard without harming long-word containment.                                                                                                                         |
| `1.56.19 PM` | Active COMBAT uses “safe summary” and a “capability boundary” panel.                                                                                           | Translate to player-centered status/actions. Retain enforcement in code and place privacy detail in Help/contextual information rather than a permanent developer-facing panel.                                                                                                                                                                   |
| `1.59.12 PM` | A cancelled game still appears as Active.                                                                                                                      | Fix terminal/cancelled query filtering and invalidation. Remove it immediately after confirmed cancellation, reconcile on reload/focus, and ensure it cannot resurrect from stale cache.                                                                                                                                                          |
| `2.00.10 PM` | Lobby rows omit the creator’s identity.                                                                                                                        | Include sanctioned creator name/avatar, rating/variant context where approved, and a link to the public profile. Preserve private-profile fallback and raw-ID privacy.                                                                                                                                                                            |
| `2.01.52 PM` | The Play page “Active (1)” tab/button does not work.                                                                                                           | Repair its route/action contract, attention count, keyboard semantics, focus restoration, deep-link/reload behavior, and empty state. Add a browser-route regression test.                                                                                                                                                                        |

## 5. Cross-cutting Part 1 requirements

### Functional and state integrity

- The UI must distinguish foreground mutations from background polling.
- No rejected command may optimistically alter authoritative turn, move, score,
  attempt, clock, result, or history state.
- Active/Lobby/History attention counts and lists must derive from the same
  durable lifecycle definitions.
- Player identity must come from sanctioned profile projections and degrade
  safely for private/unavailable profiles.
- Technical failures should retain a stable layout and provide a retry when
  retry is safe.

### Wording

Create a player-facing language pass across all primary routes. Ban unexplained
implementation terms including:

- projection;
- namespace;
- capability boundary;
- safe summary;
- authoritative command;
- trusted result;
- backend configured.

These terms may remain in internal logs, tests, diagnostics, and Admin surfaces
when technically appropriate.

User-facing status should answer one of:

1. What happened?
2. What can I do now?
3. If blocked, how do I recover?

### Layout

- Gameplay owns the largest useful region.
- The board and keyboard must remain mutually usable at required desktop and
  mobile sizes; long histories scroll internally.
- Controls must not shift, flash, overlap, or disappear during polling.
- Desktop must use width purposefully instead of preserving large decorative
  side voids.
- Mobile must preserve 44 px targets, safe areas, bottom navigation, visible
  status, and one coherent scroll owner.
- Validate 320, 360, 390, 412, 768, 960, 1440, and 1920 widths plus 200% zoom.

### Accessibility

- Stable live regions: background polling must not announce every cycle.
- Clear error association and focus retention after rejected guesses.
- Full touch, pointer, physical-keyboard, and assistive parity.
- Reduced-motion search indicator.
- Forced-color and non-color status distinctions.
- No keyboard or focus trap regression from internally scrollable boards.

## 6. Lichess inspiration ledger

Every image in `.codex-internal/inspiration/lichess_inspiration/` was reviewed.

| Evidence                                              | Useful quality to adapt                                                                                | Amordle application                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2.09.33 PM` — `https://lichess.org/player`           | Dense multi-column leaderboards grouped by meaningful variants, plus visible online/community context. | Variant-aware OG/GO, Daily/Practice, timed/untimed, and ranked categories; readable player rows; public identity; useful rating/activity context. Avoid a chess-specific facsimile. |
| `2.11.04 PM` — `https://lichess.org/fide?community=1` | Searchable, information-dense player table with avatars, names, and comparable columns.                | A responsive player/leaderboard table with search, filters, sortable approved metrics, compact mobile disclosures, and clear profile navigation.                                    |
| `2.11.54 PM` — Lichess player profile                 | Strong identity header, photo/metadata, rating cards, and recent activity.                             | Public Amordle profiles with sanctioned avatar/name/bio, variant ratings, records, recent public games, and shareable identity—never private account data.                          |
| `2.12.47 PM` — Lichess rating history                 | Interactive time-series context makes statistics meaningful.                                           | Rating, performance, streak, solve-rate, attempt distribution, and activity histories with accessible summaries and real-data provenance.                                           |
| `2.14.29 PM` — Lichess gameplay                       | The game object dominates; status and controls sit close to it; primary navigation is compact.         | Board-first Solo/COMBAT layouts, adjacent status/clock/player identity, compact top-level navigation on desktop, and fewer permanent low-value rails.                               |

## 7. Part 2 design and technology recommendation

### Product architecture

The redesign should organize the application around five durable user jobs:

1. Play immediately.
2. Find or follow a rival.
3. Resume an active game.
4. Understand a result and improve.
5. Build and inspect competitive identity.

Before route-by-route implementation, Part 2 should create:

- an approved information architecture;
- a responsive navigation model;
- design tokens and a documented Amordle component grammar;
- early interactive proofs for gameplay, Home/Play, leaderboard, and profile;
- side-by-side desktop/mobile comparisons against the Concept Gallery and
  Lichess inspiration qualities;
- a migration map that keeps every functional route live while surfaces are
  replaced incrementally.

### React Spectrum

Adobe’s current React Spectrum 2 documentation supports Vite and React Router and
provides accessible components for tabs, tables, forms, dialogs, menus, search,
status, toasts, profiles, responsive layouts, touch, reduced motion, and high
contrast. It is suitable for Amordle’s professional application layer.

Recommended boundary:

- **Adopt Spectrum 2 selectively** for application chrome and data-heavy routes:
  navigation, forms, settings, filters, tables, dialogs, menus, disclosures,
  search, status, toasts, profile metadata, and leaderboard/stat scaffolding.
- **Retain bespoke React/React Aria components** for the board, tiles, modular
  keyboard, clocks, gameplay gestures, fire/ice atmosphere, and specialized
  charts where Spectrum would erase game identity.
- Use Amordle tokens and restrained geometry; do not apply Adobe’s signature
  visual theme wholesale.
- Prototype and measure before dependency lock: bundle size, initial route
  chunks, CSS, interaction latency, reduced motion, forced colors, and 200% zoom.
- Avoid a single high-risk “rewrite.” Migrate coherent route families behind
  functional and visual gates.

Primary sources:

- [React Spectrum](https://react-spectrum.adobe.com/index.html)
- [React Spectrum getting started](https://react-spectrum.adobe.com/getting-started)
- [Adobe React Spectrum repository](https://github.com/adobe/react-spectrum)
- [Lichess source repository](https://github.com/lichess-org/lila)

## 8. Verification strategy for Part 1

The next decision-complete plan must require:

- named unit/integration tests for the Ranked Daily account-scoping defect;
- a real protected-Preview E2E in two isolated signed-in contexts that pairs,
  finalizes, enters the game, and cleans up;
- same-account double-click/reload/retry and two-account collision tests;
- a search-state browser test proving button attributes, dimensions, labels, and
  visibility remain stable across multiple polling cycles;
- an audit of Ranked Practice and every other polling loop for page-wide busy
  coupling;
- invalid-guess tests for each rule error, no false turn, retained draft, and no
  move mutation;
- lifecycle tests for cancellation → Active removal and completed Unranked Daily
  → History;
- route tests for Play → Active;
- identity tests for header, Lobby, results, and profile links;
- screenshot assertions for the affected gameplay and supporting routes;
- real-data validation of Word Explorer, definitions, leaderboards, and stats;
- console, network, accessibility, responsive, privacy, and zero-residue gates.

No direct database fixture may substitute for a UI flow claimed as fixed.

## 9. Delivery boundaries

- Keep the existing background and working core behavior.
- Do not modify the separate modular keyboard project in either part. Amordle may
  retain its current integration until a separately approved import.
- Do not copy the locked shell’s frontend architecture or visual design.
- Do not expose private answer authority, email, raw Auth IDs, private sessions,
  or service secrets.
- Preserve the 45-migration ledger unless Phase 1 planning demonstrates that an
  additive migration is strictly necessary. The two confirmed Ranked Daily
  defects do not currently require one.
- No Production deployment or merge is implied.
- Part 2 cannot begin until Part 1 has a green checkpoint, real-service proof, and
  user alignment.

## 10. Planning handoff

The next Plan-mode task must produce a decision-complete implementation plan for
**Part 1 only**. It must resolve every Part 1 disposition above, identify exact
code ownership and acceptance evidence, define cohesive checkpoints, require a
protected Preview and exact cleanup where authorized, and stop for separate
execution approval.

The full React Spectrum/Lichess redesign remains a named next phase, not an
opportunistic addition to the reliability repair.
