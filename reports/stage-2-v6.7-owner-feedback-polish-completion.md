# Amordle Stage 2 v6.7 — Owner Feedback Polish and Ranked Leaderboard Repair

## Outcome

v6.7 resolves all twelve annotated owner-feedback requirements from the 2026-08-04 review
and the complete eleven-item whole-product findings register. It is green on a protected
Preview with zero service residue.

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Owner-approved rollback checkpoint: `16d7a510a15ab5eaf254bc2c163f77b9059854cc`
- Application candidate: `0fbcb4d83532901c32d8db12850f4679f3582500`
- Deployment: `dpl_AL4UNa59TdXhmMn8ek2rBu6oMGrR`
- Protected Preview: <https://amordle-gghpij2o3-ryanjosephkamps-projects.vercel.app>
- Hosted run: `e2e_20260806T024758627Z_2c6980ca_30d0b6d8` (after the W-11 migration)
- Status: ready for owner review; **not merged, not released to Production**

The authorized ranked-leaderboard migration (`W-11`) has been replayed locally, applied
to the database, and verified against the remote schema. **Two items remain open and are
stated in full under Open items.**

## Mandatory owner requirements

### ANNOT-03, ANNOT-04, ANNOT-07, ANNOT-09 — one light-surface foreground authority

Root cause was a single cascade bug, not four defects.
`.data-row > :last-child:is(button, .button) { color: inherit }` in `tui-shell.css`
carried specificity (0,3,0) and therefore outranked `.button.primary` (0,2,0) and
`button:hover` (0,1,1). Every control in a data-row value cell kept painting the
`--terminal-selected` surface while discarding its ink. In the dark scheme that surface
is a near-white, which is why `/play` "Set up Solo" rendered white-on-white — measured
**1.03:1** — and Active Solo "resume" rendered grey-on-white.

Contextual value-cell muting now lives in a `context` cascade layer, so unlayered
control-state rules win regardless of specificity, and the two `color: inherit` patches
are deleted. The selected-surface foreground is centralized as
`--control-ink-on-selected` across all 17 sites, which is the token the owner identified
on Profile.

The replacement contrast sweep then exposed a **second, mirror-image class** the plan had
not predicted: four rules reset the hover surface to transparent without resetting its
ink, leaving dark ink on a dark background across `/auth`, `/calendar`, `/words`, and
`/leaderboards` — `/auth` "CREATE ACCOUNT" measured **1.01:1** — across 1212 state
combinations. Surface and ink are now always paired. Current appearance was preserved
(the ink was corrected) rather than letting hover paint new surface fills.

Sweep result: **753 → 1212 → 0** failures.

### ANNOT-01 — Notifications

`.menu-popover a { display: block }` shares specificity with globals'
`.notification-list a { display: grid }` and won only on source order, so status and
timestamp collapsed into one inline run with no separator at all —
`Match ready8/2/2026, 4:40:46 PM`. Status, local date, and local time are now three
aligned grid columns with tabular figures and machine-readable `<time dateTime>`,
collapsing to two rows below 47.99rem. The unread marker moved onto the status cell,
since a `::before` on a grid container becomes its own grid item.

### ANNOT-02 — Active Solo

The desktop collection used the generic `.data-row`, so lane, mode, length, difficulty,
Hard Mode, accepted count, and GO progress rendered as one concatenated inline run. It
now reuses the accepted `.responsive-table` primitive already used by History, Help, and
Leaderboards — Lane / Mode / Setup / Progress / Actions — collapsing to labelled rows on
mobile with no new CSS. Session semantics, resume targets, abandon, and the conflict
notice are unchanged.

### ANNOT-05 — Players filters

`.directory-controls` was absent from the shared control-geometry rule, so selects and
Apply took 2.75rem while `input[type=search]` and `input[type=number]` kept their UA
intrinsic height: **16.375px versus 44px**. All six controls now share one block-size and
one baseline per rendered row.

### ANNOT-06 — Ranked lane identity and Stats

Two independent defects.

