# amordle Deployment Notes

## Current state

The dedicated Vercel project is linked only to `ryanjosephkamp/amordle` and deployed at `https://amordle.vercel.app`. The deployment preserves the source-compatible Vite and Vercel configuration copied from the locked functional checkpoint. Supabase environment mapping, cron/Blob secrets, hosted authority verification, and functional-clone acceptance remain separately gated.

Do not reuse or modify any existing product’s Vercel project, environment variables, Blob store, cron secret, domains, or deployment state.

## Remaining independent setup

When separately authorized:

1. Reverify the dedicated amordle Vercel project identity before every configuration write.
2. Configure the dedicated amordle public Supabase URL/publishable values under the exact Vite and server aliases in `.env.example`.
3. Generate distinct amordle values for `CRON_SECRET` and Vercel Blob if those features are retained.
4. Build and verify preview behavior before any production decision.
5. Confirm auth redirects, API authorization, cron authorization, Blob fallback behavior, PWA assets, and privacy boundaries.

Never place service-role credentials in `VITE_*` variables. Keep privileged credentials in server/process scope only and never print them.

## Existing compatibility assets

The source still registers `/brrrdle-sw.js` and uses the internal cache key `brrrdle-shell-v1`. Those non-user-facing names are intentionally preserved during source parity. The installed product name and accessible icon labels are amordle.
