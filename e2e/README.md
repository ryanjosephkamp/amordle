# amordle E2E Suite

The Playwright suite exercises gameplay through the real browser app. Multiplayer
scenarios use two isolated browser contexts and Supabase-backed persistence.

## Commands

- `npm run test:e2e` runs all browser E2E tests.
- `npm run test:e2e:practice` runs tests tagged `@practice`.
- `npm run test:e2e:daily` runs tests tagged `@daily`.
- `npm run test:e2e:multiplayer` runs tests tagged `@multiplayer`.
- `npm run test:e2e:solo` runs tests tagged `@solo`.
- `npx playwright test e2e/gameplay/solo-practice-consumables-phase57.spec.ts` verifies guest Marketplace purchase plus durable OG/GO Solo Practice effects.
- `E2E_PHASE57_ECONOMY_AUTHORITY=enabled npx playwright test e2e/gameplay/solo-practice-consumables-phase57-authenticated.spec.ts` verifies signed-in bootstrap, pricing, ranges, idempotency/concurrency, privacy, cross-browser hydration, OG/GO effects, exclusions, mobile fit, and cleanup against the applied Phase 57 authority contract.
- `E2E_WORKERS=1 E2E_PHASE57_ECONOMY_AUTHORITY=enabled npx playwright test e2e/gameplay/live-v1-spectator.spec.ts` verifies active and terminal authenticated/public Live spectation, including privacy-safe pre-turn cancellation and post-turn forfeit labels with no mutation controls.
- `npx playwright test e2e/gameplay/practice-multiplayer-go.spec.ts -g "GO transitions"` runs one scenario.

## Environment

The suite reads local environment variables from the shell, `.env.local`, and
`.env`. Required variables:

- `VITE_SUPABASE_URL` or `E2E_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` or `E2E_SUPABASE_ANON_KEY`

Recommended for temporary user creation and cleanup:

- `SUPABASE_SERVICE_ROLE_KEY` or `E2E_SUPABASE_SERVICE_ROLE_KEY`

Never print, commit, or paste secret values. Test output should mention only
whether a credential is present.

## Resource Safety

Playwright runs with one worker by default because the remote Supabase project is
shared state. Keep tests short, prefer bounded polling over fixed sleeps, and
close browser contexts in fixtures.
