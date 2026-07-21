# amordle Functional Contract

**Status:** Canonical minimum behavioral contract for the fresh build.
**Date:** 2026-07-20
**Purpose:** Define what the game must do without prescribing how the new implementation must be built or styled.

## 1. Interpretation

This contract is a minimum, not a feature ceiling. A fresh implementation may add thoughtful functionality, better flows, stronger accessibility, better performance, better tests, and a more capable architecture when additions do not contradict the required rules, weaken privacy, fabricate service state, or block later commercial use.

The accepted live behavioral reference is <https://amordle.vercel.app>. The final source provenance is the read-only release <https://github.com/ryanjosephkamp/brrrdle-dev/releases/tag/phase-58-final-functional-shell-golden-2026-07-13>. Neither surface is the visual target.

## 2. Product vocabulary

- **amordle:** lowercase product name, pronounced like “immortal.”
- **OG:** one word puzzle using Wordle-style feedback.
- **GO:** a linked sequence of word puzzles with prior solved-word evidence and chain progression.
- **Daily:** deterministic date-bound play with fixed product rules.
- **Practice:** configurable repeatable play.
- **Solo:** one player against the puzzle.
- **COMBAT:** user-facing name for multiplayer. Internal storage or migration identifiers may remain `multiplayer` where compatibility requires it.
- **Guest:** local-only player without authenticated cloud authority.
- **Authenticated player:** Supabase Auth user with account-scoped persistence and authorized multiplayer/economy capabilities.

## 3. Global application capabilities

The finished application must make these destinations or equivalent consolidated surfaces reachable:

- Home;
- Solo / PLAY;
- Daily and Calendar;
- COMBAT overview, Daily, Practice, Active Games, Lobby, Live, and eligible postgame actions;
- Marketplace;
- History;
- Leaderboards;
- Word Explorer;
- Profile and approved public profile;
- Definitions;
- Stats;
- Settings;
- Help/tutorial;
- Feedback;
- About;
- protected Admin.

Hidden or compatibility routes may redirect into a consolidated information architecture, but deep links, Back/Forward, refresh recovery, active-game re-entry, and authorization boundaries must remain coherent.

The shell must provide:

- usable desktop, tablet, and mobile navigation;
- account/guest access and notifications;
- route attention or resumable-state cues;
- Focus Mode for gameplay with a visible recovery/exit control;
- exactly one meaningful main landmark;
- visible focus and keyboard navigation;
- safe dialogs, sheets, menus, status announcements, and error recovery;
- no page-level horizontal overflow at supported widths;
- safe-area and fixed-navigation clearance;
- reduced-motion and sound preferences;
- nonblocking PWA/service-worker registration and offline/recovery behavior.

## 4. Word data and common puzzle rules

### 4.1 Word lengths

- Daily puzzles are always five letters.
- Practice supports every integer word length from 2 through 35.
- Unsupported lengths must fail clearly rather than silently substitute another puzzle.
- Board, keyboard, results, history, and multiplayer projections must remain usable at short and very long lengths.

### 4.2 Difficulty

Practice supports `Casual`, `Standard`, and `Expert` answer pools. Expert is the default and uses the full curated answer set. Difficulty changes the answer subset, not the valid-guess vocabulary.

### 4.3 Guess validation

A submitted guess must:

- be present;
- use exactly the active word length;
- contain only accepted alphabetic characters;
- use a supported word length;
- exist in the active valid-guess set;
- obey Hard Mode when Hard Mode is enabled;
- be rejected after the puzzle or owned turn is terminal.

Validation failure must be perceivable and must not corrupt the current draft, board, keyboard, attempt count, turn, score, or persisted session.

### 4.4 Tile and keyboard semantics

- `correct`: the letter is in that position.
- `present`: the letter exists elsewhere after duplicate-letter accounting.
- `absent`: no remaining unmatched instance exists.
- Keyboard evidence uses strongest-known precedence: correct over present over absent over unknown.
- Feedback meaning cannot depend on color alone.
- Duplicate letters must be scored against remaining answer-letter counts, not independently.

