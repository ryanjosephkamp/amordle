# Amordle Stage 2 v6.4 — Solo Continuity and Experience Completion

## Outcome

Amordle v6.4 is review-ready on a protected Preview. Multiple active Solo
sessions, route-entry data freshness, mobile terminal-review scrolling, the
mobile menu frame repair, selectable keyboard sounds, optional touch haptics,
and public local-file avatar uploads are implemented and acceptance-proven.

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Application candidate: `8a530fa9e76df25b03fee057ede7ffaa952d11a0`
- Acceptance evidence checkpoint: `d41326b931d2fb8a4a354719f464fe21933842dd`
- Deployment: `dpl_3mETdjizULk7DPP9g6zSHn2s92f6`
- Protected Preview: <https://amordle-p2478e0c6-ryanjosephkamps-projects.vercel.app>
- Hosted run: `e2e_20260801T223654814Z_8a530fa9_f2ef9987`
- Planned golden tag: `amordle-stage2-v6.4-solo-continuity-golden-2026-08-01`
- Status: ready for owner review; not merged and not released to Production.

## Authorized authority changes

The owner authorized and this run applied exactly:

1. `20260801221500_amordle_feedback_preferences_v2.sql`
   - SHA-256: `cde752fb637554292435292880b5375d6d8ce02c69793757d3655d7b1ba6c368`
2. `20260801222500_amordle_public_avatars_v1.sql`
   - SHA-256: `1259a67886b9e7c64911b66cacfec39868a75d78e6e7a3a79966b274a8610f17`

Linked project `squqdstdvbsvhagfuzgj` now has 51 synchronized migrations: the
45 immutable baseline migrations plus six separately authorized additive
migrations. Linked TypeScript types were regenerated after application.

The feedback migration adds bounded, backward-compatible columns for the
five-value keyboard-sound profile and opt-in haptics. The frozen v1 settings
JSON remains unchanged.

The avatar migration creates the public `amordle-public-avatars-v1` bucket
with a 6 MiB object limit and PNG, JPEG, WebP, and GIF MIME allowlist. SVG and
arbitrary binary files are excluded. Writes and deletes require authenticated
object ownership and random UUID paths; direct anonymous metadata listing is
not granted. Public profile output contains only the public image URL, not the
Storage owner, Auth UUID, or email.

## Delivered experience

### Active Solo continuity

- Practice supports three independent active OG sessions and three independent
  active GO sessions.
- Daily supports one active OG and one active GO session for the applicable
  date.
- Stable UUID session identities, owner namespaces, deterministic recency,
  explicit abandon, terminal removal, Daily rollover, and legacy single-save
  migration are enforced by the existing local/cloud progress authority.
- Home and `/play/solo` show compact active-session summaries with exact resume
  URLs. A new game is rejected gracefully at the category limit without
  overwriting another session.
- Guest state remains device-local; account state remains account-scoped and
  reconciles through the existing versioned progress envelope. No Solo schema
  migration or new HTTP interface was required.

### Feedback and settings

- Five restrained code-generated keyboard sound profiles are available in
  Settings: Terminal, Soft tap, Mechanical, Glass, and Low thock.
- Web Audio is resumed only from a user gesture and fails silently when the
  browser or output device cannot play sound.
- Physical and on-screen input use the same selected profile; muted input
  creates no cue and no rejected/no-op input plays a sound.
- Touch haptics are opt-in, short, touch-only, capability-detected, suppressed
  with reduced effects, and a no-op on unsupported browsers and desktop.
- Guest preferences remain device-scoped; signed-in preferences synchronize
  through the newly authorized account columns.

### Public avatar upload

- The existing public HTTPS image URL remains supported.
- Signed-in players may alternatively select a local PNG, JPEG, WebP, or
  animated GIF up to 6 MiB, 4096×4096 pixels, and 16.8 megapixels.
- File signatures must agree with the declared MIME type. SVG and malformed
  data fail closed.
- Still images are decoded and re-encoded client-side to remove metadata;
  animated GIF bytes remain intact.
