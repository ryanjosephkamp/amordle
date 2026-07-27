# Amordle Functional Contract

Version: 1.0
Behavioral source: locked `brrrdle-dev` checkpoint
`062624b2fb7c8d039a2eba3aec5b059c26628a11`, amended only by accepted
greenfield decisions recorded here.

## How to use this contract

Each primary ID is inherited from the final shell preservation inventory. The
lettered clauses are atomic acceptance obligations. All clauses require
implementation ownership and evidence in the later parity registry.

Presentation may change unless a clause protects accessibility, state meaning,
information content, responsiveness, or input behavior.

## Shared rules

- **OG** is one answer. **GO** is a sequence of answers where each solved answer
  becomes evidence for the next puzzle.
- Supported Practice word lengths are 2–35. Solo Daily and Daily COMBAT are
  fixed at five letters.
- Practice GO supports 5, 7, or 10 puzzles. Daily GO uses five puzzles.
- GO playable-attempt budgets are `max(2, 6 - zeroBasedPuzzleIndex)`: 5-puzzle
  chains use 6, 5, 4, 3, 2. Prior solved answers occupy visible evidence rows
  and affect keyboard/Hard Mode evidence, but are not new player moves or point
  sources.
- Difficulty pools are nested: Casual is the quality-ranked first 35%,
  Standard the first 70%, and Expert the full sanctioned pool.
- Daily Solo is keyed to the player's local calendar date. COMBAT Daily is
  keyed to UTC. The historical floor is January 1, 2025.
- Rejected guesses consume no attempt, move, turn, clock transition, reward, or
  History entry.
- Duplicate scoring uses the canonical two-pass algorithm: exact positions
  first, then remaining letter multiplicity.
- Evidence precedence never downgrades: correct, present, absent, removed,
  unknown.
- Hard Mode requires fixed greens and the maximum proven positive multiplicity,
  forbids purely gray letters, allows duplicate gray where positive evidence
  exists, and does not invent a yellow-position prohibition.
- Public links use sanctioned public profile identifiers. Raw Auth identifiers
  stay internal.

## A. Application shell, navigation, and platform

### APP-01 — Complete route reachability

- APP-01.a: Reachable public/account routes include Home, Play, Solo setup,
  Calendar, COMBAT overview/Daily/Practice/Active/Lobby/Live/match/result,
  Marketplace, History, Leaderboards, Word Explorer, Profile, public player
  profile, Stats, Settings, Help, Feedback, About, auth entry/callback/recovery,
  and authorized Admin.
- APP-01.b: Deep links, reloads, Back/Forward, and direct result/match links
  resolve without losing valid persisted state.
- APP-01.c: Legacy shell URLs redirect to canonical routes while preserving
  valid date, mode, session, match, and public-profile context.
- APP-01.d: Protected routes distinguish signed-out, loading, forbidden, absent,
  and recoverable service states.

### APP-02 — Refresh and re-entry

- APP-02.a: Refresh may return to Home only when that is the deliberate
  navigation contract; it never deletes a resumable game.
- APP-02.b: Solo and participant-owned COMBAT games remain available for
  explicit re-entry after refresh.
- APP-02.c: A fresh authenticated context restores cloud-backed account state
  without borrowing guest or another account's state.

### APP-03 — Navigation integrity

- APP-03.a: Browser Back/Forward does not duplicate submissions, queues,
  purchases, or terminal handoffs.
- APP-03.b: In-app navigation preserves the current account namespace and
  clears route-owned drafts only at their explicit lifecycle boundary.
- APP-03.c: Canonical redirects cannot create a different Daily answer,
  entitlement, reward identity, or multiplayer lane.

### APP-04 — Responsive containment

- APP-04.a: No required route has horizontal document overflow at 320, 360,
  390, 412, 768, 960, 1440, or 1920 CSS pixels.
- APP-04.b: Menus, dialogs, tables, boards, and controls remain reachable at
  200% zoom and with mobile safe areas.