### 4.5 Input

Gameplay must support physical keyboard, pointer, touch, and assistive-technology operation. Enter submits and Backspace/Delete removes an editable character. Disabled or removed letters cannot be entered. Revealed/locked positions cannot be overwritten or deleted.

### 4.6 Attempts and continuation

- The normal default is six attempts per puzzle unless a source-authorized mode calculates otherwise.
- Solo Practice may offer paid continuation after loss; each accepted continuation adds an attempt and is recorded deterministically.
- Multiplayer and GO terminal/continuation behavior must preserve the mode-specific rules below rather than imposing a decorative six-row limit.
- The interface must represent all authoritative guesses; a viewport may scroll or window rows without deleting history.

## 5. Solo OG

Solo OG must support:

- Daily and Practice setup;
- deterministic Daily answer selection;
- configurable Practice length and difficulty;
- Practice Hard Mode;
- new Practice seed/game;
- canonical guess validation and tile/keyboard feedback;
- win, loss, reveal/give-up where authorized, and paid continuation;
- final all-green solved row before result handoff;
- definitions, rewards, share text, History, replay/new-game, and re-entry;
- local guest persistence and authenticated cloud persistence;
- resume after navigation, refresh, and later return without resurrecting a superseded completed game.

## 6. Solo GO

GO is a sequence, not several unrelated boards.

- Practice supports chain counts of 5, 7, or 10; default is 5.
- Daily uses the canonical fixed chain contract.
- Every puzzle uses the active word length; Daily remains five letters.
- Solving a puzzle visibly holds the all-green result, records the solved word as prior evidence, and advances to the next puzzle.
- Prior solved answers remain visible as chain context and contribute to relevant keyboard evidence.
- The final puzzle produces terminal results and definitions without duplicating the final definition.
- Hard Mode validates against applicable evidence.
- New chains use the versioned deterministic selection-without-replacement contract; legacy serialized answers restore unchanged.
- Daily cutoff/version behavior and ranked/unranked Daily answer namespaces remain separated.

## 7. Daily and Calendar

### 7.1 Solo Daily

- Uses the player’s local calendar day.
- Provides OG and GO.
- Is deterministic for the date and selected Daily contract.
- Is guarded against large live-session wall-clock jumps while tolerating normal drift and cold-start reality.
- Supports leave/re-entry, completion evidence, history, and countdown to local midnight.

### 7.2 Calendar and past Daily

- Calendar starts at `2025-01-01`.
- Today’s Daily is available without a past-Daily unlock.
- A past mode/date is unlocked for 60 coins under the accepted economy rules and remains durably unlocked after the qualifying action.
- Invalid or corrupt stored unlock entries cannot grant phantom access.
- Calendar routes to the chosen OG/GO date and reflects access/completion state.

### 7.3 Daily COMBAT

- Resets at UTC midnight and is separate from Solo Daily.
- Is asynchronous, five-letter, and no-clock.
- Has no Practice-only configuration or consumables.
- Unranked and ranked lanes use separate participation/answer/rating authority.
- Daily games must never appear in public Live spectation.
- Claims, queueing, action evidence, settlement, cleanup, and repeat eligibility remain server-authoritative.

## 8. Practice configuration

Practice may expose:

- OG or GO;
- length 2–35;
- Casual, Standard, or Expert;
- Hard Mode;
- GO chain count 5/7/10;
- new seed/game;
- Solo-only consumables;
- COMBAT public/private/ranked/unranked entry as applicable;
- COMBAT time controls: none, 30 seconds, 1 minute, 2 minutes, 5 minutes, 10 minutes, 30 minutes, or 1 hour for supported unranked paths;
- ranked timed Practice only for the canonical five-minute rating lane.

## 9. COMBAT core model

### 9.1 Shared visible play

