# Awordle Deployment Notes

## Current state

Awordle has not been linked to or deployed through Vercel. The repository contains source-compatible Vite and Vercel configuration copied from the locked functional checkpoint, but provisioning and deployment require separate authorization.

Do not reuse or modify any existing product’s Vercel project, environment variables, Blob store, cron secret, domains, or deployment state.

## Intended independent setup

When separately authorized:

1. Create a new Vercel project linked only to `ryanjosephkamp/awordle`.
2. Verify the project identity before every configuration write.
3. Configure the dedicated Awordle public Supabase URL/anon values.
4. Generate distinct Awordle values for `CRON_SECRET` and Vercel Blob if those features are retained.
5. Build and verify preview behavior before any production decision.
6. Confirm auth redirects, API authorization, cron authorization, Blob fallback behavior, PWA assets, and privacy boundaries.

Never place service-role credentials in `VITE_*` variables. Keep privileged credentials in server/process scope only and never print them.

## Existing compatibility assets

The source still registers `/brrrdle-sw.js` and uses the internal cache key `brrrdle-shell-v1`. Those non-user-facing names are intentionally preserved during source parity. The installed product name and accessible icon labels are Awordle.
