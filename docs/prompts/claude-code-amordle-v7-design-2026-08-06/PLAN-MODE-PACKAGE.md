---
title: Amordle v7 Frontend Design Elevation — Plan-mode Package
status: plan-only-unactivated
prepared_at: 2026-08-06T03:20:00Z
workspace: /Users/noir/Documents/amordle-final
repository_mutation_authorized: false
service_mutation_authorized: false
deployment_authorized: false
merge_authorized: false
production_release_authorized: false
activation_requires: owner message invoking this exact package in Claude Code Plan mode
---

# Amordle v7 — Frontend Design Elevation

## What the owner asked for, in their words

> "Use your amazing front end design capabilities to upgrade this game… make the game
> look more professional, make it look more polished… while I appreciate the overall
> terminal aesthetic, this borders on being too rough aesthetically and too minimal…
> such that it can give the impression that it was not made with the tools that could
> have been used… I want to keep the same overall layout, same page order… I don't want
> it to look like it was vibe coded or like it was generated as some sort of AI slop."

The owner has little frontend experience and is explicitly asking for taste and judgement,
explained in plain language. They want to be shown options, not handed jargon.

## Decisions the owner already made (2026-08-06)

| Question      | Decision                                                                                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design target | **All three, sequenced**: (1) refinement of the existing terminal look to a professional standard, (2) warmth and depth, (3) motion and responsiveness   |
| Autonomy      | **Plan mode first**, then gated execution — audit and concepts, owner approves direction, then phase-by-phase with a Preview and approval after each     |
| Tech stack    | **Recommend after the audit.** Do not pre-commit to a stack change; assess whether the existing CSS can carry a real design system and present tradeoffs |

Phasing the owner expects:

1. **Foundations** — type scale, spacing rhythm, colour and elevation tokens
2. **Surfaces** — cards, tables, dialogs, forms, navigation
3. **Motion and states** — transitions, loading, empty, error

## Starting state (revalidate before trusting)

- Repository: `ryanjosephkamp/amordle` (private)
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- **Accepted revert point: tag `amordle-v6.7-accepted-revert-point-2026-08-06` → `740ca5e`**
- Tested build tag: `amordle-stage2-v6.7-owner-feedback-polish-golden-2026-08-05` → `afd48b6`
- Accepted Preview: `dpl_AL4UNa59TdXhmMn8ek2rBu6oMGrR`
- Frozen Production: `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` (untouched, do not deploy)
- Supabase `squqdstdvbsvhagfuzgj`: **53 synchronized migrations** = 45 immutable + 8
  authorized additive
- Acceptance: 107/107 bootstrap baseline · 237/237 functional clauses · 73/73 multiplayer
  audit · exactly 3 HTTP interfaces

The default branch `bootstrap/greenfield-2026-07-20` is an **unrelated history** by design
(`D-002`). Do not attempt a merge. See `CONTINUITY-LOG.md` for the full reasoning.

## Absolutely must not change

The owner was emphatic. Breaking any of these is a stop condition, not a tradeoff.

- **Game mechanics.** Scoring, validation order, duplicate-letter algorithm, Hard Mode
  evidence, GO budgets and chains, Daily selection, terminal precedence, Elo, economy,
  matchmaking, settlement, persistence envelopes.
- **The keyboard.** The owner called it "outstanding". Do not redesign it.
- **Tile and evidence colours.** Correct / present / absent / removed semantics are
  accepted and load-bearing. Do not restyle them for aesthetics.
- **Layout, page order, routes, information architecture.** "The structure of the site
  works effectively."
- **Answer, identity, and privacy boundaries.** No unsolved answer, raw Auth ID, email, or
  private projection may become newly visible.
- **The 45 immutable migrations, the 107-file bootstrap baseline** (which includes
  `README.md` and `bootstrap/DECISION-LEDGER.md` — editing either fails
  `verify:bootstrap`), **and exactly three HTTP interfaces.**
- **Production and the locked BRRRDLE-DEV shell.**

Backend changes are permitted only where genuinely necessary, with a separate decision
packet — the owner considers the backend fine.

## What "professional" means here, concretely

The owner's complaint is craft, not concept. Useful framing for the audit:

- The terminal aesthetic is **kept**. The goal is the difference between a terminal UI
  that was assembled and one that was _designed_ — same family, far better execution.
- Reject anything that reads as generic AI output: gradient-heavy hero sections, purple
  blur blobs, rounded-everything card soup, emoji as iconography, decorative motion.
- Restraint is the house style. Improvements should feel inevitable rather than applied.

## Plan-mode deliverables

Produce **one decision-complete plan**, plus a **visual concept the owner can actually
look at**. They asked to be shown ideas, and prose alone will not serve someone without
frontend experience.

1. **Design audit, in plain language.** What specifically reads as unpolished and why.
   Ground every claim in the real source — count the actual type sizes, spacing values,
   and border treatments in `src/app/globals.css` and `src/app/tui-shell.css` rather than
   asserting. Name routes and elements.
2. **Visual concepts.** Publish an Artifact showing before/after treatments for at least
   the type scale, spacing rhythm, surface elevation, and one real screen. Static HTML/CSS
   reproductions are fine — this is a proposal, not an implementation.
3. **Stack recommendation with tradeoffs.** The app is ~5,500 lines of plain CSS across
   two stylesheets, plus Tailwind v4 present but barely used, plus a `context` cascade
   layer added in v6.7. Assess honestly whether a design-token system, a headless
   primitive library, or consolidation earns its re-verification cost against 237 clauses.
   A recommendation to change nothing is a legitimate outcome.
4. **Phased execution plan** matching the owner's three phases, each with its own scope,
   risk, test strategy, Preview, and approval gate.
5. **Regression strategy.** Which existing tests protect gameplay, and what new visual
   evidence is needed. Note that v6.7 added an exhaustive control-contrast sweep in
   `tests/e2e/visual.responsive.spec.ts` — any colour or surface change must keep it green
   across every route × scheme × accent × interaction state.

## Verification the later execution must retain

`pnpm check` · `test:domain` · `test:browser` · `test:e2e:fixture` · `test:e2e:services` ·
`test:visual` · `test:acceptance:local` · `test:acceptance`

Plus, specific to design work:

- the control-contrast sweep stays at zero failures;
- no horizontal document overflow at 320/360/390/412/768/960/1440/1920;
- 200% zoom, forced colors, and reduced motion remain usable;
- key-to-tile response stays under 100 ms p95;
- mobile LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1 on the protected Preview;
- bundle budgets hold. **Note:** `verify:budgets` currently reports `0B JS/0B CSS` for
  both routes, so it is not actually measuring — fixing that is a reasonable early task if
  this cycle changes CSS volume.

## Known open items carried forward

1. `W-11` has no end-to-end _settled_ proof for the untimed ranked Practice leaderboard
   lane. The repair is applied and verified against the remote schema, but the hosted
   suite settles only a timed Practice match and a Daily match.
2. `verify:budgets` reports `0B` for both routes.

## Stop conditions

Repository/service/deployment drift · any change that would alter game mechanics,
keyboard behaviour, or evidence colour semantics · answer, identity, or private-data
exposure · a required migration, new HTTP interface, provider change, or paid capability ·
bootstrap baseline or immutable migration modification · contrast sweep or acceptance
regression that cannot be resolved · anything requiring merge or Production release.

## Activation

Plan mode only. Read the package and the real source, audit the current design, publish
visual concepts, and return one decision-complete phased plan. Change nothing.