- The game presents one shared sequence of submitted moves, not one unrelated board per player.
- Every move is attributed to its actor.
- Both players see shared submitted guesses and tile evidence.
- Each player retains a canonical player-owned session for validation, attempts, Hard Mode, timing, and mutation.
- Rival moves may be projected for display and shared-rule evidence but must not overwrite the rival’s canonical private session.
- Compatibility `serializedSession` data is not permission to collapse player-owned state.

### 9.2 Turn and persistence

- Two distinct authenticated players join a durable game.
- Turn ownership alternates or follows the mode’s terminal-session rule.
- Only the active eligible player may submit.
- Accepted moves persist before the UI claims durable success.
- Refresh, route changes, focus changes, realtime bursts, and later re-entry must converge on current server-authoritative state without flashing or restoring stale games.
- Authenticated same-tab refresh intentionally returns to Home, then allows one-entry recovery of participant games within the accepted readiness budget.

### 9.3 Practice COMBAT

- Public lobby creation/join/cancel;
- ranked FIFO search for compatible OG/GO and supported clock buckets;
- unranked public games;
- private Practice requests from eligible public profiles;
- active-game resume;
- Hard Mode where configured;
- configured word length, difficulty, GO count, and allowed time control;
- first and later turns, completion, timeout, forfeit, cancellation, result, and postgame actions.

### 9.4 Private requests

- Eligible public-profile entry points;
- requester and target identities constrained to approved public information;
- OG/GO and supported settings;
- incoming/outgoing lists, newest-first status filters, accept, decline, cancel, expire, and direct created-game entry;
- opt-out preference, directional blocking, uniqueness/pair locking, duplicate prevention, active/recent anti-spam limits, and participant-only visibility;
- lifecycle notifications that appear once and route to the correct request or created game.

### 9.5 Lobby, Active, and Live

- Lobby lists only sanctioned joinable public games and enforces join/cancel ownership.
- Active Games lists participant-owned resumable games with turn and status cues.
- Live lists only sanctioned Practice games.
- Public and authenticated spectator projections are sanitized and read-only.
- Spectators cannot guess, join as participants, forfeit, cancel, manipulate timers/ratings/claims, access answers, or obtain private identifiers.
- Daily games and restricted/private games are excluded from public Live.
- Terminal spectator projections may briefly show the final board and privacy-safe cancellation/forfeit outcome.

## 10. COMBAT results, points, and ratings

### 10.1 Tile-point scoring

- absent tile: 0 points;
- present tile: 2 points;
- correct tile: 5 points;
- solved puzzle: 100 points;
- each unused attempt on a solved puzzle: 10 points;
- Hard Mode solved-puzzle bonus: 15 points.

Points are calculated per player from that player’s moves. UI must distinguish live points, result points, Elo/rating, rank band, turn, clock, and connection state.

### 10.2 Winner precedence

- A pre-guess forfeit is a cancellation: no winner, no loss, no fabricated reason, and no answer reveal.
- A post-start forfeit makes the non-forfeiting participant the winner even if tile points disagree.
- A timeout makes the non-timed-out participant the winner; timeout precedence must not be replaced by points.
- An OG solve produces the canonical OG winner.
- GO and other terminal cases without an authoritative winner use the accepted points comparison; equal points are a draw.
- Terminal calculation and settlement must be idempotent.

### 10.3 Ratings

- Initial rating: 1200.
- First 10 games are provisional.
- Provisional K-factor: 40.
- Established K-factor: 24.
- Standard Elo expected-score scale: 400.
- Rank bands: Learner through 899; Bronze 900–1099; Silver 1100–1299; Gold 1300–1499; Platinum 1500–1699; Diamond 1700–1899; Master 1900+.
- Separate buckets exist for OG/GO untimed Practice, canonical five-minute timed Practice, and ranked Daily OG/GO.
- Hard Mode does not create another rating bucket.
- Only authenticated, durable, ranked, server-authorized terminal evidence can change rating.
- Guests, unranked games, spectators, custom games, unsupported clock variants, incomplete/corrupt results, or local fixtures cannot change rating.

