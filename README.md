# Amordle

Amordle is a client-rendered word game with local Solo play and Supabase-authoritative COMBAT. The application is intentionally developed private-first; the current production shell is not replaced by this branch.

## Runtime

- Node `24.18.0` (`.node-version`)
- pnpm `11.7.0`
- React 19, strict TypeScript, Vite 8
- Supabase Auth, Postgres, RLS, RPCs, and Realtime
- Vercel Functions, Cron, and environment-scoped Blob stores

Install dependencies with the repository-local store and start Vite:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are browser-exposed. Copy `.env.example` to ignored `.env.local` and provide real values without committing or logging them.

## Verification

```sh
pnpm verify:migrations
pnpm check
pnpm test:domain
pnpm test:browser
pnpm test:e2e:fixture
pnpm test:visual
pnpm build
```

`pnpm test:e2e:services` is a separate, serial, explicitly enabled suite. It uses disposable users and exact resource IDs, then requires zero residual Auth, database, and Preview Blob resources. It never targets Production Blob storage.

## Deployment boundary

Git-triggered Vercel deployments remain disabled. Preview deployments must use the protected Vercel URL and the Preview-scoped Blob token. Production deployment, default-branch changes, repository visibility changes, and migration application require separate authorization.
