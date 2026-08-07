# v7.1 — refinement pass

Date: 2026-08-07
Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
Base commit: `4349cde` (the v7 design lock-in)
Revert point: `amordle-stage2-v7-frontend-design-elevation-golden-2026-08-06` → `4349cde`
Intake: https://claude.ai/code/artifact/cc6e128c-7afc-4272-add2-a93df51696ee

Six defects and ten copy changes from the owner's testing session on the v7 Preview.
No game mechanics, scoring or evidence colour semantics changed. **No migration was
needed** (see §2). Production untouched.

---

## 1. What the intake got wrong

Every claim in the intake was re-verified against source before any code moved. Four
were materially wrong, and each correction changed the work.

| Intake | Reality |
| --- | --- |
| A2 needs a server-supplied deadline | `turnStartedAt` already existed end to end — column (`…combat_v2.sql:252`), projection (`:863`), zod schema (`combat.ts:88`). `grep turnStartedAt src/` matched exactly one line: the schema. Nothing consumed it. |
| A1 turns on the status leaving `'pending'` | The DB has no `pending` and no `accepted`. Statuses are `requested\|created\|declined\|cancelled\|expired`; the adapter renames `requested → pending`. Accept writes `status='created'` plus `created_game_id`, and the polled row already carries it. |
| A3 is caused by cancelling | Cancel sets `status='cancelled'`; the row is never deleted and stays visible to both seats, and the controller already special-cases it. The reported panel is **not** the cancel path and remains unexplained. |
| B2 is a transparent-background fallback | Not reachable: `ProfileAccentBridge` sets `data-accent` and all fourteen variables in one synchronous effect, `layout.tsx` hardcodes `aurora` for SSR, and `accent_color` is zod-narrowed to the six named values. The 1.14:1 figure was a synthetic state. Two different, genuinely reachable failures were found instead. |

**A finding worth its own line.** `src/domain/clock.ts` existed, was unit-tested, and was
cited in `acceptance/parity-registry.json` and `acceptance/mp-v6-clause-audit.json` as
proof of MP-06.c/d — and **no source file imported it**. The real clock arithmetic lived
inline in `match-controller.tsx`, untested. The registry was pointing at a function the
app never ran. That is precisely why this defect shipped, and Phase 1 points the pinned
test at the code that actually executes.

## 2. A2 — the clock, and the timeout hole

**The display defect.** `timeRemainingMs` is the durable budget *as of turn start*: the
read RPC is `stable` and never debits a running turn. `ClockValue` measured elapsed time
from `game.serverNow` — the time of the last *fetch* — so every refetch re-zeroed it, and
`providers.tsx:182` `refetchOnWindowFocus: true` makes returning to the tab a refetch.

