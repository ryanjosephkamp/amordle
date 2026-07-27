# Amordle Terminal Greenfield Application Planning Prompt

Use the checked-out Amordle repository as the only writable workspace.

Read `AGENTS.md`, `bootstrap/BOOTSTRAP-INSTRUCTIONS.md`, and every other
top-level document in `bootstrap/` completely. Verify
`bootstrap/BUNDLE-MANIFEST.json` with
`node bootstrap/validate-bootstrap.mjs`.

Treat the locked `brrrdle-dev` repository at commit
`062624b2fb7c8d039a2eba3aec5b059c26628a11` and tag
`phase-58-final-functional-shell-golden-2026-07-13` as read-only behavioral
authority. Do not mutate its repository, deployment, Supabase data, or Vercel
configuration.

In Plan mode, produce one decision-complete end-to-end implementation plan for
the actual Amordle terminal greenfield application.

The plan must:

- implement every atomic item in `bootstrap/FUNCTIONAL-CONTRACT.md`;
- preserve `bootstrap/BACKEND-AND-SERVICES-CONTRACT.md`;
- satisfy `bootstrap/TESTING-AND-ACCEPTANCE-CONTRACT.md`;
- use the two-stage delivery in `bootstrap/PRODUCT-BRIEF.md`;
- research and pin official-current compatible versions of Node, pnpm,
  Next.js, React, TypeScript, shadcn/ui, Tailwind, Supabase JS, TanStack Query,
  Zod, Vitest, fast-check, Playwright, and accessibility tooling;
- use a pure-domain, typed-adapter, testability-first architecture;
- provide an early real interactive Solo and two-player multiplayer proof;
- provide protected Preview, screenshot, cleanup, checkpoint, rollback, and
  completion-report cadence;
- keep Production, the default branch, player data, Auth users, and the locked
  shell unchanged;
- avoid a standalone security program beyond the baseline protections in the
  constitution;
- distinguish Stage 1 functional completion from Stage 2 visual/editorial
  polish.

Inspect every reference image attached to the planning task and create a
decision-complete reference manifest. Do not treat any previous Amordle concept
as binding unless the user explicitly reintroduces it.

While planning, do not mutate source, migrations, services, Git,
configuration, previews, deployment, player data, Auth, or Production. Do not
install packages or inspect any Git stash.

Stop for user alignment and separate implementation authorization.