- APP-04.c: Long words, board histories, and GO chains scroll or compact within
  controlled regions.

### APP-05 — Scroll behavior

- APP-05.a: Manual scroll is never fought by continuous auto-centering.
- APP-05.b: Auto-scroll occurs only on route entry or when a new accepted game
  row is added while the player is following the latest row.
- APP-05.c: Active gameplay keeps board, status, and keyboard together in the
  usable viewport; spectator gameplay remains the first mobile priority.

### APP-06 — Accessible operation

- APP-06.a: Each route has one main landmark, logical headings, visible focus,
  accessible names, and meaningful live-region announcements.
- APP-06.b: All essential flows work by keyboard, pointer, touch, and assistive
  activation.
- APP-06.c: Composite controls, dialogs, menus, tabs, tables, and sheets follow
  standard interaction patterns, including Escape and focus restoration.
- APP-06.d: State meaning is never conveyed by color alone; forced colors and
  reduced motion remain usable.

### APP-07 — Focus Mode

- APP-07.a: `focus=1` uses the same game session and controller as the standard
  route.
- APP-07.b: Focus Mode removes surrounding chrome without hiding turn, clock,
  status, board, keyboard, exit, or necessary account/notification access.
- APP-07.c: Focus controls never overlap at supported widths.

### APP-08 — Progression summary

- APP-08.a: The signed-in summary displays authoritative coins, XP, level, and
  relevant Daily timing.
- APP-08.b: It links to Stats and Marketplace without showing stale balances as
  spendable.
- APP-08.c: Marketplace and summary reconcile after every accepted economy
  operation and fresh-context restore.

### APP-09 — Menus, dialogs, and notifications

- APP-09.a: Account and notification surfaces remain within the viewport and
  close on outside interaction or Escape.
- APP-09.b: Opening a routed notification closes the center before navigation;
  local read/hide operations do not unexpectedly close it.
- APP-09.c: Notifications deduplicate unchanged events and respect account,
  block, and preference boundaries.
- APP-09.d: Destructive account, match, queue, and economy actions use clear
  confirmations where reversal is not immediate.

### APP-10 — PWA and updates

- APP-10.a: Service-worker registration never blocks first use.
- APP-10.b: Updates are prompt-controlled; an active game is not silently
  replaced.
- APP-10.c: Offline support caches only the application shell, immutable public
  assets, and the minimum Solo data; it never caches Auth responses, private
  projections, or secrets.
- APP-10.d: Offline Solo restores and later reconciles according to the
  persistence contract.

### APP-11 — Retired decoration

- APP-11.a: Historical command-center staging, fire/ice framing, atmospheric
  texture, glow, and cyberpunk ornament are not required and must not govern
  the new application.
- APP-11.b: Any terminal material or glass effect must remain restrained,
  readable, performant, and removable without losing state meaning.

### APP-12 — Attention badges

- APP-12.a: Numeric and Ready attention badges have readable contrast in
  selected and unselected navigation states.
- APP-12.b: Badge labels fit at mobile widths, have accessible names, and update
  only from real actionable state.

## B. Core game, Solo, data, and definitions

### GAME-01 — OG rules

- GAME-01.a: Validate in this order: session/terminal state, length and alphabet,
  sanctioned-word presence, then Hard Mode.
- GAME-01.b: Score duplicate letters with the canonical two-pass algorithm.
- GAME-01.c: Standard OG begins with six attempts unless an accepted
  continuation adds exactly one current-puzzle attempt.
- GAME-01.d: Win, loss, attempt count, keyboard evidence, results, History,
  sharing, XP, and coins derive from accepted guesses only.
- GAME-01.e: Physical and on-screen input use one command reducer; disabled or
  no-op keys mutate nothing and make no sound.

### GAME-02 — GO chains

- GAME-02.a: A solved non-final puzzle persists, remains visible for a
  two-second evidence hold, then advances automatically exactly once.
