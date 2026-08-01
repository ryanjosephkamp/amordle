# Amordle Stage 2 v6.4 — Solo Continuity and Experience Intake

## Status and purpose

This document records the owner's August 1, 2026 review of the v6.3 protected
Preview and the requested scope for the next planning cycle. It is an intake
record, not an implementation plan or execution authorization.

The v6.3 presentation and behavior are accepted as the baseline for the next
iteration. The next task must begin in read-only Plan mode, audit the real
repository and service authority, and return a decision-complete plan before
any implementation, migration, deployment, or hosted mutation.

## Accepted v6.3 baseline

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Accepted repository head before this intake record:
  `4fa0b74c4c6827b14e98d19bfecfeb3ab57afdca`
- Accepted golden tag:
  `amordle-stage2-v6.3-accent-personalization-golden-2026-08-01`
- Application candidate: `35597069a5852a0f42017b0e995f98b5c15cbf83`
- Acceptance evidence checkpoint:
  `6922cd59ddfeeb79d53c2a4d4922ac1b5e8dc4d5`
- Protected Preview deployment: `dpl_GJe7uVkz57vS7G9cDAocjuQVBmb7`
- Protected Preview:
  <https://amordle-p04gk2mv2-ryanjosephkamps-projects.vercel.app>
- Supabase project: `squqdstdvbsvhagfuzgj`
- Migration state: 49 synchronized migrations—45 immutable baseline
  migrations plus four separately authorized additive migrations.
- Acceptance state: 237/237 clauses, 107/107 bootstrap files, 73/73
  multiplayer audit rows, exactly three application HTTP interfaces, and zero
  disposable-resource residue.

The owner specifically accepted the recent desktop centering, named and custom
accent behavior, accent-aware keyboard and alert presentation, profile
information hierarchy, mobile Stats containment, Word Explorer, and the rest
of the v6.3 work except where a new request below explicitly touches an
adjacent behavior. The next cycle must not reopen those accepted surfaces
without a demonstrated regression or a necessary, narrowly scoped
integration.

## Requested next scope

### 1. Multiple active Solo sessions and clear resume behavior

The Home Solo action currently appears to resume one recent saved Solo
Practice game. That is useful but ambiguous when more than one Solo session
could exist. The next design must separate starting a new Solo game from
resuming an existing one and make every active Solo session discoverable.

Requested concurrency policy:

- up to three active Solo Practice OG sessions;
- up to three active Solo Practice GO sessions;
- up to one active Solo Daily OG session for the applicable Daily authority;
- up to one active Solo Daily GO session for the applicable Daily authority;
- six active Practice sessions and two active Daily sessions at most under
  those categories.

Home and the Solo area should expose active Solo sessions in a concise,
player-facing list comparable in usefulness—not necessarily identical in
layout—to Active COMBAT. Each row should make the mode, Practice or Daily lane,
word length, useful progress, and resume destination clear. The Solo entry
flow must make “new game” and “resume” unambiguous.

Planning must inspect the existing guest/account persistence namespaces,
session identifiers, reconciliation rules, Daily date authority, cross-device
behavior, and current Home-resume selector before deciding the storage and UI
changes. It must define deterministic ordering, duplicate-start behavior,
limit handling, completion/removal, expiry or abandonment, account switching,
guest isolation, offline recovery, and what happens when a Daily authority
rolls over. Gameplay rules themselves must remain unchanged.

### 2. Mobile menu frame polish

On Chrome mobile at normal zoom, the open menu shows its bottom terminal-frame
line but the corresponding top line is absent. Restore the top frame treatment
without changing the accepted menu contents, mobile navigation behavior,
touch targets, overlay stacking, or gameplay geometry.

### 3. Keyboard sound repair and selectable sound set

Keyboard sounds do not consistently play even when sound and keyboard sounds
are enabled. Diagnose the actual sound adapter, browser audio-unlock path,
settings hydration, physical-keyboard path, on-screen-keyboard path, and any
mobile restrictions before changing behavior.

After repairing playback, provide a small, deliberate selection of
approximately five keyboard sound choices. The plan should place this control
where it best fits the existing Settings/Profile authority, preserve a silent
option through the existing enable/disable setting, provide a preview control,
and avoid paid or externally hosted audio dependencies. Sound must never delay
or block input.

### 4. Optional haptic feedback

Add an opt-in haptic-feedback setting for supported mobile devices. At minimum,
direct touches on the on-screen game keyboard should be eligible. The plan may
include restrained feedback for high-value navigation actions if it remains
consistent and non-noisy.

The implementation must use capability detection, run only from eligible
direct user gestures, degrade to a silent no-op where unsupported or denied,
avoid repeated/long vibration patterns, respect the player's saved setting,
and preserve keyboard, screen-reader, reduced-motion, and touch behavior.

### 5. Local profile-image upload in addition to HTTPS URLs

Preserve the current public HTTPS profile-image URL workflow and its accepted
profile-page presentation. Add an alternative that lets a player select a
local PNG, JPEG, WebP, or animated GIF from a computer or mobile device and
use it as the public profile image.

Planning must determine the cleanest zero-required-cost authority from the
actual repository and linked Supabase project. It must not put binary images or
base64 data in profile/database rows. It must address file-signature and MIME
validation, size and dimension limits generous enough for a high-quality
profile image, animated GIF handling, filename/path isolation, overwrites,
replacement and removal, orphan cleanup, public-read versus owner-write
access, cache behavior, malicious content, metadata/privacy handling, account
deletion, quota exhaustion, and exact disposable-test cleanup.