- Upload preview, replacement, removal, cache-busting, broken-image fallback,
  failed-profile-save cleanup, and orphan retry behavior are implemented.
- Quota or network failure does not affect gameplay and does not trigger a paid
  upgrade or vendor fallback.

### Mobile and data freshness

- Both terminal-menu frame edges render at 320, 360, 390, and 412 px.
- A completed Solo, Daily, GO, or COMBAT result may receive initial focus, but
  normal page scrolling can always return to the board and accepted guesses.
  Active-game gameplay-first containment remains unchanged.
- History, Stats, Leaderboards, progression/economy, Home attention, active
  Solo, and Active COMBAT invalidate after relevant mutations and reconcile on
  route entry. Static data routes do not poll continuously.
- Query keys remain account-scoped, preventing stale cross-account cache reuse
  or duplicate settlement.

## Acceptance receipts

The complete local stack passed:

- `pnpm check`
- `pnpm test:domain`: 98 passed
- `pnpm test:browser`: 17 passed
- `pnpm test:e2e:fixture`: 17 passed across Chromium, Firefox, and WebKit
- `pnpm test:visual`: 11 passed
- `pnpm test:acceptance:local`: passed

The complete hosted command `pnpm test:acceptance` passed against the exact
protected Preview application commit:

- 17 fixture journeys across Chromium, Firefox, and WebKit;
- 2 serial real-service journeys;
- 11 visual/responsive journeys;
- 237/237 functional clauses acceptance-verified;
- 73/73 multiplayer audit clauses remain proven.

Hosted evidence additionally proved public avatar upload/read, owner mutation,
cross-account deletion denial, synchronized Mechanical sound plus haptics,
legacy settings-JSON preservation, signed-in Solo completion and History
continuity, accent isolation, public community projections, ranked Practice,
all four Daily COMBAT lanes, and existing private/spectator boundaries.

Invariant receipts:

- bootstrap: 107/107;
- migrations: 45/45 immutable plus 6/6 authorized additive;
- word assets: 34/34 and 6,097,886 deployment bytes;
- HTTP interfaces: exactly 3;
- Home bundle: 189,032 B compressed JavaScript and 21,503 B CSS;
- gameplay bundle: 194,077 B compressed JavaScript and 25,870 B CSS;
- Home requests no word bank; gameplay and Word Explorer load only the selected
  length.

## Cleanup receipt

Run `e2e_20260801T223654814Z_8a530fa9_f2ef9987` completed cleanup on attempt 1:

- 1 disposable avatar object removed and its public object residue verified at
  zero;
- 25 accent-preset records removed;
- 3 disposable Auth users removed;
- 7 games, 3 ranked Practice queue records, 3 ranked Daily queue records, 1
  private request, and 1 rematch request removed;
- all game, action, result, authority, reservation, rating, History,
  progression, economy, profile, settings, preference, preset, Storage, and
  Auth probes returned zero.

The preceding intentionally aborted hosted run also cleaned its one avatar
object and three disposable users on attempt 1 with zero residue.

Status: `zero-residue`.

## Preserved boundaries and rollback

- Production remains Ready at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- The private default branch remains unchanged.
- No merge, Production release, default-branch change, Vercel project-setting
  change, paid service, real-account deletion, bucket deletion, or down
  migration occurred.
- Existing visible E2E profiles were not deleted.
- Game rules, ratings, matchmaking, word authority, Word Explorer, public
  community behavior, and the locked BRRRDLE-DEV shell were preserved.
- Code rollback is a forward revert to the v6.3 application candidate
  `35597069a5852a0f42017b0e995f98b5c15cbf83` or intake checkpoint
  `762b0fc2257e24eaab7c6f75664b592a92c7b6aa`.
- Database or Storage correction, if ever required, is forward-only. The public
  avatar bucket is not destructively removed without separate authorization
  and proof that no real-player object exists.

## Manual review gate

Review the protected Preview with the paired checklist. Any merge or Production
release requires separate authorization.