- GAME-02.b: Reload during the hold restores the solved board and only the
  remaining hold interval.
- GAME-02.c: Every prior answer is displayed as labeled seeded evidence against
  the current answer and contributes to keyboard and Hard Mode evidence.
- GAME-02.d: Seeded evidence occupies chain capacity but is not a submitted
  guess, move, share row, accepted-guess statistic, or point source.
- GAME-02.e: The final puzzle enters terminal results without an extra continue
  action.
- GAME-02.f: A GO loss calculates progress from puzzles reached, not merely the
  configured chain length.

### GAME-03 — Practice configuration

- GAME-03.a: Practice OG and GO support lengths 2–35, Casual/Standard/Expert,
  and optional Hard Mode.
- GAME-03.b: Practice GO supports 5, 7, or 10 puzzles; invalid, fractional, or
  out-of-range parameters fail before a word-list request.
- GAME-03.c: Settings lock after the first accepted guess.
- GAME-03.d: New Practice chains use a monotonic generation counter scoped by
  owner, mode, length, difficulty, and GO count.

### GAME-04 — Daily selection and past access

- GAME-04.a: Daily OG and GO are deterministic for their canonical local date,
  use five-letter answers, and cannot be altered by URL length/count tampering.
- GAME-04.b: Each mode/date has one persisted lane and one reward identity.
- GAME-04.c: Current and already unlocked past Dailies are directly playable.
- GAME-04.d: A locked past Daily can always be selected to show its 60-coin
  requirement, even when the player lacks enough coins.
- GAME-04.e: A successful payment creates a pending entitlement that survives
  re-entry and becomes permanently unlocked after the first accepted persisted
  guess; retry cannot charge twice.

### GAME-05 — Guest/account isolation

- GAME-05.a: Guest Solo state remains local under a guest namespace.
- GAME-05.b: Sign-in never implicitly merges guest progress, economy, History,
  or active sessions.
- GAME-05.c: Sign-out and account switching prevent the next identity from
  reading the prior identity's local state.
- GAME-05.d: Explicit transfer, if later offered, previews its scope and is
  idempotent.

### GAME-06 — Signed-in persistence

- GAME-06.a: Accepted Solo input is persisted before durable confirmation.
- GAME-06.b: Active sessions, completion decisions, continuation, consumables,
  History, progression, and economy restore across navigation, reload, and
  fresh browser contexts.
- GAME-06.c: Local/cloud envelopes carry schema version, owner namespace,
  monotonic revision, timestamp, and domain state.
- GAME-06.d: Reconciliation rejects stale overwrites and reports pending,
  synced, or retryable error without substituting another account.

### GAME-07 — Resume ownership

- GAME-07.a: Starting a new Practice game intentionally supersedes only the
  matching active resume lane.
- GAME-07.b: Completed or superseded games cannot resurrect after reload,
  account hydration, or stale-cloud arrival.
- GAME-07.c: Daily, Practice, OG, GO, guest, and account lanes remain separate.

### GAME-08 — Completion evidence

- GAME-08.a: Final accepted tiles and all-green solve evidence remain visible
  through results and re-entry.
- GAME-08.b: GO transition and result definitions appear exactly once.
- GAME-08.c: Rewards and History finalize only at the contract's terminal
  decision boundary and cannot duplicate on reload.

### GAME-09 — Gameplay feedback and consumables

- GAME-09.a: Draft, rejection, accepted tiles, locked reveal tiles, removed
  keys, solve, transition, and terminal state have visible and announced
  feedback.
- GAME-09.b: Reveal One Letter applies only to Solo Practice, costs 25 coins,
  excludes already known positions, and is deterministic for an operation ID.
- GAME-09.c: Remove Incorrect Letters applies only to Solo Practice, costs 40
  coins, never removes a possible answer letter, and is deterministic.
