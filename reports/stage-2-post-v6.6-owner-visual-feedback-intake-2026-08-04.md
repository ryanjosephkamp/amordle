# Amordle Stage 2 — Post-v6.6 Owner Visual Feedback Intake

## Purpose and authority

This artifact records the owner’s August 4, 2026 annotated review of the
protected Amordle build. It is an evidence-intake and planning source, not an
implementation authorization. The twelve supplied screenshots remain the
primary visual evidence; this document preserves their annotations in
searchable, reviewable form and translates them into bounded planning
requirements without inventing behavior that was not requested.

No application, service, database, Storage, Auth, Vercel, Production, GitHub,
or player-data mutation is authorized by this intake. The owner explicitly
said that another checkpoint is unnecessary at this stage.

Repository state verified when this intake was prepared:

- Repository: `ryanjosephkamp/amordle` (private)
- Workspace: `/Users/noir/Documents/amordle-final`
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Head: `16d7a510a15ab5eaf254bc2c163f77b9059854cc`
- Tree: `a4a3a5a130d21d72444e60e09de4d7c30e4f5152`
- Golden tag:
  `amordle-stage2-v6.6-account-controls-combat-stats-responsive-golden-2026-08-02`
- Protected Preview recorded by the v6.6 completion report:
  `https://amordle-j0a0ycuc0-ryanjosephkamps-projects.vercel.app`
- Preview deployment recorded by the v6.6 completion report:
  `dpl_526Pf8MBtD2GionGGuX7y5ViyuGf`
- Frozen Production deployment:
  `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`
- Recorded database authority: 52 synchronized migrations, comprising the 45
  immutable baseline migrations and seven separately authorized additive
  migrations
- Recorded acceptance authority: 237 functional clauses, 73 multiplayer audit
  clauses, 107 immutable bootstrap files, and exactly three application API
  routes
- Working tree: clean before these intake artifacts were created

All identities are drift-prone and must be revalidated before planning or
execution.

## Source evidence ledger

All source images are outside the repository and were inspected at original
resolution. Paths and hashes are recorded to prevent screenshot substitution
or accidental ambiguity.

