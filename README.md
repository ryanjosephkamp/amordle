# amordle

amordle (pronounced like “immortal”) is a Wordle and Hurdle hybrid with Solo, Daily, Practice, and authenticated Multiplayer play.

This repository is the clean-history successor to the locked `brrrdle-dev` functional shell. Its initial source foundation comes from the exact Golden Checkpoint `phase-58-final-functional-shell-golden-2026-07-13`, with user-visible branding changed to amordle and compatibility identifiers intentionally preserved.

## Current status

- Source foundation, tests, APIs, public assets, and all 41 ordered Supabase migrations are present.
- Guest/local behavior can be developed and tested without a configured backend.
- A dedicated Vercel project is linked to `ryanjosephkamp/amordle` and deployed at `https://amordle.vercel.app`.
- A dedicated Supabase project has been created, but linking, migration application, runtime configuration, and authority verification remain pending.
- Remote-authority and hosted-clone acceptance remain separately gated work.
- No license has been selected.

## Features

- Canonical Wordle-style tile coloring, including duplicate-letter handling.
- OG single-puzzle and GO chained-puzzle modes.
- Daily puzzles plus configurable Practice play.
- Guest progress, accounts/cloud-sync foundations, progression, Marketplace consumables, history, stats, definitions, and sharing.
- Practice and Daily Multiplayer, ranked modes, private requests, public profiles/leaderboards, and spectator foundations.
- Accessible keyboard and on-screen input, responsive layouts, sound preferences, and PWA foundations.

## Local setup

Use the locked dependency graph:

```bash
npm ci
npm run dev
```

Vite prints the local URL. Guest/local lanes do not require Supabase configuration.

To enable account or remote multiplayer behavior in a future independently authorized setup, copy `.env.example` to `.env.local` and provide only values from the dedicated amordle services. Never reuse, print, or commit credentials from another project.

## Verification

```bash
npm run lint
npm run test
npm run build
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.node.json
```

Browser scenarios that create authenticated users or durable multiplayer rows require the separately configured amordle Supabase project and process-scoped test credentials. See [e2e/README.md](e2e/README.md).

## Repository structure

- `src/` — application, domain logic, local word data, and unit/component tests.
- `api/` — Vercel-compatible serverless API handlers.
- `e2e/` — Playwright guest and authenticated browser scenarios.
- `public/` — manifest, icons, and service-worker assets.
- `supabase/migrations/` — the complete ordered 41-file migration history.
- `docs/` — contributor-facing deployment, Supabase, and ranked-multiplayer notes.

## Compatibility boundary

Some non-user-facing names still contain `brrrdle`, including database/schema names, migration filenames, storage keys, CSS hooks, test prefixes, word-dataset paths, and the existing service-worker filename/cache key. These are deliberate compatibility identifiers and should not be renamed casually.

## Security and privacy

- Never commit `.env` files, service-role keys, browser auth state, traces, screenshots, or deployment metadata.
- Browser code may receive only public Supabase URL/anon values.
- Privileged test credentials belong in process scope and must never be printed.
- Use temporary accounts and clean all remote test rows when authority-enabled E2E is eventually run.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Preserve tests and functional contracts; do not weaken behavior to make a copy or rebrand pass.

## License

No license has been selected. All rights remain reserved unless and until the repository owner explicitly adds a license.