- GAME-09.d: Practice continuation adds one playable current-puzzle attempt and
  uses the accepted escalating formula. Daily exposes no give-up, reveal,
  consumable, or continuation controls.
- GAME-09.e: After attempts are exhausted, choosing reveal instead of
  continuation finalizes the existing loss without another charge.

### GAME-10 — Sound

- GAME-10.a: Sound is user-controlled, persists by account scope, and begins
  only after a user gesture permits audio.
- GAME-10.b: Accepted letter/delete input emits one key cue; submission emits
  rule/solve/win/loss feedback without a duplicate key cue.
- GAME-10.c: Muting stops new sound immediately. Every sound has a visible or
  announced equivalent.

### GAME-11 — Word data

- GAME-11.a: Load only the selected word length. Home and non-game routes do not
  fetch answer banks.
- GAME-11.b: Validate schema, revision, length, counts, lowercase alphabet,
  uniqueness, and answer/guess subset relationships.
- GAME-11.c: Public manifests reveal bounded metadata, not current answer
  authority.
- GAME-11.d: Catalog refresh publishes immutable per-length objects first and
  promotes the manifest last; failure retains the prior pointer.
- GAME-11.e: Offline/cache behavior never stores Auth responses or private
  multiplayer projections.

### GAME-12 — Definitions

- GAME-12.a: Use bundled curated metadata when available.
- GAME-12.b: When unavailable, say so plainly and offer an explicit Google
  search for the selected word.
- GAME-12.c: Do not fetch or render the same final GO definition twice.
- GAME-12.d: Word Explorer, game results, and History use the same definition
  contract.

### GAME-13 — Sharing

- GAME-13.a: Share text accurately represents mode, date or Practice settings,
  attempts/puzzles, and tile evidence.
- GAME-13.b: It does not expose an unsolved answer or private opponent data.
- GAME-13.c: Seeded GO evidence is labeled separately and not misrepresented as
  a submitted guess.

### GAME-14 — Versioned answer selection

- GAME-14.a: Practice uses deterministic hash-ranked selection without
  replacement for each versioned generation.
- GAME-14.b: Daily uses the historical selector before the recorded cutoff and
  v2 on/after the cutoff.
- GAME-14.c: Stored answer arrays remain authoritative after catalog changes.
- GAME-14.d: Ranked and unranked Daily namespaces remain separated.
- GAME-14.e: Browser projections do not expose seeds or future answers.

## C. Account, persistence, progression, History, and settings

### ACC-01 — Authentication

- ACC-01.a: Support email/password registration, sign-in, sign-out, session
  restore, password recovery, callback, and recovery completion.
- ACC-01.b: Initial hydration, sign-in, retry, and account switch use one
  account-scope transition coordinator.
- ACC-01.c: A failed restore retains the authenticated identity and provides a
  safe retry; it does not fall back to guest or previous-account data.
- ACC-01.d: Stale async completion cannot settle after account switch/sign-out.

### ACC-02 — Player name

- ACC-02.a: One validated display name is used consistently across owner,
  participant, result, leaderboard, and public profile surfaces.
- ACC-02.b: Validation accepts the documented human name set and rejects
  unsupported control/emoji/special characters with a clear explanation.
- ACC-02.c: Saving is single-flight, retains the draft on failure, and uses the
  returned approved projection as the new baseline.

### ACC-03 — Avatar and account control

- ACC-03.a: Avatar URL is optional, HTTPS-only, and public only when the profile
  is public.
- ACC-03.b: Accent and avatar never replace the textual player name.
- ACC-03.c: Account menus fit mobile/desktop viewports and expose session,
  profile, settings, and sign-out actions accessibly.

### ACC-04 — Public profiles

- ACC-04.a: Public lookup uses only the sanctioned public identifier and public
  projection.
- ACC-04.b: Private profiles return unavailable to non-owners.
- ACC-04.c: Public output excludes email, Auth UUID, settings, progress,
  economy operations, active answers, and private request details.
