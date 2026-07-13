# Contributing to Awordle

Keep changes small, reviewable, and tied to an explicitly approved scope.

## Before changing source

- Preserve canonical gameplay, persistence, privacy, scoring, and multiplayer behavior.
- Treat the 41 migration files as an ordered compatibility history; never edit an applied migration casually.
- Preserve intentional `brrrdle` compatibility identifiers unless a separate migration/rename plan is approved.
- Do not add or upgrade dependencies, change frameworks, provision services, or deploy without explicit authorization.

## Verification

Run the relevant focused tests, then:

```bash
npm run lint
npm run test
npm run build
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.node.json
```

Use Playwright guest/local lanes when they do not require external services. Authority-enabled scenarios require the dedicated Awordle test environment and strict temporary-user/row cleanup.

## Safety

Never commit secrets, `.env` files, auth state, screenshots, traces, videos, test output, `.vercel`, or `supabase/.temp`. Do not copy credentials or private data from the locked reference product or any existing service.

## License

No license has been selected. Contributions do not imply a license grant beyond terms explicitly agreed with the repository owner.