`src/domain/clock.ts` now exposes `readCombatClock`. The load-bearing property is that no
expression mixes clocks: server elapsed is `serverNow − turnStartedAt`, client elapsed is
`nowMs − observedAtMs` (React Query's `dataUpdatedAt`). The old code subtracted a server
timestamp from `Date.now()`, which made the reading a function of how far apart the device
and the server were.

> The browser test written against the old code returned **`0:00`**, not the `5:00` I
> predicted — because the fixture's `serverNow` sat a day from the machine's wall clock.
> Same root cause, larger blast radius than the report described.

**The timeout hole, and why no migration was written.** Tracing A2 surfaced that a player
who walks away on move sits at `0:00` forever. The owner authorised a forward migration to
close it. It turned out not to be needed: `save_amordle_combat_command_v2` already accepts
`'timeout'` as a valid command (`…combat_v2.sql:1907`), and the clock-materialisation
branch that declares the win runs **before** any turn check, so either seated player can
reach it. `TIMEOUT_PENDING` (`:2043`) is not "clients may not do this" — it is "the clock
has not run out yet". The only thing missing was the client: `saveCombatCommand`'s
TypeScript union omitted `'timeout'`.

So this shipped as a two-line client change plus a `CLAIM WIN ON TIME` control gated by
`canClaimTimeout`. **No migration, no bootstrap-baseline entry, no decision packet.**
Deliberately less than was authorised, for the same outcome at a lower risk.

## 3. B2 — two reachable AA failures, measured

The screenshots did not show either of these; measurement did.

| Surface | Before | After |
| --- | --- | --- |
| `.badge` (`background: var(--present)` + `color: var(--accent-ink)`) | **2.02:1** dark, 2.91:1 light | 9.86:1 / 6.84:1 |
| unread notification row, `#FFE066` | **3.82:1** dark | 4.61:1 |
| unread notification row, `#32BFA2` | **4.29:1** dark | 4.57:1 |
| unread notification row, `#FFFFFF` | **3.57:1** dark | 4.62:1 |
| unread rows already passing (4.73–5.80) | — | unchanged |

`.badge` violated DESIGN.md:110-112 directly — a semantic background wearing accent-derived
ink, which a custom accent flips to white by luminance. It now takes `--present-solid-ink`.

Unread rows keep their tint; only the ink moved, and only where it failed.
`--accent-soft-muted` is `--muted` for all six named accents and a `contrastSafeTint`
derivation for custom ones, computed against the surface it actually paints on, the way
the keyboard's `keyInk` already was. `#32BFA2` is the app's own default preview colour.

**Deliberately not done.** The keyboard's `.is-correct` / `.is-present` keys inherit
`--key-unknown-ink` rather than a per-state ink. It measures 9.27–13.02 across the entire
reachable space, and the keyboard is a surface the owner explicitly fenced off, so it was
left alone and recorded here rather than changed for tidiness. Likewise the sixteen bare
`var(--custom-*)` references keep no fallbacks: `scripts/verify-css-tokens.mjs:26-28`
documents that a fallback would mask the failure the check exists to detect.

## 4. B3 — not reproduced, mechanism found and closed

The mobile override at `tui-shell.css` is live below 47.99rem and grid items in distinct
cells cannot overlap. The new test (see §6) passes at 320/360/390/412/568/667 — positive
evidence the layout is correct in this build. The `8/6/26` vs `8/6/2026` difference is bare
`toLocaleDateString()` with no options: expected device variance, not evidence.

What was found is a dateable mechanism. `public/sw.js` hardcoded `CACHE = 'amordle-shell-v1'`
**and the file itself never changed bytes**, so the browser's update check never fired, the
worker never re-installed, and the `activate` purge that deletes old caches has never run.
It precaches five HTML documents and serves `/_next/static/` cache-first with no
revalidation. The notification grid fix (ANNOT-01) landed in `00620f4` on **2026-08-05**,
two days before the owner's session — so a device pinned to an older document is coherent
and dateable, even though it was not reproduced.

The cache key now derives from `NEXT_PUBLIC_BUILD_ID` on the registration URL, so a
different script URL installs unconditionally and purges the previous cache. The build id
is also stamped into the shell footer, so the next screenshot of a layout problem says
which release produced it.

## 5. A1, A3, B1

- **A1** — `rematchViewState` replaces a branch that collapsed five server states into one.
  The requester now gets a `JOIN REMATCH` link (a link, not a background redirect that
  takes the back button away), and declined/cancelled/expired say so instead of showing a
  bare button. Client-only; the id was already on the polled row.
- **A3** — `classifyServiceFailure` maps the code the client already had and discarded
  (`match.error` was never read, only `match.isError`) to seven kinds, each with its own
  copy, its own onward destination, and a retry **only** where retrying can succeed.
  `loadMatch` now preserves the primary error instead of flattening FORBIDDEN to NOT_FOUND,
  which had made the "private" wording unreachable. The panel prints
  `MATCH <id> · <KIND>` so the next report diagnoses itself.
- **B1** — JSX only. Both lobby lists already used the same type and the same RPC, and the
  owner identity was already in the payload. `practice-lobby.tsx` now uses
  `PlayerIdentityLink` and the `.open-lobbies` / `.lobby-row` primitives. Zero new CSS.
  Privacy holds through the component, which renders plain text without a sanctioned id.

## 6. Coverage gaps closed

- **The notification test was 1440-only and asserted `columns === 3`** — structurally
  incompatible with the two-column mobile rule, so it could never simply be re-run at a
  phone width. It now walks the desktop viewport plus all eight `gameViewports` and asserts
  **rect geometry**: pairwise intersection area zero for all three pairs, reading order,
  containment in the popover, then breakpoint-specific column and wrap expectations.
  Overlap was always the defect; column count was only a proxy.
- **The contrast sweep excluded custom accents** on the grounds that they need a signed-in
  account. They do not: `ProfileAccentBridge` only sets `data-accent` and fourteen
  variables, both of which a page script can do. Two new sweeps cover six hexes chosen to
  straddle `bestForeground`'s ink flip. A new `accentSurfaceSelector` covers `.badge`,
  `.attention-badge` and unread rows — accent-backed *surfaces*, which `controlSelector`
  never touched. That is the other half of why the sweep was blind.
- **New `tests/domain/accent-contract.test.ts`** enforces DESIGN.md:110-112 statically in
  milliseconds, and checks every generated custom-accent pairing across the hex space. The
  detector was verified to fire on the pre-fix `.badge` pairing and stay silent after.

## 7. Copy

All ten changes applied exactly as specified. `OG` / `GO` render as plain text per the
owner's decision — the app has no inline code treatment and none was invented.
`src/app/help/page.tsx` had to change shape: its `sections` array was `[string, string]`
rendered into a hardcoded `<p>`, and a `<ul>` inside a `<p>` is invalid HTML.

**Lists needed rules that did not exist.** Outside three bespoke teaching aids the app had
no list styling at all, and Tailwind's preflight sets `list-style: none` on every list — so
the first build rendered the numbered list on Home with **no numbers**. Caught by looking at
the page rather than by a test. Markers are restored, hang in the marker gutter, and take
`--accent-text`.

## 8. Verification

Full `pnpm test:acceptance:local` green on the untouched tree before any change, and green
again after.

| Suite | Baseline | Now |
| --- | --- | --- |
| domain | 137 | 144 |
| browser component | 27 | 29 |
| fixture e2e | 20 | 21 |
| visual e2e | 20 | 22 |
| parity · MP audit · APIs · bootstrap | 237 · 73 · 3 · 107/107 | unchanged |
| CSS custom properties resolved | 92 | 96 |

Bundle budgets: home 193,110 B JS / 22,422 B CSS; game 198,828 B JS / 26,781 B CSS — CSS
+263 B per route against the v7 baseline, all of it the prose-list and failure-panel rules.

## 9. Hosted acceptance

Green at `https://amordle-m9z9o6upl-ryanjosephkamps-projects.vercel.app` for `d29584f`.
Fixture 21 · services 3 · visual 22 · parity 237/237. Cleanup succeeded on attempt 1 with
**zero residue** and `authResidue: 0` (6 auth users, 7 games, 25 accent presets, 2 avatar
objects). Production untouched at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`, 19 days old.

Four new assertions ran against real services: the requester sees JOIN REMATCH pointing at
the accepted game; the running clock does not jump back across a refocus refetch while the
inactive seat holds at 300s; a premature timeout claim is refused with TIMEOUT_PENDING and
leaves the match byte-identical; and the shell cache key equals the build stamp on the
registration URL.

**The first hosted run failed, and it was worth the round trip.** The new service-worker
test caught that `vercel build` *sets* `VERCEL_GIT_COMMIT_SHA` to an empty string rather
than leaving it unset. An empty string is not nullish, so `??` passed it straight through
and the registration went out as `/sw.js?v=` — meaning every deployed build would have
resolved to the same `amordle-shell-dev` key and the cache fix would have been completely
inert in the only environment it exists for. Locally the variable is absent, `?.`
short-circuits, and the git-HEAD fallback runs, so nothing local could have surfaced it. No
service mutation occurred in that attempt; fixed in `d29584f` and re-run clean.

## 10. Open items

1. **The grey "11" is still unexplained.** `.attention-badge` is byte-identical back to the
   original TUI shell commit and all six named accents measure 5.67–11.09. The closest
   reachable thing in the codebase is the unread notification row, which is pale green under
   aurora with grey date and time — and which this pass fixed. Settling it needs either
   confirmation that the Alerts popover was open with that row highlighted, or the next
   screenshot, which will now carry a build stamp.
2. **A3 needs one reproduction.** Cancel is not the cause. Each remaining candidate now
   prints a distinct code on the panel.
3. **The timeout claim's settlement path is not hosted-proven.** The hosted suite proves the
   refusal path (a premature claim returns `TIMEOUT_PENDING` and leaves the match byte-identical).
   Proving the win would need either a five-minute wall-clock run or an e2e-only RPC that can
   rewind a match clock — a function with that power is a worse risk than the gap it closes.
4. **Coverage thresholds are configured but never run.** `vitest.config.ts` declares
   90/85/90/90 over `src/domain/**`, and no script passes `--coverage`; actual coverage is
   ~73% statements. Pre-existing, and the same "evidence that is not evidence" pattern as the
   dead clock module. Turning it on is its own piece of work.