- ACC-04.d: Eligible public profiles can initiate the allowed private-match
  action and preserve return routing.

### ACC-05 — Settings and account management

- ACC-05.a: Persist notification, private-request opt-out, request notification,
  blocking, sound, accessibility, and account preferences.
- ACC-05.b: Block/unblock and private preferences reconcile from server
  authority and survive fresh contexts.
- ACC-05.c: Danger Zone actions name the exact effect, require confirmation,
  and never broaden a reset to Auth deletion implicitly.

### ACC-06 — Versioned local storage

- ACC-06.a: Every account-local envelope is namespaced, versioned,
  migration-safe, and corruption-tolerant.
- ACC-06.b: Corrupt state fails closed for that domain without erasing unrelated
  valid domains.
- ACC-06.c: Sign-out, account switch, and recovery clear only the appropriate
  ephemeral drafts and subscriptions.

### ACC-07 — Synchronization

- ACC-07.a: Automatic persistence is primary; manual retry/status is recovery,
  not the normal save mechanism.
- ACC-07.b: Cloud writes use revision-aware compare-and-swap or idempotent
  server operations.
- ACC-07.c: Offline/retry state is visible without exposing row contents or raw
  identifiers.
- ACC-07.d: Economy never trusts a stale browser balance over accepted server
  operations.

### ACC-08 — Progression and economy

- ACC-08.a: XP, levels, coins, unlock thresholds, prices, and continuation costs
  are pure deterministic functions covered by vectors.
- ACC-08.b: Economy operations use deterministic idempotency keys and cannot
  double-charge or double-reward.
- ACC-08.c: Stale tabs cannot resurrect spent coins or inventory.
- ACC-08.d: Purchases, use, Daily unlocks, rewards, and continuation reconcile
  across fresh contexts.
- ACC-08.e: Animations and notifications occur once per newly accepted
  operation and do not imply success before authority accepts it.

### ACC-09 — History

- ACC-09.a: Store one idempotent record per completed Solo or COMBAT game and
  user.
- ACC-09.b: Include lane, mode, result, terminal reason, settings, points,
  attempts/puzzles, timestamp, rating delta when allowed, and sanctioned
  opponent summary.
- ACC-09.c: Exclude cancelled-before-play games, raw identities, private
  sessions, seeds, and unrevealed answers.
- ACC-09.d: Filters and responsive tables distinguish Daily/Practice,
  OG/GO, Solo/COMBAT, and ranked/unranked accurately.

### ACC-10 — Calendar

- ACC-10.a: Calendar starts at January 1, 2025 and distinguishes Solo local-day
  lanes from COMBAT UTC-day lanes.
- ACC-10.b: Today is automatically brought into view on mobile without
  preventing manual horizontal scrolling.
- ACC-10.c: Every past Solo Daily cell remains selectable to inspect play,
  completion, entitlement, or insufficient-coin state.
- ACC-10.d: Replay/completion/locked/unavailable states have textual and
  non-color labels.

### ACC-11 — Private Stats

- ACC-11.a: Show Solo, COMBAT, progression, economy, streak, distribution,
  rating, and aggregate summaries from real History/service data.
- ACC-11.b: Label date basis, mode, sample size, provisional status, and data
  provenance where players need it.
- ACC-11.c: Tables/charts remain keyboard and screen-reader accessible and
  usable on mobile.

### ACC-12 — Public statistics and leaderboards

- ACC-12.a: Public site statistics use approved aggregate RPCs and no private
  fields.
- ACC-12.b: Leaderboards support rating buckets, rank, public profile, rating,
  movement, peak, games, wins, losses, draws, and provisional status.
- ACC-12.c: Search, pagination, empty/error/loading, and freshness states are
  functional.
- ACC-12.d: Public figures are never replaced by hard-coded demonstration data.

### ACC-13 — Marketplace