No new paid vendor or mandatory paid capability is acceptable. A required
Storage bucket, policy, RPC, migration, or provider-setting change is a
separate material authority decision and must be surfaced in the Plan-mode
decision packet before mutation.

### 6. Completed-game review on mobile

The terminal result panel, definition, and actions are useful and should remain.
It is acceptable for a completed game to guide or scroll the player to the
result. On mobile, however, the player must still be able to scroll back up and
review the complete board and guess history. The current completed state can
trap the player at the result area.

The next implementation should distinguish the compact, gameplay-first active
state from a scrollable terminal-review state. It must preserve the accepted
desktop result layout, definition content, copy/share actions, “play again,”
keyboard safety, focus management, browser history, and the initial active-game
no-scroll behavior. A “back to board” or collapsible result affordance may be
used only if it is the cleanest supplement; ordinary document scrolling must
not be blocked after completion.

### 7. Route-entry freshness after a qualifying game change

A completed signed-in Solo game currently reaches durable History, but the
History route may show stale data until the browser receives a hard refresh.
Navigating to History after completion must reconcile and load the current
result without a manual refresh.

Audit every player-facing projection that should change after Solo or COMBAT
progress or completion, including as applicable:

- History;
- Stats and progression;
- Leaderboards/rating projections;
- Home attention and resume actions;
- active Solo and Active COMBAT lists;
- account summary, rewards, XP, coins, and related cached projections.

The desired policy is route-entry and relevant-mutation freshness, not
aggressive background polling for static data pages. A data route should
reconcile pending local work and request current authoritative data when the
player enters or re-enters it, and a completed mutation should invalidate the
relevant account-scoped queries. Another already-open browser context may stay
unchanged until navigation, visibility/reconnection recovery where already
appropriate, or manual refresh. Existing COMBAT polling and Realtime recovery
contracts must remain intact.

The repair must prevent cross-account cache bleed, duplicate rewards or
History entries, repeated settlement, and indefinite loading. It must preserve
idempotent outbox reconciliation and the established local/offline fallback.

## Required planning audit

The next Plan-mode task should establish, from actual source and service
authority:

1. whether multiple active Solo sessions require a persistence-envelope or
   schema change;
2. whether account-synced active Solo sessions are already representable by
   existing RPCs and History/state tables;
3. which TanStack Query keys, route mounts, outbox reconciliation hooks, and
   mutation invalidations cause the stale History observation;
4. why mobile terminal completion currently prevents upward review;
5. why the mobile menu top frame is clipped or absent;
6. why sounds fail under the tested browser/user-gesture conditions;
7. which sound assets can be bundled and how preference persistence remains
   backward compatible;
8. what haptic API support and user-agent limitations require graceful
   fallback;
9. whether the existing Supabase project already has a suitable Storage
   authority, and the minimum secure additive authority if it does not; and
10. every affected functional clause, parity row, automated test, hosted
    scenario, cleanup path, and user-facing help/settings statement.

Any required migration, Storage bucket/policy mutation, new public API, paid
capability, or Production/provider setting change must be isolated in a
decision packet and stopped for separate exact authorization.

## Evidence and acceptance expectations for later execution

The eventual implementation plan should retain the complete required command
stack and all established gates. Targeted proof must include:

- three Practice OG and three Practice GO sessions can coexist, resume by exact
  identity, remain account/guest isolated, and reject a seventh category-
  exceeding start truthfully;
- one current Daily OG and one current Daily GO session resume correctly
  without creating duplicates across navigation, reload, offline recovery, or
  the applicable date boundary;
- Home and Solo expose the exact active sessions and remove terminal sessions
  at the correct lifecycle point;
- no manual hard refresh is needed when entering History, Stats, Leaderboards,
  or active-game views after a relevant completion;
- reconciliation and route re-entry do not duplicate History, XP, coins,
  ratings, rewards, or settlement;
- mobile menu framing is complete at 320, 360, 390, and 412 CSS pixels;
- enabled sounds play after valid browser audio activation on physical and
  on-screen input; disabled sound stays silent; all choices are previewable and
  persist correctly;
- haptics are emitted only when enabled and supported and are a no-op otherwise;
- URL and file-based profile images both work with safe validation, public
  projection, owner isolation, replacement/removal, quota failure handling,
  and zero-residue cleanup;
- completed Solo and COMBAT result states allow board-to-result and
  result-to-board review on mobile without a scroll trap or horizontal
  overflow;
- the approved v6.3 desktop/mobile layouts, accents, semantic evidence,
  profiles, Word Explorer, Players, and COMBAT behavior remain regression-
  green.

## Preserved boundaries

- No work in the locked BRRRDLE-DEV shell.
- No merge, Production release, default-branch change, stash inspection,
  branch deletion, force push, real-account deletion, or down migration.
- No change to game rules, scoring, answer/seed privacy, rating formulas,
  existing multiplayer authority, the three-HTTP-interface boundary, immutable
  bootstrap files, or the original 45 migrations.
- Existing visible E2E profiles may remain; only newly registered disposable
  resources are subject to exact cleanup during later hosted acceptance.
- The current protected Preview remains the rollback/review baseline until a
  separately authorized implementation produces a new green candidate.

## Next gate

The next authorized action is read-only planning using this intake record and
the repository as primary authority. Implementation, service mutation,
deployment, and release remain unauthorized until the owner accepts that plan
and separately authorizes execution.