_Lane identity._ Private Stats reads `multiplayer_rating_profiles` directly, which stores
**storage** buckets (`async:og:amordle:v2`), while `ratingBucketLabel` only knew **app**
buckets (`multiplayer:og`) and fell through to a generic "Ranked COMBAT" for everything
else. `resolveRatingLane` now mirrors the database authority exactly, including pre-v2
keys and the two timed lanes the public label set never had. Scope, mode, and clock render
as separate labelled facts. An unrecognized key reports itself as unrecognized and
surfaces the raw bucket rather than collapsing into a plausible-looking label. Vectors
read the storage buckets straight out of the migration's own check constraint.

_Stranded width._ `.rating-bucket-grid` was the only full-bleed child of the four-column
`.stats-metrics` that never claimed `grid-column: 1 / -1`, so it rendered at a quarter
width and left three empty columns.

_Visualization._ A ranked rating trajectory built only from durable History rows that
already carry a rating delta — no new request, no fabricated series. It plots cumulative
change rather than absolute Elo, because History records the delta a result produced and
not the rating it produced; inventing a baseline would be fiction. Nothing is interpolated
or smoothed, fewer than two points renders the number instead of a line, and the chart
carries a complete textual equivalent plus forced-colors and print handling. Code-native
SVG; no chart dependency was added.

### ANNOT-08 — One dialog contract

Tailwind v4 preflight applies `margin: 0` to `*` and `::backdrop`, cancelling the
`margin: auto` the UA `dialog:modal` rule relies on for centring. With `inset: 0` still in
force the dialog pins to the top-left corner. `.accent-preset-dialog` and
`.word-detail-dialog` happened to restore `margin: auto` individually;
`.account-action-dialog` did not, which is exactly why only Change Email, Change Password,
and Danger Zone were mispositioned.

`.app-modal` is now the single geometry authority. `src/application/modal-dialog.ts` is
the single dismissal policy: outside-click detection compares the pointer against the
dialog's own box rather than relying on `target === currentTarget` alone; keyboard
clicks (detail 0) are never outside clicks; dismissal is suppressed while an operation is
pending so a submitted change cannot be lost; and a reference-counted body scroll lock
compensates for browsers not locking background scroll on `dialog:modal`.

Anchored menus, tooltips, disclosures, and the inline confirmation panels are unchanged —
they already satisfied outside-click and Escape and are not dialogs.

### ANNOT-10 — Sign-in destination

No auth path navigated after sign-in, and no `returnTo` mechanism existed anywhere, so
there was no deliberate destination to preserve. `signIn`/`register` now report whether a
session was actually established, because they resolve normally on a rejected credential;
without that the redirect would fire on failure and hide the error. Registration awaiting
email confirmation and the recovery flow are deliberately not redirected.
`/auth/callback` keeps an explicit action, now pointing Home.

### ANNOT-11 — Account trigger label

Resolved through pure, vector-covered logic: player name, then a bounded 10-character
email local part once the profile lookup has settled, then `guest` when signed out, and a
neutral `account` while a transition is in flight so switching accounts cannot flash the
previous identity. The email fallback is owner-only and strictly narrower than the full
address the account popover already showed. It reuses the root profile query key and
staleTime, so it adds no request and cannot read another account's cache. Width-bounded
and ellipsized; toolbar containment and zero document overflow asserted 320–1920.

### ANNOT-12 — Definition names its word

`WordDefinition` showed the word only while a lookup was pending, so a settled definition
rendered a gloss with no word. Fixed at the single choke point rather than at the five
call sites, making the invariant global — including the ranked COMBAT forfeit path.

This cannot widen answer disclosure: `word` is already the authorized value passed by a
caller that has cleared its own reveal guard, and it was already used for the lookup
request itself. A counter-test asserts the component looks up and caches only the single
word it was given.

## Findings register