- ACC-13.a: Sell only Reveal One Letter for 25 coins and Remove Incorrect
  Letters for 40 coins unless a later contract explicitly adds an item.
- ACC-13.b: Display authoritative balance and inventory with pending, success,
  failure, insufficient-funds, and retry states.
- ACC-13.c: Purchases and use are idempotent for guests and authenticated users.
- ACC-13.d: Marketplace projections expose no private operation payloads.

## D. Multiplayer, competitive, private, Live, and spectation

### MP-01 — Practice COMBAT

- MP-01.a: Public unranked Practice OG/GO supports create, waiting, join,
  alternate turns, accepted guesses, reload, recovery, completion, and exact
  cleanup.
- MP-01.b: Configuration supports lengths 2–35, difficulty, Hard Mode, GO
  5/7/10, and documented Practice clocks.
- MP-01.c: Shared board rows are chronological and actor-attributed. Player
  drafts remain private to their owner.
- MP-01.d: The initial shared board has six total playable rows and grows only
  when accepted shared history requires it.

### MP-02 — Daily COMBAT lanes

- MP-02.a: Unranked and ranked Daily OG/GO are four independent participation
  lanes.
- MP-02.b: They are five-letter, UTC-keyed, clock-free, and contain no
  Practice-only consumable/continuation controls.
- MP-02.c: Claims, answer namespaces, queues, results, and rating buckets remain
  separated.
- MP-02.d: Queue controls run only on the Daily route and stop at UTC rollover.

### MP-03 — Player-owned state

- MP-03.a: Each participant owns one canonical session/draft; rival actions are
  display evidence and never overwrite it.
- MP-03.b: Writes use expected version/move evidence and reject stale mutation.
- MP-03.c: A conflict rereads durable state without fabricating success or
  clearing an unaccepted draft.

### MP-04 — Shared evidence

- MP-04.a: Both participants converge on the same accepted chronological rows,
  actor labels, and keyboard evidence.
- MP-04.b: Realtime invalidates durable reads; duplicate events are harmless.
- MP-04.c: Restoring a board does not replay every old animation or sound.

### MP-05 — Multiplayer GO

- MP-05.a: Both clients share the current puzzle index, two-second solved hold,
  seeded evidence, and automatic advancement.
- MP-05.b: Prior answers are rescored against the current answer and are not
  moves or point sources.
- MP-05.c: Turn ownership after advancement, exhausted-player skipping, final
  definitions, and point outcome agree across clients.

### MP-06 — Hard Mode and clocks

- MP-06.a: Server or retained multiplayer authority validates Hard Mode and
  supported configuration; the client does not invent acceptance.
- MP-06.b: Ranked Practice permits only untimed or five-minute lanes. Unranked
  Practice supports the shell's documented time controls.
- MP-06.c: Only the active player's durable match clock runs; GO does not reset
  it between puzzles.
- MP-06.d: Display time derives from server timestamps and reconciles after
  sleep/reconnect.

### MP-07 — Terminal precedence

- MP-07.a: Before-play cancellation creates no winner, answer reveal, rating,
  or History record.
- MP-07.b: After-play forfeit awards the opponent; timeout is materialized
  before a late command.
- MP-07.c: Normal OG solve, exhaustion/points, and draw rules follow the
  canonical order.
- MP-07.d: Terminal writes, results, and settlement are idempotent. A repeated
  compatible conflict restores canonical state and explains retry.

### MP-08 — Ranked Practice matchmaking

- MP-08.a: Queue compatibility includes mode, length, difficulty, Hard Mode, GO
  count, clock, and rating bucket.
- MP-08.b: Matching is FIFO within the supported search policy and permits
  repeat opponents.
- MP-08.c: Create, claim, finalization, cancellation, expiry, reload, and search
  again are independently idempotent.
- MP-08.d: Two callers cannot create two games for one match.

### MP-09 — Rating and settlement