### 10.4 Matchmaking reliability

- Ranked Practice uses compatible FIFO matching and permits repeat opponents.
- A valid authenticated caller retrying an owned request that a concurrent claimant already matched receives the existing matched result rather than a false invalid-state error.
- Cancellation/expiration/ownership rules remain strict.
- Ranked search-again starts a new valid search without duplicating or resurrecting stale queue rows.

## 11. Accounts, identity, and privacy

### 11.1 Authentication

- Email/password create account, sign in, sign out, restore session, forgot/reset password, and meaningful error states.
- Redirect and recovery flows work on local, preview, and production origins configured for the dedicated project.
- Guest play remains available where backend authority is not required.

### 11.2 Profile

- One public player/display name, maximum 50 characters, with the accepted character restrictions.
- Profile accent/avatar controls with responsive account access.
- Avatar upload maximum 200 KiB and dedicated storage authority.
- Public profile visibility can be private or public.
- Public bio maximum 160 characters and avatar URL maximum 2048 characters.
- Public profile reveals only approved public metadata and eligible public actions.

### 11.3 Account separation

- Guest progress is local.
- Authenticated progress is account-scoped.
- Switching accounts in one browser cannot expose another account’s progress, settings, inventory, history, private games, or notifications.
- Sign-in does not silently merge or leak guest state outside the explicit transfer contract.
- Destructive account/progress actions require clear confirmation and cannot be triggered accidentally.

### 11.4 Protected data

Never expose:

- service-role credentials or other privileged secrets;
- raw auth identifiers where a sanctioned public identity is expected;
- private game rows or participant-only projections;
- Daily answers before authorized reveal;
- ranked Daily private authority/catalog/action data;
- private requests, blocks, preferences, inventory, sync payloads, or Admin data to unauthorized viewers.

## 12. Persistence, history, and synchronization

- Local storage is versioned and migration-safe.
- Valid Solo submissions, completion, continuation, consumable effects, rewards, active resume target, and completion-display handoff persist promptly.
- Signed-in cloud progress hydrates and syncs without overwriting newer authoritative data.
- Manual recovery/sync status exists without replacing automatic persistence.
- History includes accurate Solo and COMBAT records with mode, scope, date/settings, result, and privacy-safe metadata.
- Completed or superseded games do not become active again after refresh.
- Stale multiplayer projections cannot overwrite current participant authority.

## 13. Progression, economy, and Marketplace

### 13.1 XP and levels

- Won-puzzle XP: `wordLength × 10 × puzzleCount` plus `5 × unusedAttempts`; a won GO adds 25.
- Loss XP: at least 5, otherwise `wordLength × puzzleCount`.
- Level 1 starts at 0 XP. Advancing from level N costs `N × 100` XP.
- Rewards apply once per accepted completion.

### 13.2 Coins

- Won-game base: `wordLength × puzzleCount`.
- Won-game efficiency: `2 × unusedAttempts`.
- Daily win bonus: 5.
- GO win bonus: 5.
- Loss award: 2 for Daily, 1 for Practice.
- Coin changes must be serialized/idempotent; stale browser state cannot resurrect spent coins.

### 13.3 Marketplace

- Reveal One Letter costs 25 coins.
- Remove Incorrect Letters costs 40 coins.
- Consumables can be purchased and used only for Solo Practice.
- Daily, COMBAT, ranked, unranked, private, Lobby, Live, and spectator paths remain consumable-free.
- Reveal locks one deterministic unresolved position.
- Remove Incorrect Letters removes up to five deterministic eligible letters per use without removing answer letters, already absent/removed letters, or current draft letters.
- Inventory, pending, success, error, insufficient-funds, insufficient-inventory, and fresh-browser hydration states are authoritative and private.

### 13.4 Pay to continue