| ID    | Screenshot                                                                       | SHA-256                                                            | Surface                                |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| SS-01 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.07.39 PM.png` | `c20730f117993bdb06b2e18deea87684fde285d2795b8a4285e887a14a4c7146` | Notifications popover                  |
| SS-02 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.28.20 PM.png` | `a6e67c09715e272e0aa4a34d0206b47c858fba5c7a0ebc461565aff41dc0312f` | Solo setup / Active Solo               |
| SS-03 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.31.03 PM.png` | `7e245ad11f5d6d1f4d247eb3eda98b3d6c97f5b02a62fa3aacf0c7355ccaa355` | Active Solo button contrast            |
| SS-04 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.33.00 PM.png` | `bfc8e73841770d0a1a95768fa2a64ecbb526d748e2f3af8a5cfafd58e5a51074` | Choose how to play                     |
| SS-05 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.34.32 PM.png` | `07217441f1585932b2782df1b94622d8325eae2b8d39d29c21293dbd7ae9adc8` | Players filters                        |
| SS-06 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.38.15 PM.png` | `946162a72911ee348c4bd59e359b0136c72249b35aad33179a0bb44c69fbea13` | Stats                                  |
| SS-07 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.43.24 PM.png` | `482f32300009b5985ce9d4a8ca9577aef296fe64416b0b2d127f41f4305168d9` | Marketplace                            |
| SS-08 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.45.09 PM.png` | `db0bed3b0f5efec4522cd366e0ceb767def2297c86e6a8e0dda9991dbb0b3216` | Settings dialogs                       |
| SS-09 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.50.53 PM.png` | `37d980fa3ec684c36bbd07684e184be82f7ed4db745fc36de68076dbf3646fd4` | Profile / canonical light-surface text |
| SS-10 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.55.42 PM.png` | `f52e44c2bc3e48a75e51d8d44af612da44a01b57a7d15a164419f905cc04cbb3` | Successful sign-in destination         |
| SS-11 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 3.58.14 PM.png` | `12755b977277555278a477c19ae21c2db0a5ba0804281da870b82892a91febab` | Account navigation label               |
| SS-12 | `/Users/noir/Desktop/amordle-2026-08-04/Screenshot 2026-08-04 at 4.09.36 PM.png` | `76f0f93aa21b3de201103cc623689842c1a35bd451f09b77209b76c6b6481aeb` | COMBAT terminal definition             |

The source filenames contain a narrow no-break space before `PM` on disk. The
display paths above use an ordinary space for readability; the hashes identify
the exact files.

## Exact annotation transcription and normalized requirements

### ANNOT-01 — Notifications desktop alignment

Source: SS-01.

> Notifications text spacing issue on desktop view:
> Please add a bit more space/separation between match status (e.g., “Match
> ready”, “Your turn”, etc.) and the date (e.g., “8/2/2026”).
>
> We could even align these into a more tabular looking format, such that the
> statuses are always aligned, the dates are always aligned, and the times are
> always aligned.

Planning requirement: create a legible desktop notification-row structure with
distinct status, date, and time columns or an equivalent aligned layout. Retain
responsive mobile behavior, notification routing, read state, and the `Mark all
read` action.

### ANNOT-02 — Active Solo desktop information architecture

Source: SS-02.

> On desktop:
> This looks too crowded and not quite polished enough.
> This “active solo” table content is poorly aligned or structured.
> We absolutely need to fix it.

Planning requirement: redesign the desktop Active Solo collection into a clear,
consistent, scannable structure. Session identity/progress and Resume/Abandon
actions should align predictably without making the accepted mobile layout or
session semantics worse.

### ANNOT-03 — Active Solo light-button foreground

Source: SS-03.

> Grey on white is still hard to read.
> Please improve readability.
> We can use a darker grey or black or something.

Planning requirement: use the established high-contrast dark foreground for
light button surfaces, including the Active Solo Resume buttons. Disabled state
must remain visibly disabled without becoming unreadable.

### ANNOT-04 — Choose-how-to-play white-on-white defect

Source: SS-04.

> wtf, this is literally white text on white background…
> impossible to read!
> please fix this immediately

Planning requirement: repair the light `set up solo` action and treat this as
evidence of a systemic light-surface contrast defect, not an isolated copy
change.

### ANNOT-05 — Players filter control heights

Source: SS-05.

> These rectangular boxes (“Player name”, “Rating lane”, “Minimum rating”,
> “Maximum rating”, “Sort”) and buttons (“apply”) should all be the same height.

Planning requirement: normalize the visual height and baseline alignment of
the Players directory filter inputs, selects, and Apply action while preserving
labels, touch targets, focus rings, responsive wrapping, and form behavior.

### ANNOT-06 — Serious Stats overhaul

Source: SS-06.

> We need to do a serious overhaul on the Stats page.
>
> First, I want better visualizations.
> These bars/meters/etc. are insufficient. We can keep some of them, but we
> need actual graphs, charts, and other relevant content to truly visualize the
> stats in a cool way.
>
> Second, I don’t really know why some content spans the full width of the page
> while other content doesn’t here.
> Specifically, the ranked ratings info has a bunch of blank space to the right
> of it.
>
> Also, the ranked ratings should show Elo and stats for all of the different
> ranked game modes; I can’t currently tell from here whether the ranked ratings
> info is for ranked OG, ranked GO, or whatever

Planning requirements:

- perform a substantive Stats information-design and visualization overhaul;
- retain existing bars only where they remain useful;
- add truthful graphs, charts, and other relevant visual explanations grounded
  exclusively in durable or explicitly pending repository-authorized data;
- normalize section widths so Ranked Ratings does not strand unexplained blank
  space;
- show every actual ranked rating bucket available to the current account and
  label its lane/mode/variant unambiguously;
- audit current rating projection authority before deciding which buckets
  exist—do not invent missing ratings or fabricate time series;
- retain exact textual equivalents, keyboard/touch access, forced-colors and
  reduced-motion support, print readability, responsive containment, and
  existing privacy boundaries.

### ANNOT-07 — Marketplace white-on-white defect

Source: SS-07.

> There’s more white font on white background!
> This is impossible to read!
> Please fix this everywhere in the site so that we never, ever, EVER have
> white on white like that.

Planning requirement: include Marketplace purchase actions in a complete
sitewide audit of light button and selected-surface contrast.

### ANNOT-08 — Centered, consistently dismissible dialogs

Source: SS-08.

> Settings on desktop:
>
> The “change email”, “change password”, and danger zone popovers all appear in
> the upper left corner of the page.
>
> This is not consistent with the other Profile popovers (e.g., configuring
> accent colors, etc.) that appear in the center of the page.
>
> All popovers like these should appear in the center of the page.
>
> Additionally, to close these popovers, the player should be able to click the
> “x” button in the top right (like they currently can) OR they can simply click
> outside of the box.
>
> I want all popovers across the entire site to have that same policy, where
> clicking outside of the popover box will automatically close the popover.

Planning requirements:

- center modal/dialog-like surfaces, including Change Email, Change Password,
  and Danger Zone confirmation flows;
- keep the close button and add safe backdrop/outside-click dismissal;
- audit every overlay primitive across the site so equivalent dialogs follow
  one policy;
- distinguish true dialogs from anchored menus, tooltips, and disclosures rather
  than moving every overlay to the viewport center blindly;
- preserve Escape dismissal, focus containment/restoration, screen-reader
  semantics, mobile containment, and the high z-index overlay contract;
- define safe behavior for destructive or in-progress actions so backdrop
  dismissal never causes an ambiguous mutation or loses a submitted operation.

### ANNOT-09 — Canonical foreground for every light button

Source: SS-09.

> On the Profile page:
>
> Look at the dark/black font color that you’re using for these accent color
> (e.g., “Amber”) and “save profile” texts when the button background is
> light/white.
>
> This is the PERFECT dark font color to use for button text where the
> background is light/white like that.
>
> So, please carefully inspect all site pages and then ensure that instead of a
> light grey or some other color, we are always using this same exact dark/black
> font color for text within buttons with light/white backgrounds.

Planning requirement: treat the existing Profile selected-accent and Save
Profile foreground as the visual authority for light/white button surfaces.
Centralize that color through the design-token/control system and verify every
route, state, accent, and descendant label rather than patching screenshots one
at a time.

### ANNOT-10 — Successful sign-in goes to Home

Source: SS-10.

> When I sign in to an account, this is the type of page that appears.
>
> I actually would prefer that we have the game automatically go to the home
> page, rather than to this page, upon successful player sign in.
>
> That way, the player doesn’t have to manually go to the home page or to some
> other site page in order to do what they actually want immediately after
> sign-in.

Planning requirement: make Home the default destination after successful
interactive sign-in. Audit intentional `returnTo`, protected-route, recovery,
verification, and deep-link flows before specifying the exact redirect policy;
do not break a safe explicit destination merely to force every Auth transition
to Home.

### ANNOT-11 — Account navigation label reflects the player

Source: SS-11.

> I want to replace the “account” text in the account button at the top of the
> site with the signed-in player’s player name. For this specific example
> account here, that would replace “account” with “ragnar”.
>
> If a player is signed out, then this should say something like “guest”.
>
> This would make it very clear that the player is signed in at any time and on
> any page of the site.
>
> Perhaps if the player hasn’t configured their own player name yet, we can just
> show the first several (you choose the exact number) characters of the
> account’s email address, e.g., for a private address, this could be
> “ragnargran…” or something, so that we don’t have spillover and so that the
> button doesn’t get ridiculously big.
>
> Please use your best judgment about this.

Planning requirements:

- signed in with a configured player name: show the player name;
- signed out: show a concise guest label;
- signed in without a player name: show a privacy-conscious, bounded email-derived
  fallback only after auditing existing account/profile authority;
- prevent toolbar growth, collision, or horizontal overflow at all responsive
  widths and zoom levels;
- expose an appropriate full accessible name without leaking identity into
  public projections, logs, or unrelated users’ browsers;
- handle initial hydration, profile edits, account switching, stale profile
  reads, and failure fallbacks without flashing another account’s label.

### ANNOT-12 — Definition areas must name the word

Source: SS-12.

> I forfeited this ranked COMBAT match.
> Notice how the actual solution isn’t shown below the gameplay area, but its
> definition is…
> We need the actual solution to be shown alongside all definitions that are
> shown, across the entire game—across all game types, etc.
>
> The rule should be that if a player is shown a definition of a word, then the
> word itself must also always be shown in the same definition area.

Planning requirement: establish and test a global rendered-definition
invariant: whenever Amordle is authorized to render a word’s definition, that
same definition area also names the word. Apply it to every result/game type and
terminal reason, including ranked COMBAT forfeits. This does **not** authorize
early answer disclosure: a word may appear only when the definition itself is
already permitted by existing answer-reveal and privacy authority.

## Consolidated workstreams

### A. Global light-surface contrast

ANNOT-03, ANNOT-04, ANNOT-07, and ANNOT-09 are one systemic requirement. The
next plan should trace the selected/primary/disabled/hover/focus token cascade,
component variants, nested muted text, custom accents, and route-specific CSS.
The existing Profile dark foreground is the requested source of truth.

Acceptance should require at least 4.5:1 for ordinary control text and 3:1 for
meaningful borders, large text, icons, and focus indicators; disabled controls
must remain readable and unmistakably disabled. Forced colors must defer to
system colors. Semantic game evidence colors remain unchanged.

### B. Desktop information density and control rhythm

Notifications, Active Solo, and Players filters need consistent alignment and
visual rhythm. Planning should favor semantic grid/list/form structures that
collapse gracefully rather than fixed pixel positioning.

### C. Stats as an accurate visual analytics surface

The Stats request is larger than cosmetic polish. The next plan must first map
available durable sources, bucket identities, sample sizes, missing/partial
states, and privacy boundaries. It should then select chart forms that explain
real relationships. A new chart dependency is not presumed; code-native SVG,
CSS, and semantic HTML remain preferred unless repository evidence supports a
different decision.

### D. One dialog contract

The next plan should define which overlays are modal dialogs, anchored menus,
nonmodal popovers, tooltips, or disclosures. Equivalent modal dialogs should be
centered and share close-button, safe backdrop, Escape, focus, scroll-lock,
z-index, mobile, and pending-operation behavior. Account and navigation menus
should remain anchored unless the audit proves that they are actually dialogs.

### E. Identity-aware Auth and shell behavior

Successful sign-in and the Account toolbar label share account hydration and
route-transition concerns. The plan must prevent cross-account cache reuse,
identity flashing, redirect loops, and lost deliberate destinations.

### F. Definition/answer privacy invariant

Every definition renderer and caller must be audited. The display invariant is
global, but it may not widen the answer-disclosure boundary. Tests must prove
both sides: the word is always present with an allowed definition, and no
unrevealed answer becomes visible because of this change.

## Traceability matrix

| Requirement | Evidence | Planning owner area            | Primary acceptance signal                                                  |
| ----------- | -------- | ------------------------------ | -------------------------------------------------------------------------- |
| ANNOT-01    | SS-01    | Notifications presentation     | Status/date/time are separable and aligned without overflow                |
| ANNOT-02    | SS-02    | Active Solo presentation       | Desktop list is scannable; actions align; mobile remains usable            |
| ANNOT-03    | SS-03    | Global control tokens          | Resume text is dark and readable on light surface                          |
| ANNOT-04    | SS-04    | Global control tokens          | Set-up action has no white-on-white state                                  |
| ANNOT-05    | SS-05    | Players filters                | All filter controls/actions have equal visual height                       |
| ANNOT-06    | SS-06    | Stats projections and figures  | Real, labeled charts; all authorized rating buckets; no blank-width defect |
| ANNOT-07    | SS-07    | Global control tokens          | Marketplace action has no white-on-white state                             |
| ANNOT-08    | SS-08    | Overlay/dialog primitives      | Dialogs centered and safely dismissible outside/X/Escape                   |
| ANNOT-09    | SS-09    | Global control tokens          | Profile dark foreground becomes sitewide light-button authority            |
| ANNOT-10    | SS-10    | Auth routing                   | Ordinary successful sign-in reaches Home                                   |
| ANNOT-11    | SS-11    | App shell/account hydration    | Player/guest/fallback label is correct, bounded, and accessible            |
| ANNOT-12    | SS-12    | Definition/result presentation | Every allowed definition visibly names its word; no early answer leak      |

## Repository questions the Plan-mode audit must resolve

The screenshots do not answer these questions; the repository and governing
contracts must:

1. Which control variant or descendant selector produces the remaining
   light-on-light states, and which routes reuse it?
2. Which notification structure and breakpoint currently concatenate status,
   date, and time?
3. Which Active Solo fields are authoritative and safe to display, and what
   responsive structure best represents them?
4. Which shared field/button primitives own Players filter heights?
5. Which durable Stats sources and exact ranked bucket keys exist today? Are
   absent buckets truthfully absent, uninitialized, or hidden by projection/UI?
6. Which visualization primitives already exist, and can they support the
   requested overhaul without a new dependency or fabricated history?
7. Which overlays are true dialogs versus menus, tooltips, and disclosures?
   Which destructive flows must block backdrop dismissal while a request is
   pending?
8. What is the current sign-in callback/`returnTo` authority, and which flows
   legitimately need to preserve an explicit destination?
9. What is the authoritative account-label fallback when profile loading fails
   or no player name exists, and how should the email-derived text be truncated
   without leaking more than the signed-in owner already sees?
10. Where is `WordDefinition` or equivalent rendered, and what terminal/reveal
    guard authorizes each call?

## Preserved boundaries and non-goals

- This intake does not authorize implementation, commits, pushes, deployments,
  migrations, Supabase/Vercel changes, Auth or Storage operations, or test-data
  creation.
- Do not change game rules, scoring, evidence semantics, answers, word lists,
  matchmaking, rating algorithms, economy prices, persistence envelopes, or
  settlement behavior unless a demonstrated defect makes a narrow change
  unavoidable and the later plan identifies it explicitly.
- Do not broaden public identity or answer projections.
- Do not redesign Word Explorer, COMBAT gameplay, Profile data semantics,
  Players ranking semantics, or the terminal/TUI shell beyond the requested
  integration work.
- Existing visible E2E profiles are not deletion targets.
- The default branch, Production, real accounts, the locked BRRRDLE-DEV shell,
  immutable migrations, and provider configuration remain outside scope.
- No new migration, public API, paid capability, vendor, or chart dependency is
  authorized or presumed.

## Recommended later implementation order

1. Revalidate identities and map all twelve requirements to actual source,
   contracts, and tests.
2. Add failing contrast, layout, Auth-label/redirect, dialog, Stats, and
   definition-privacy regressions.
3. Repair global light-surface tokens and shared control geometry first.
4. Repair Notifications, Active Solo, and Players layouts.
5. Standardize dialog primitives and dismissal behavior.
6. Implement bounded Auth redirect and account-label behavior.
7. Enforce the definition/word invariant without widening disclosure.
8. Complete the source-grounded Stats overhaul last among implementation
   slices so visualization choices follow the verified data map.
9. Run the complete local stack, deploy the exact green commit to a protected
   Preview, execute bounded hosted acceptance, clean disposable resources, and
   reconcile parity/evidence/reports only after separate execution
   authorization.

## Companion artifacts

- Mobile-friendly, script-free reading view:
  `reports/stage-2-post-v6.6-owner-visual-feedback-intake-2026-08-04.html`
- Copy-ready Plan-mode alignment prompt:
  `reports/stage-2-post-v6.6-owner-visual-feedback-plan-mode-prompt-2026-08-04.md`