- MP-09.a: Ranked Practice and ranked Daily OG/GO use their defined separate
  buckets; Hard Mode does not split a bucket.
- MP-09.b: Elo initial value, provisional K factor, standard K factor, expected
  score, bands, and rounding match retained migration/domain vectors.
- MP-09.c: Settlement creates exactly one match result, two player results,
  symmetric transactions, and authoritative profile updates.
- MP-09.d: Leaderboard and result deltas reconcile after settlement; unranked
  games never change rating.

### MP-10 — Private Practice requests

- MP-10.a: Eligible public profiles can create OG/GO requests with supported
  Practice settings.
- MP-10.b: Incoming/outgoing views are newest-first and distinguish pending,
  accepted, declined, cancelled, and expired.
- MP-10.c: Accept creates one durable restricted game and routes both players;
  decline/cancel/expiry are idempotent.
- MP-10.d: The first accepted turn persists and reloads normally.

### MP-11 — Active games

- MP-11.a: List participant-owned waiting, playing, or holding games only.
- MP-11.b: Display lane, opponent public summary, turn/status cue, and resume
  action without exposing raw identity.
- MP-11.c: Completed/cancelled games leave Active immediately after durable
  confirmation and remain available through results/History where applicable.

### MP-12 — Lobby

- MP-12.a: List only compatible joinable public games with real creator public
  summaries or the text Private player.
- MP-12.b: Owners can cancel eligible waiting lobbies; others can join once.
- MP-12.c: Loading, empty, incompatible legacy, service error, and integrity
  error are distinct states.

### MP-13 — Live

- MP-13.a: Live lists only spectator-eligible public Practice games and bounded
  terminal games.
- MP-13.b: Daily, private, rematch, custom, waiting, or otherwise restricted
  games are excluded from list and exact-ID lookup.
- MP-13.c: Participant links use sanctioned public profiles only.

### MP-14 — Spectation

- MP-14.a: Spectators receive scored accepted moves, public player summaries,
  status, and timing allowed by the sanitized projection.
- MP-14.b: They receive no keyboard, draft, mutation capability, unsolved
  answer, private session, email, raw Auth ID, or seed.
- MP-14.c: Participant and anonymous/authenticated spectator projections
  converge on eligible public state.
- MP-14.d: Mobile presentation is gameplay-first; privacy explanation is a
  compact disclosure outside the primary board viewport.

### MP-15 — Realtime and polling

- MP-15.a: Active games poll durably at five seconds when visible; idle/list
  surfaces use thirty seconds.
- MP-15.b: Route entry, visibility gain, reconnect, mutation success, conflict,
  and Realtime invalidation trigger immediate reread.
- MP-15.c: Background reconciliation never flashes unrelated controls, resets
  drafts, or produces avoidable authorization errors.
- MP-15.d: Same-tab participant recovery meets the shared five-second contract.

### MP-16 — Multiplayer notifications

- MP-16.a: Project private-request, match, turn, result, and rematch events once
  per durable transition.
- MP-16.b: Respect opt-out, notification preferences, and blocks.
- MP-16.c: Actions route to the exact request center, game, or result and close
  navigation surfaces according to APP-09.

### MP-17 — Postgame actions

- MP-17.a: Results preserve winner/draw, points, settings, answer reveal at the
  authorized time, rating delta, definitions, and public player links.
- MP-17.b: Eligible Practice games can request/accept/decline/cancel one rematch
  lifecycle without exposing the original private state.
- MP-17.c: Search again, play Daily, view rival, History, and Active actions
  appear only when contextually valid.

### MP-18 — Ranked Daily authority

- MP-18.a: Ranked Daily OG and GO use independent authenticated FIFO queues,
  claims, answer namespaces, rating buckets, and idempotent intent keys.
- MP-18.b: Two compatible accounts pair exactly once and both reach the same
  durable game.
- MP-18.c: Server-authorized actions, finalization, settlement, cleanup,
  reload hydration, and public metadata reveal no answer/private projection.