Solo continuation cost follows the accepted deterministic function of word length, completion percentage, and prior continuation count. Charging and added attempts must be idempotent and persist together.

## 14. Definitions, Word Explorer, sharing, and support

- Definitions use the established source/fallback behavior and handle unavailable entries gracefully.
- GO result definitions do not duplicate the final solved word.
- Word Explorer searches/browses the sanctioned game lexicon without revealing active answers.
- Share output accurately represents mode/result and does not reveal protected answers early.
- Help/tutorial explains OG, GO, Daily, Practice, COMBAT, scoring, ratings, privacy, and core navigation.
- Feedback creates a privacy-safe issue handoff without silently transmitting private state.
- About/credits/release information remains reachable and accurate.

## 15. Notifications and sensory feedback

- Notifications represent real source-derived events only.
- Open routes to the relevant target and collapses the center; local read/hide actions do not unexpectedly navigate.
- Mark read, Mark all read, Hide, outside click, and Escape preserve the accepted interaction distinctions.
- Unchanged events do not replay notifications or sounds.
- Sound is opt-in/user-controlled and resumes browser audio only from a user gesture.
- Gameplay, completion, transition, notification, and error feedback remains perceivable with sound off and reduced motion enabled.

## 16. Admin and operational behavior

- Anonymous, authenticated-non-admin, unconfigured, authorized-ready, confirmation, in-flight, success, and failure states are distinct.
- Authorization is checked before privileged rendering or action.
- Admin can inspect approved aggregate operational metrics and invoke the authorized word-list refresh.
- Admin refresh requires an authenticated admin bearer token.
- Cron refresh requires the exact cron bearer secret.
- Neither UI nor API returns secrets, raw service configuration, private rows, or invented progress.
- Failure preserves the previously served word-list manifest.

## 17. Word-list loading and refresh

- Curated word files exist for lengths 2–35.
- Cold Home does not eagerly load answer banks.
- Entering a game loads only required route/data chunks and selected word length where practical.
- Files validate schema, length, normalization, answers, and valid guesses before acceptance.
- Concurrent requests deduplicate; successful loads cache; failed loads may retry.
- Bundled data remains a safe gameplay fallback.
- Admin/cron refresh fetches the current public upstream revision, validates every length, uploads revisioned objects, and swaps one manifest only after all uploads succeed.
- Partial refresh failure leaves the previously served set intact.
- The public manifest endpoint exposes only public dictionary metadata.

## 18. Accessibility, responsiveness, performance, and recovery

The finished product must:

- work at 320, 360, 390, 412, tablet, 960, 1440, and 1920 CSS-pixel widths;
- support 200% text zoom/reflow without losing required actions;
- avoid page-level horizontal scrolling while permitting a contained long-board viewport when needed;
- preserve at least practical touch-target sizing and visible focus;
- use semantic names/roles/states and restrained live regions;
- trap and restore focus in modal interactions;
- honor `prefers-reduced-motion` and sound-off;
- avoid answer-bearing data on cold Home;
- preserve route-lazy and word-list chunk separation;
- provide clear loading, empty, offline, lazy-route failure, retry, and local-play-available states;
- keep local Solo/Practice available when network authority is unavailable where the underlying data permits it;
- register PWA assets without blocking startup;
- never use screenshots or CSS alone as proof that behavior works.

## 19. Functional completion criteria

The fresh implementation is functionally complete only when:

1. every capability above has source and test ownership;
2. the new automated suite covers domain rules, components/integration, browser behavior, real two-client Supabase behavior, privacy, accessibility, responsive geometry, performance, PWA/API, and cleanup;
3. real-service tests use only the exact amordle project and leave no temporary residue;
4. the complete supported route/mode matrix is exercised;
5. an interactive private Vercel preview is available;
6. Ryan receives and passes a comprehensive manual checklist;
7. the result is visually compared against all relevant locked concepts rather than merely declared “inspired by” them;
8. known limitations are explicit and no required failure is concealed by mocks or weakened assertions.