| #        | Finding                                                                    | Disposition                                                                                             |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| W-1      | `--line-strong` undefined; `/help` disclosure lost its border              | Fixed; `verify:css-tokens` added to `pnpm check` so a fallback-less undefined `var()` cannot ship again |
| W-2      | `.status-line` base class undefined; degraded banners unstyled on 4 routes | Fixed                                                                                                   |
| W-3      | `.notification-source-warning` had no CSS                                  | Fixed                                                                                                   |
| W-4      | Contrast guard sampled one element and could not see the defect            | Replaced with the exhaustive sweep                                                                      |
| W-5      | Leaderboards exposed 2 of 4 public lanes                                   | Fixed — frontend only; the RPC always accepted all four                                                 |
| W-6      | Public profile projection withholds timed lanes                            | Honoured; leaderboard keeps that boundary                                                               |
| W-7      | Inline confirmations announced `role="dialog"` without focus               | Fixed to `role="group"`                                                                                 |
| W-8      | Disabled controls below the 3:1 floor                                      | Fixed via `--control-disabled-opacity`                                                                  |
| W-9      | `auth.status === 'loading'` conflated hydration with submission            | Fixed with local form state; shared coordinator untouched                                               |
| W-10     | Supabase CLI is a devDependency; `which supabase` misleads                 | Recorded in `CONTINUITY-LOG.md`                                                                         |
| **W-11** | **Leaderboard queried dead pre-v2 rating buckets**                         | **Migration written and registered; NOT applied — see Open items**                                      |

## Evidence

Local: `pnpm check` (107/107 bootstrap baseline, 45/45 immutable and 8/8 authorized
additive migrations, word authority, keyboard manuals, boundaries, MP audit 73/73, parity
237/237, three HTTP interfaces, CSS tokens, bundle budgets), 137 domain, 27 browser, 20
fixture E2E, 20 visual.

Hosted (`e2e_20260806T024758627Z_2c6980ca_30d0b6d8`, run against the repaired
leaderboard function): 20 fixture, 3 service, 20 visual, parity 237/237
acceptance-verified. An earlier run `e2e_20260806T013802070Z_0fbcb4d8_fae940c4` was green
against the unrepaired function and is superseded by this one.

Cleanup: attempt 1, status `zero-residue`. 6 Auth users, 7 games, 7 queue requests, 25
accent presets, 2 storage objects removed; 25 residue probes plus Auth residue all zero.

Leaderboard lanes verified hosted: all four accepted lanes resolved; the Daily OG lane
returned 2 rows, each resolving to the requested bucket rather than the null bucket the
stale mapping produced.

## Ranked leaderboard repair (W-11)

`20260805200000_amordle_ranked_leaderboard_bucket_repair.sql`
(SHA-256 `5093ce9326258c4d2eb647b7a422a59e900e8d46171e7fe8bc2d21ee517aaa3b`) is applied.

- **Replay:** `supabase db diff --linked` provisioned a fresh shadow database and applied
  all 53 migrations in order without error, including this one.
- **Dry-run scope:** `migration list --linked` showed exactly one pending migration and
  zero remote-only drift, before and after.
- **Applied:** `supabase db push --linked` applied exactly that one file. Migrations are
  now **53 synchronized**, comprising 45 immutable and 8 authorized additive.
- **Verified on remote:** a schema dump confirms the deployed function maps
  `multiplayer:og -> async:og:amordle:v2` and `multiplayer:go -> async:go:amordle:v2`,
  with the reverse map and the row filter updated and no remaining `'async:og'` /
  `'async:go'` literals.
- **Unchanged:** function signature, grants, and the `_v2` wrapper; no column, table,
  role, or RLS policy was touched. Edge Function `account-lifecycle-v1` remains ACTIVE at
  version 1 with JWT verification.

## Open items

**1. W-11 has no end-to-end settled proof.** The hosted suite settles a _timed_ ranked
Practice match (a lane deliberately excluded from leaderboards) and a ranked Daily match
(whose mapping was already correct). Proving the untimed ranked Practice mapping needs a
new untimed two-player settlement flow. The hosted assertions therefore prove lane
resolution and non-null bucket resolution, not the repair itself, and say so explicitly in
the test.

**2. `verify:budgets` is not measuring.** It passes while reporting `home 0B JS/0B CSS;
game 0B JS/0B CSS`, so the route-bundle gate is effectively vacuous. Pre-existing and
outside this cycle's authorized scope; left untouched and reported rather than silently
widened.

## Boundaries preserved

The 45 immutable migrations, the 107-file bootstrap baseline, exactly three HTTP
interfaces, the locked BRRRDLE-DEV shell, the default branch, and Production
(`dpl_739mtwiXc9pZPef3pxsKumwC9DfG`) are all unchanged. No new vendor, dependency, paid
capability, or chart library was added. No real player or Auth data was deleted. No
secret, raw Auth identifier, unsolved answer, or private player datum entered source,
logs, reports, or evidence.