- MP-18.d: Account-scoped queue intent cannot be adopted or cleared by another
  account.

### MP-19 — Private-request protections

- MP-19.a: Opt-out, directional blocking, uniqueness, pair locking,
  active/recent anti-spam limits, and participant visibility are server
  enforced.
- MP-19.b: Reverse-direction and concurrent requests cannot bypass limits.
- MP-19.c: Block/unblock and preference changes reconcile before new requests
  are offered.

### MP-20 — Same-tab provisional recovery

- MP-20.a: After authenticated refresh-to-Home, a same-account synced
  participant projection may appear provisionally while participant reads
  load.
- MP-20.b: Explicit same-account repository authority supersedes it and cannot
  be overwritten by later progress hydration.
- MP-20.c: Guest, cross-account, queue, claim, settlement, and write authority
  never use the provisional shortcut.

### MP-21 — Participant-first startup

- MP-21.a: Startup reads participant-owned rows through explicit participant
  predicates before merging the separate waiting-game lane.
- MP-21.b: Concurrent/Realtime refreshes coalesce and stale generations cannot
  overwrite a newer account or projection.
- MP-21.c: Cold answerless ranked Daily hydration prepares only the required
  five-letter bank; cold Home does not fetch word banks.

## E. Supporting product surfaces

### SUP-01 — Home

- SUP-01.a: Summarize real current Solo/COMBAT attention, Daily availability,
  progression, and recent results.
- SUP-01.b: Route directly to playable/resumable actions.
- SUP-01.c: Show truthful loading, empty, signed-out, and service states with no
  fictional counts.

### SUP-02 — Word Explorer

- SUP-02.a: Support explicit length 2–35, search, A–Z/Z–A sorting, pagination,
  selected-length counts, copy, definition, and direct `word` query selection.
- SUP-02.b: Load one selected length at a time.
- SUP-02.c: Identify sanctioned guess/answer eligibility only where doing so
  cannot reveal an active answer.
- SUP-02.d: Handle unavailable data without blocking other routes.

### SUP-03 — Help and About

- SUP-03.a: Help teaches OG, GO, Daily, Practice, COMBAT, Hard Mode, scoring,
  economy, navigation, accessibility, and privacy in human language.
- SUP-03.b: About explains the product and rating approach separately from
  gameplay instructions.
- SUP-03.c: Both remain public, responsive, and keyboard reachable.

### SUP-04 — Feedback

- SUP-04.a: Build a previewable, sanitized GitHub issue template.
- SUP-04.b: Provide copy/open controls and never silently submit browser or
  account state.
- SUP-04.c: Exclude secrets, email, raw IDs, answers, and private projections.

### SUP-05 — Admin

- SUP-05.a: Require Supabase authentication and role-first admin authorization.
- SUP-05.b: Provide bounded diagnostics and manual word-list refresh through the
  retained API.
- SUP-05.c: Anonymous, ordinary authenticated, and stale-role access fail
  closed without revealing diagnostics.

### SUP-06 — Refresh and update status

- SUP-06.a: Data-refresh failure leaves the prior valid manifest usable and
  does not block unrelated gameplay.
- SUP-06.b: Update and refresh status uses plain player/operator language
  appropriate to its surface.
- SUP-06.c: Retry is bounded and cannot publish a partial word-list revision.

## Required HTTP interfaces

- `POST /api/admin-refresh`: bearer authentication, role-first admin
  authorization, 405/401/403/502 behavior, and bounded successful metadata.
- `GET /api/cron/refresh-word-lists`: `Authorization: Bearer <CRON_SECRET>`,
  daily schedule, idempotent/concurrency-safe refresh, and 200/401/502 behavior.
- `GET /api/word-lists/manifest`: public bounded cache, `manifest: null`
  fallback when storage is unconfigured, and no private answer authority.

No fourth application API is introduced without a contract change.
